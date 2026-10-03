import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  doc, 
  setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Your Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyBkHqLMsR_UR_NeRaaGb-0c5MRrWzy3w6Y",
  authDomain: "schoolfriends-dev.firebaseapp.com",
  projectId: "schoolfriends-dev",
  storageBucket: "schoolfriends-dev.firebasestorage.app",
  messagingSenderId: "807033346729",
  appId: "1:807033346729:web:46f85493518ec60608e7b8",
  measurementId: "G-P1SRDNQ9PE"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// App State
let currentUser = null;
let activeChannel = "general-lounge";
let unsubscribeMessages = null;
let attachedImageData = null;

// DOM Elements
const authSection = document.getElementById("authSection");
const mainAppSection = document.getElementById("mainAppSection");
const googleSignInBtn = document.getElementById("googleSignInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const authStatus = document.getElementById("authStatus");

const activeChannelTitle = document.getElementById("activeChannelTitle");
const sidebarUserList = document.getElementById("sidebarUserList");
const chatBox = document.getElementById("chatBox");

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const imageInput = document.getElementById("imageInput");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const removeImageBtn = document.getElementById("removeImageBtn");

const openProfileBtn = document.getElementById("openProfileBtn");
const closeProfileBtn = document.getElementById("closeProfileBtn");
const profileModal = document.getElementById("profileModal");
const userAvatar = document.getElementById("userAvatar");
const modalProfileAvatar = document.getElementById("modalProfileAvatar");
const modalProfileName = document.getElementById("modalProfileName");
const modalProfileTag = document.getElementById("modalProfileTag");

const toggleMenuBtn = document.getElementById("toggleMenuBtn");
const channelSidebar = document.getElementById("channelSidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

const ownerConsoleBtn = document.getElementById("ownerConsoleBtn");
const consoleModal = document.getElementById("consoleModal");
const closeConsoleBtn = document.getElementById("closeConsoleBtn");
const consoleInput = document.getElementById("consoleInput");
const consoleOutput = document.getElementById("consoleOutput");

const channels = [
  { id: "general-lounge", name: "general-lounge", desc: "Main campus talk" },
  { id: "announcements", name: "announcements", desc: "Official updates" },
  { id: "gaming-room", name: "gaming-room", desc: "Games & hangouts" },
  { id: "homework-help", name: "homework-help", desc: "Study & questions" }
];

// --- AUTH STATE OBSERVER ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authSection.classList.add("hidden");
    mainAppSection.classList.remove("hidden");
    authStatus.innerText = "";

    const avatarUrl = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.displayName || 'Student')}`;
    userAvatar.src = avatarUrl;
    modalProfileAvatar.src = avatarUrl;
    modalProfileName.innerText = user.displayName || "School Student";
    modalProfileTag.innerText = `@${(user.email || "student").split("@")[0]}`;

    try {
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        displayName: user.displayName || "Student",
        email: user.email,
        photoURL: avatarUrl,
        lastSeen: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn("User sync notice:", err.message);
    }

    renderChannels();
    loadChannelMessages(activeChannel);
  } else {
    currentUser = null;
    authSection.classList.remove("hidden");
    mainAppSection.classList.add("hidden");
    if (unsubscribeMessages) unsubscribeMessages();
  }
});

// Google Sign-In Action
googleSignInBtn.addEventListener("click", async () => {
  authStatus.innerText = "Connecting to Google Auth...";
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Auth error:", error);
    authStatus.innerText = `Sign-in failed: ${error.message}`;
  }
});

// Sign Out Action
signOutBtn.addEventListener("click", () => signOut(auth));

// --- RENDER SIDEBAR CHANNELS ---
function renderChannels() {
  sidebarUserList.innerHTML = "";

  channels.forEach((ch) => {
    const isActive = ch.id === activeChannel;
    const btn = document.createElement("button");
    btn.className = `w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all ${
      isActive 
        ? "bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/30" 
        : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
    }`;
    btn.onclick = () => switchChannel(ch.id);

    btn.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">#</div>
      <div class="flex-1 truncate">
        <p class="text-xs truncate font-medium text-slate-200">${ch.name}</p>
        <p class="text-[10px] text-slate-500 truncate">${ch.desc}</p>
      </div>
      ${isActive ? '<div class="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></div>' : ''}
    `;
    sidebarUserList.appendChild(btn);
  });
}

window.switchChannel = function(channelId) {
  activeChannel = channelId;
  activeChannelTitle.innerText = channelId;
  renderChannels();
  loadChannelMessages(channelId);
  closeMobileDrawer();
};

// --- REAL-TIME FIRESTORE MESSAGING ---
function loadChannelMessages(channelId) {
  if (unsubscribeMessages) unsubscribeMessages();

  chatBox.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full text-slate-500 text-xs gap-2">
      <i class="fa-solid fa-circle-notch animate-spin text-lg text-indigo-400"></i>
      <span>Loading #${channelId}...</span>
    </div>
  `;

  const q = query(
    collection(db, "channels", channelId, "messages"),
    orderBy("createdAt", "asc")
  );

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    chatBox.innerHTML = "";

    if (snapshot.empty) {
      chatBox.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-slate-500 text-xs text-center p-6 gap-2">
          <div class="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xl border border-indigo-500/20 mb-1">#</div>
          <p class="font-bold text-slate-300 text-sm">Welcome to #${channelId}!</p>
          <p class="text-slate-500">Be the first to leave a message in this channel.</p>
        </div>
      `;
      return;
    }

    snapshot.forEach((docSnap) => {
      const msg = docSnap.data();
      const isMe = currentUser && msg.uid === currentUser.uid;
      const timeStr = msg.createdAt?.toDate 
        ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : "Just now";

      const msgDiv = document.createElement("div");
      msgDiv.className = `flex gap-3 items-start ${isMe ? "flex-row-reverse" : ""}`;

      const avatarSrc = msg.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.userName || 'User')}`;

      msgDiv.innerHTML = `
        <img src="${avatarSrc}" class="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-700 bg-slate-800" alt="Avatar"/>
        <div class="flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[80%] sm:max-w-[70%]">
          <div class="flex items-center gap-2 mb-1 px-0.5">
            <span class="text-[11px] font-bold text-slate-300">${msg.userName || "Student"}</span>
            <span class="text-[9px] text-slate-500">${timeStr}</span>
          </div>
          ${msg.image ? `<img src="${msg.image}" class="rounded-2xl max-h-60 object-cover mb-1 border border-slate-700 shadow-md" />` : ''}
          ${msg.text ? `
            <div class="px-3.5 py-2 rounded-2xl text-xs sm:text-sm leading-relaxed ${
              isMe 
                ? "bg-indigo-600 text-white rounded-tr-xs shadow-md" 
                : "bg-[#12141c] text-slate-200 rounded-tl-xs border border-slate-800/80"
            }">
              ${escapeHtml(msg.text)}
            </div>
          ` : ''}
        </div>
      `;

      chatBox.appendChild(msgDiv);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
  }, (err) => {
    console.error("Firestore message listener error:", err);
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[m]);
}

// --- SEND MESSAGE ---
async function handleSendMessage() {
  const text = messageInput.value.trim();
  if (!text && !attachedImageData) return;
  if (!currentUser) return;

  const newMsg = {
    uid: currentUser.uid,
    userName: currentUser.displayName || "Student",
    photoURL: currentUser.photoURL || "",
    text: text,
    image: attachedImageData || null,
    createdAt: serverTimestamp()
  };

  messageInput.value = "";
  clearImageAttachment();

  try {
    await addDoc(collection(db, "channels", activeChannel, "messages"), newMsg);
  } catch (err) {
    console.error("Error sending message:", err);
  }
}

sendBtn.addEventListener("click", handleSendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});

// --- IMAGE ATTACHMENT ---
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    alert("Image size should be under 2MB.");
    imageInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (evt) => {
    attachedImageData = evt.target.result;
    imagePreview.src = attachedImageData;
    imagePreviewContainer.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

removeImageBtn.addEventListener("click", clearImageAttachment);

function clearImageAttachment() {
  attachedImageData = null;
  imageInput.value = "";
  imagePreviewContainer.classList.add("hidden");
  imagePreview.src = "";
}

// --- MOBILE DRAWER TOGGLE ---
toggleMenuBtn.addEventListener("click", openMobileDrawer);
sidebarOverlay.addEventListener("click", closeMobileDrawer);

function openMobileDrawer() {
  channelSidebar.classList.remove("-translate-x-full");
  sidebarOverlay.classList.remove("hidden");
}

function closeMobileDrawer() {
  channelSidebar.classList.add("-translate-x-full");
  sidebarOverlay.classList.add("hidden");
}

// --- PROFILE & CONSOLE MODALS ---
openProfileBtn.addEventListener("click", () => profileModal.classList.remove("hidden"));
closeProfileBtn.addEventListener("click", () => profileModal.classList.add("hidden"));

ownerConsoleBtn.addEventListener("click", () => consoleModal.classList.remove("hidden"));
closeConsoleBtn.addEventListener("click", () => consoleModal.classList.add("hidden"));

consoleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const cmd = consoleInput.value.trim();
    consoleInput.value = "";
    if (!cmd) return;

    appendConsole(`> ${cmd}`);
    if (cmd === "/help") {
      appendConsole("Available commands:\n/clear - Clear screen\n/status - User details\n/channel - Current space");
    } else if (cmd === "/clear") {
      consoleOutput.innerText = "Welcome Admin Terminal!\n";
    } else if (cmd === "/status") {
      appendConsole(`Authenticated user: ${currentUser ? currentUser.email : "Guest"}`);
    } else if (cmd === "/channel") {
      appendConsole(`Active channel: #${activeChannel}`);
    } else {
      appendConsole(`Unknown command: ${cmd}`);
    }
  }
});

function appendConsole(msg) {
  consoleOutput.innerText += `\n${msg}`;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }
   
