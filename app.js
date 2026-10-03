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
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBkHqLMsR_UR_NeRaaGb-0c5MRrWzy3w6Y",
  authDomain: "schoolfriends-dev.firebaseapp.com",
  projectId: "schoolfriends-dev",
  storageBucket: "schoolfriends-dev.firebasestorage.app",
  messagingSenderId: "807033346729",
  appId: "1:807033346729:web:46f85493518ec60608e7b8",
  measurementId: "G-P1SRDNQ9PE"
};

const OWNER_EMAILS = ["itsazureaxotv@gmail.com"];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Server Channels Definition using Graphic Assets
const serverChannels = [
  {
    id: "general-chat",
    name: "General Chat",
    desc: "Main community chatter",
    icon: "1000588420.png"
  },
  {
    id: "announcements",
    name: "Announcements",
    desc: "Server news & updates",
    icon: "1000588423.png"
  },
  {
    id: "polls",
    name: "Polls & Voting",
    desc: "Community questions & votes",
    icon: "1000588422.png"
  }
];

let currentUser = null;
let userCustomProfile = { displayName: "", photoURL: "", bio: "" };
let activeChannel = "general-chat";
let unsubscribeMessages = null;
let attachedImageData = null;

// DOM Elements
const authSection = document.getElementById("authSection");
const mainAppSection = document.getElementById("mainAppSection");
const googleSignInBtn = document.getElementById("googleSignInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const authStatus = document.getElementById("authStatus");

const activeChannelTitle = document.getElementById("activeChannelTitle");
const headerChannelIcon = document.getElementById("headerChannelIcon");
const serverRailList = document.getElementById("serverRailList");
const sidebarChannelList = document.getElementById("sidebarChannelList");
const chatBox = document.getElementById("chatBox");

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const micBtn = document.getElementById("micBtn");

const imageInput = document.getElementById("imageInput");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const removeImageBtn = document.getElementById("removeImageBtn");

const openProfileBtn = document.getElementById("openProfileBtn");
const closeProfileBtn = document.getElementById("closeProfileBtn");
const profileModal = document.getElementById("profileModal");
const userAvatar = document.getElementById("userAvatar");
const modalProfileAvatar = document.getElementById("modalProfileAvatar");
const profileForm = document.getElementById("profileForm");
const editDisplayName = document.getElementById("editDisplayName");
const editPhotoURL = document.getElementById("editPhotoURL");
const editBio = document.getElementById("editBio");
const profileSaveStatus = document.getElementById("profileSaveStatus");

const toggleMenuBtn = document.getElementById("toggleMenuBtn");
const channelSidebar = document.getElementById("channelSidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

const ownerConsoleBtn = document.getElementById("ownerConsoleBtn");
const consoleModal = document.getElementById("consoleModal");
const closeConsoleBtn = document.getElementById("closeConsoleBtn");
const consoleInput = document.getElementById("consoleInput");
const consoleOutput = document.getElementById("consoleOutput");

// AUTH OBSERVER & SECURITY SYNC
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authSection.classList.add("hidden");
    mainAppSection.classList.remove("hidden");
    authStatus.innerText = "";

    // Restrict Terminal access strictly to owner email
    if (user.email && OWNER_EMAILS.includes(user.email.toLowerCase())) {
      ownerConsoleBtn.classList.remove("hidden");
      ownerConsoleBtn.classList.add("flex");
    } else {
      ownerConsoleBtn.classList.add("hidden");
      ownerConsoleBtn.classList.remove("flex");
    }

    await fetchUserProfile(user);
    renderServerRail();
    renderChannelSidebar();
    switchChannel(activeChannel);
  } else {
    currentUser = null;
    authSection.classList.remove("hidden");
    mainAppSection.classList.add("hidden");
    if (unsubscribeMessages) unsubscribeMessages();
  }
});

googleSignInBtn.addEventListener("click", async () => {
  authStatus.innerText = "Connecting to Google...";
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Auth error:", error);
    authStatus.innerText = `Sign-in failed: ${error.message}`;
  }
});

signOutBtn.addEventListener("click", () => signOut(auth));

async function fetchUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  try {
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
      userCustomProfile = docSnap.data();
    } else {
      userCustomProfile = {
        displayName: user.displayName || "Student",
        photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.uid)}`,
        bio: "Active Campus Member"
      };
      await setDoc(userRef, { ...userCustomProfile, email: user.email, uid: user.uid }, { merge: true });
    }
  } catch (err) {
    console.warn("Profile sync notice:", err);
    userCustomProfile = {
      displayName: user.displayName || "Student",
      photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.uid)}`,
      bio: "Active Campus Member"
    };
  }
  updateProfileUI();
}

function updateProfileUI() {
  const avatar = userCustomProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser ? currentUser.uid : "user")}`;
  userAvatar.src = avatar;
  modalProfileAvatar.src = avatar;

  editDisplayName.value = userCustomProfile.displayName || "";
  editPhotoURL.value = userCustomProfile.photoURL || "";
  editBio.value = userCustomProfile.bio || "";
}

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const newName = editDisplayName.value.trim() || "Student";
  const newPhoto = editPhotoURL.value.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser.uid)}`;
  const newBio = editBio.value.trim() || "Active Campus Member";

  profileSaveStatus.className = "text-[10px] text-center text-indigo-400 font-medium min-h-[1rem]";
  profileSaveStatus.innerText = "Saving profile...";

  userCustomProfile = {
    displayName: newName,
    photoURL: newPhoto,
    bio: newBio
  };

  try {
    await setDoc(doc(db, "users", currentUser.uid), {
      ...userCustomProfile,
      email: currentUser.email,
      uid: currentUser.uid,
      updatedAt: serverTimestamp()
    }, { merge: true });

    updateProfileUI();
    profileSaveStatus.className = "text-[10px] text-center text-emerald-400 font-medium min-h-[1rem]";
    profileSaveStatus.innerText = "Profile updated successfully!";
    setTimeout(() => {
      profileSaveStatus.innerText = "";
      profileModal.classList.add("hidden");
    }, 1200);
  } catch (err) {
    console.error("Profile update error:", err);
    profileSaveStatus.className = "text-[10px] text-center text-red-400 font-medium min-h-[1rem]";
    profileSaveStatus.innerText = "Failed to save: " + err.message;
  }
});

// RENDER NAV RAILS & SIDEBARS
function renderServerRail() {
  serverRailList.innerHTML = "";
  serverChannels.forEach((ch) => {
    const isActive = ch.id === activeChannel;
    const btn = document.createElement("button");
    btn.className = `w-11 h-11 rounded-2xl p-0.5 transition-all overflow-hidden relative group cursor-pointer border-2 ${
      isActive ? "border-indigo-500 shadow-md shadow-indigo-600/30 scale-105" : "border-transparent opacity-70 hover:opacity-100 hover:border-slate-700"
    }`;
    btn.title = ch.name;
    btn.onclick = () => switchChannel(ch.id);

    btn.innerHTML = `
      <img src="${ch.icon}" class="w-full h-full object-cover rounded-xl" alt="${ch.name}" />
    `;
    serverRailList.appendChild(btn);
  });
}

function renderChannelSidebar() {
  sidebarChannelList.innerHTML = "";
  serverChannels.forEach((ch) => {
    const isActive = ch.id === activeChannel;
    const btn = document.createElement("button");
    btn.className = `w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all cursor-pointer ${
      isActive 
        ? "bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/30" 
        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
    }`;
    btn.onclick = () => switchChannel(ch.id);

    btn.innerHTML = `
      <img src="${ch.icon}" class="w-6 h-6 rounded-lg object-cover border border-slate-700 shrink-0" alt="${ch.name}" />
      <div class="flex-1 truncate">
        <p class="text-xs truncate font-medium text-slate-200">${ch.name}</p>
        <p class="text-[10px] text-slate-500 truncate">${ch.desc}</p>
      </div>
      ${isActive ? '<div class="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></div>' : ''}
    `;
    sidebarChannelList.appendChild(btn);
  });
}

window.switchChannel = function(channelId) {
  activeChannel = channelId;
  const targetChannel = serverChannels.find(c => c.id === channelId) || serverChannels[0];
  
  activeChannelTitle.innerText = targetChannel.name;
  headerChannelIcon.src = targetChannel.icon;

  renderServerRail();
  renderChannelSidebar();
  loadChannelMessages(channelId);
  closeMobileDrawer();
};

// REAL-TIME MESSAGING
function loadChannelMessages(channelId) {
  if (unsubscribeMessages) unsubscribeMessages();

  chatBox.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full text-slate-500 text-xs gap-2">
      <i class="fa-solid fa-circle-notch animate-spin text-lg text-indigo-400"></i>
      <span>Loading messages...</span>
    </div>
  `;

  const q = query(
    collection(db, "channels", channelId, "messages"),
    orderBy("createdAt", "asc")
  );

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    chatBox.innerHTML = "";

    if (snapshot.empty) {
      const targetChannel = serverChannels.find(c => c.id === channelId) || serverChannels[0];
      chatBox.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-slate-500 text-xs text-center p-6 gap-2">
          <img src="${targetChannel.icon}" class="w-16 h-16 rounded-2xl object-cover border border-slate-800 shadow-xl mb-1" />
          <p class="font-bold text-slate-200 text-sm">Welcome to ${targetChannel.name}!</p>
          <p class="text-slate-400 text-xs">${targetChannel.desc}</p>
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
        <img src="${avatarSrc}" class="w-8 h-8 rounded-xl object-cover shrink-0 border border-slate-700 bg-slate-800 shadow-sm" alt="Avatar"/>
        <div class="flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[82%] sm:max-w-[70%]">
          <div class="flex items-center gap-2 mb-1 px-1">
            <span class="text-[11px] font-bold text-slate-300">${escapeHtml(msg.userName || "Student")}</span>
            <span class="text-[9px] text-slate-500">${timeStr}</span>
          </div>
          ${msg.image ? `<img src="${msg.image}" class="rounded-2xl max-h-60 object-cover mb-1.5 border border-slate-800 shadow-lg" />` : ''}
          ${msg.text ? `
            <div class="px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed break-words ${
              isMe 
                ? "bg-indigo-600 text-white rounded-tr-xs shadow-md shadow-indigo-950/40" 
                : "bg-[#12141d] text-slate-200 rounded-tl-xs border border-slate-800/80"
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
    console.error("Firestore read notice:", err);
    chatBox.innerHTML = `
      <div class="p-4 text-xs text-amber-400 bg-amber-500/10 rounded-xl border border-amber-500/20 text-center">
        Database connection syncing... Ensure your Firestore security rules permit reads.
      </div>
    `;
  });
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[m]);
}

// SEND MESSAGE HANDLERS
async function handleSendMessage() {
  const text = messageInput.value.trim();
  if (!text && !attachedImageData) return;
  if (!currentUser) return;

  const newMsg = {
    uid: currentUser.uid,
    userName: userCustomProfile.displayName || currentUser.displayName || "Student",
    photoURL: userCustomProfile.photoURL || currentUser.photoURL || "",
    text: text,
    image: attachedImageData || null,
    createdAt: serverTimestamp()
  };

  messageInput.value = "";
  clearImageAttachment();
  emojiPicker.classList.add("hidden");

  try {
    await addDoc(collection(db, "channels", activeChannel, "messages"), newMsg);
  } catch (err) {
    console.error("Error sending message:", err);
    alert("Failed to send message: " + err.message);
  }
}

sendBtn.addEventListener("click", handleSendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});

// EMOJI & MIC INTERACTIONS
emojiBtn.addEventListener("click", () => {
  emojiPicker.classList.toggle("hidden");
});

document.querySelectorAll(".emoji-option").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    messageInput.value += e.target.innerText;
    messageInput.focus();
  });
});

micBtn.addEventListener("click", () => {
  alert("Voice Note Feature: Click 'Allow' on your microphone prompt to record.");
});

// IMAGE ATTACHMENTS
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    alert("Please select an image smaller than 2MB.");
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

// PROFILE MODAL TOGGLES
openProfileBtn.addEventListener("click", () => profileModal.classList.remove("hidden"));
closeProfileBtn.addEventListener("click", () => profileModal.classList.add("hidden"));
profileModal.addEventListener("click", (e) => {
  if (e.target === profileModal) profileModal.classList.add("hidden");
});

// MOBILE SIDEBAR DRAWER
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

// ADMIN TERMINAL
ownerConsoleBtn.addEventListener("click", () => consoleModal.classList.remove("hidden"));
closeConsoleBtn.addEventListener("click", () => consoleModal.classList.add("hidden"));

consoleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const cmd = consoleInput.value.trim();
    consoleInput.value = "";
    if (!cmd) return;

    appendConsole(`> ${cmd}`);
    if (cmd === "/help") {
      appendConsole("Commands:\n/clear - Clear output\n/status - Auth info\n/channel - Active channel info");
    } else if (cmd === "/clear") {
      consoleOutput.innerText = "Welcome Admin Terminal!\n";
    } else if (cmd === "/status") {
      appendConsole(`Authenticated user: ${currentUser ? currentUser.email : "None"}`);
    } else if (cmd === "/channel") {
      appendConsole(`Active channel: ${activeChannel}`);
    } else {
      appendConsole(`Unknown command: ${cmd}. Type /help for assistance.`);
    }
  }
});

function appendConsole(msg) {
  consoleOutput.innerText += `\n${msg}`;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}
