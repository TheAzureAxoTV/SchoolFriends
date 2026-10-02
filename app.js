// app.js - SchoolFriends Client Engine
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- FIREBASE CONFIGURATION ---
// Replace with your Firebase Project Configuration
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Cloudflare Worker API URL
const WORKER_API = "https://schoolfriends-api.mukhopadhyaysudip3.workers.dev";

// Local State
let currentUser = null;
let currentChannel = "general-lounge";
let selectedImageBase64 = null;
let messagePollInterval = null;

// --- DOM ELEMENTS ---
const authSection = document.getElementById("authSection");
const mainAppSection = document.getElementById("mainAppSection");
const googleSignInBtn = document.getElementById("googleSignInBtn");
const authStatus = document.getElementById("authStatus");
const signOutBtn = document.getElementById("signOutBtn");

const userAvatar = document.getElementById("userAvatar");
const openProfileBtn = document.getElementById("openProfileBtn");
const profileModal = document.getElementById("profileModal");
const closeProfileBtn = document.getElementById("closeProfileBtn");
const modalProfileAvatar = document.getElementById("modalProfileAvatar");
const modalProfileName = document.getElementById("modalProfileName");
const modalProfileTag = document.getElementById("modalProfileTag");
const modalProfileBio = document.getElementById("modalProfileBio");

const channelSidebar = document.getElementById("channelSidebar");
const toggleMenuBtn = document.getElementById("toggleMenuBtn");
const sidebarUserList = document.getElementById("sidebarUserList");
const directChatList = document.getElementById("directChatList");

const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const imageInput = document.getElementById("imageInput");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const removeImageBtn = document.getElementById("removeImageBtn");

const ownerConsoleBtn = document.getElementById("ownerConsoleBtn");
const consoleModal = document.getElementById("consoleModal");
const closeConsoleBtn = document.getElementById("closeConsoleBtn");
const consoleInput = document.getElementById("consoleInput");
const consoleOutput = document.getElementById("consoleOutput");

// --- INITIALIZATION & AUTH STATE ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    if (authSection) authSection.classList.add("hidden");
    if (mainAppSection) mainAppSection.classList.remove("hidden");

    // Update Profile Avatars
    const photo = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`;
    if (userAvatar) userAvatar.src = photo;
    if (modalProfileAvatar) modalProfileAvatar.src = photo;
    if (modalProfileName) modalProfileName.textContent = user.displayName || "Student User";
    if (modalProfileTag) modalProfileTag.textContent = user.email || "@student";

    // Sync with Worker Backend
    syncUserWithWorker(user);

    // Initialize Channels & Start Fetching Messages
    renderSidebarChannels();
    loadMessages();
    startMessagePolling();
  } else {
    currentUser = null;
    if (authSection) authSection.classList.remove("hidden");
    if (mainAppSection) mainAppSection.classList.add("hidden");
    stopMessagePolling();
  }
});

// --- GOOGLE SIGN IN HANDLER ---
googleSignInBtn?.addEventListener("click", async () => {
  if (authStatus) authStatus.textContent = "Connecting to Google...";
  const provider = new GoogleAuthProvider();

  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.warn("Popup blocked or failed, attempting redirect fallback...", error);
    try {
      await signInWithRedirect(auth, provider);
    } catch (fallbackError) {
      if (authStatus) authStatus.textContent = "Sign-in failed: " + fallbackError.message;
    }
  }
});

// --- SIGN OUT HANDLER ---
signOutBtn?.addEventListener("click", () => {
  signOut(auth);
});

// --- WORKER SYNC ---
async function syncUserWithWorker(user) {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${WORKER_API}/api/auth/sync`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      },
      body: JSON.stringify({
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        photoURL: user.photoURL
      })
    });
    
    const data = await res.json();
    if (data.role === "OWNER" || data.role === "ADMIN") {
      if (ownerConsoleBtn) ownerConsoleBtn.classList.remove("hidden");
    }
  } catch (err) {
    console.warn("Worker sync note: Running in client fallback mode.", err);
  }
}

// --- RENDER SIDEBAR CHANNELS & FRIENDS ---
function renderSidebarChannels() {
  if (!sidebarUserList) return;

  const defaultChannels = [
    { id: "general-lounge", name: "general-lounge", desc: "Campus discussions" },
    { id: "announcements", name: "announcements", desc: "Official updates" },
    { id: "gaming", name: "gaming-room", desc: "Gamers hangout" }
  ];

  sidebarUserList.innerHTML = defaultChannels.map(ch => `
    <button onclick="switchChannel('${ch.id}')" class="w-full p-2.5 rounded-xl flex items-center gap-3 hover:bg-slate-800/60 transition text-left ${ch.id === currentChannel ? 'bg-slate-800/80 border border-slate-700/50' : ''}">
      <div class="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-black text-xs">#</div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-bold text-slate-200 truncate">${ch.name}</p>
        <p class="text-[10px] text-slate-400 truncate">${ch.desc}</p>
      </div>
    </button>
  `).join("");

  // Direct chat icon quick list
  if (directChatList) {
    directChatList.innerHTML = `
      <button onclick="switchChannel('general-lounge')" class="relative group flex items-center justify-center">
        <div class="w-12 h-12 rounded-2xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold border border-indigo-500/40">
          #
        </div>
      </button>
    `;
  }
}

window.switchChannel = (channelId) => {
  currentChannel = channelId;
  const titleEl = document.getElementById("activeChannelTitle");
  if (titleEl) titleEl.textContent = channelId;
  
  // Close mobile sidebar on selection
  if (channelSidebar) channelSidebar.classList.add("hidden");
  renderSidebarChannels();
  loadMessages();
};

// --- MOBILE SIDEBAR TOGGLE ---
toggleMenuBtn?.addEventListener("click", () => {
  if (channelSidebar) {
    channelSidebar.classList.toggle("hidden");
  }
});

// --- MESSAGES SYSTEM ---
async function loadMessages() {
  if (!chatBox) return;

  try {
    const res = await fetch(`${WORKER_API}/api/messages?channel=${currentChannel}`);
    if (!res.ok) throw new Error("Failed to fetch");
    const messages = await res.json();
    renderMessages(messages);
  } catch (err) {
    // If backend endpoint is offline, show helpful state
    chatBox.innerHTML = `
      <div class="p-4 text-center text-slate-500 text-xs">
        <p class="font-semibold text-slate-400">Welcome to #${currentChannel}!</p>
        <p class="text-[11px] mt-1">Start the conversation by typing a message below.</p>
      </div>
    `;
  }
}

function renderMessages(messages) {
  if (!messages || messages.length === 0) {
    chatBox.innerHTML = `
      <div class="p-4 text-center text-slate-500 text-xs">
        <p class="font-semibold text-slate-400">No messages here yet.</p>
        <p class="text-[11px] mt-1">Be the first to say hello!</p>
      </div>
    `;
    return;
  }

  chatBox.innerHTML = messages.map(msg => `
    <div class="flex gap-3 group">
      <img src="${msg.photoURL || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full bg-slate-800 shrink-0 object-cover" alt="Avatar" />
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2">
          <span class="text-xs font-bold text-white">${escapeHtml(msg.senderName || 'Anonymous')}</span>
          <span class="text-[10px] text-slate-500">${new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        ${msg.text ? `<p class="text-xs text-slate-200 mt-1 leading-relaxed">${escapeHtml(msg.text)}</p>` : ''}
        ${msg.imageUrl ? `<img src="${msg.imageUrl}" class="mt-2 max-w-xs rounded-xl border border-slate-700 shadow-md max-h-60 object-cover" />` : ''}
      </div>
    </div>
  `).join("");

  chatBox.scrollTop = chatBox.scrollHeight;
}

// Send Message Action
async function sendMessage() {
  const text = messageInput?.value.trim();
  if (!text && !selectedImageBase64) return;

  const payload = {
    channel: currentChannel,
    text: text,
    imageUrl: selectedImageBase64,
    senderUid: currentUser?.uid,
    senderName: currentUser?.displayName || "Student",
    photoURL: currentUser?.photoURL,
    timestamp: Date.now()
  };

  // Reset Input
  if (messageInput) messageInput.value = "";
  clearImageAttachment();

  try {
    const idToken = await currentUser?.getIdToken();
    await fetch(`${WORKER_API}/api/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      },
      body: JSON.stringify(payload)
    });
    loadMessages();
  } catch (err) {
    console.error("Failed to send message:", err);
  }
}

sendBtn?.addEventListener("click", sendMessage);
messageInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// --- IMAGE ATTACHMENT HANDLER ---
imageInput?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    selectedImageBase64 = event.target.result;
    if (imagePreview) imagePreview.src = selectedImageBase64;
    if (imagePreviewContainer) imagePreviewContainer.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

removeImageBtn?.addEventListener("click", clearImageAttachment);

function clearImageAttachment() {
  selectedImageBase64 = null;
  if (imageInput) imageInput.value = "";
  if (imagePreviewContainer) imagePreviewContainer.classList.add("hidden");
}

// --- PROFILE MODAL MODAL HANDLERS ---
openProfileBtn?.addEventListener("click", () => {
  if (profileModal) profileModal.classList.remove("hidden");
});
closeProfileBtn?.addEventListener("click", () => {
  if (profileModal) profileModal.classList.add("hidden");
});

// --- TERMINAL CONSOLE HANDLERS ---
ownerConsoleBtn?.addEventListener("click", () => {
  if (consoleModal) consoleModal.classList.remove("hidden");
});
closeConsoleBtn?.addEventListener("click", () => {
  if (consoleModal) consoleModal.classList.add("hidden");
});

consoleInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    const cmd = consoleInput.value.trim();
    if (!cmd) return;
    consoleInput.value = "";

    if (consoleOutput) {
      consoleOutput.textContent += `\n> ${cmd}`;
      try {
        const idToken = await currentUser?.getIdToken();
        const res = await fetch(`${WORKER_API}/api/admin/console`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify({ command: cmd })
        });
        const data = await res.json();
        consoleOutput.textContent += `\n${data.output || JSON.stringify(data)}`;
      } catch (err) {
        consoleOutput.textContent += `\nError: Could not reach admin terminal.`;
      }
      consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
  }
});

// --- HELPERS ---
function startMessagePolling() {
  stopMessagePolling();
  messagePollInterval = setInterval(loadMessages, 4000);
}
function stopMessagePolling() {
  if (messagePollInterval) clearInterval(messagePollInterval);
}
function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
