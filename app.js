import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// YOUR FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const chatBox = document.getElementById("chatBox");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const userName = document.getElementById("userName");
const userAvatar = document.getElementById("userAvatar");
const logoutBtn = document.getElementById("logoutBtn");
const currentChannelTitle = document.getElementById("currentChannelTitle");
const channelButtons = document.querySelectorAll(".channel-btn");

let currentUser = null;
let unsubscribeMessages = null;
let activeChannel = "general-chat";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Authentication Check
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    userName.textContent = user.displayName || user.email.split("@")[0];
    userAvatar.src = user.photoURL || "logo10_3_1188.png";
    loadChannelMessages(activeChannel);
  } else {
    window.location.href = "login.html";
  }
});

// Logout Listener
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    signOut(auth).then(() => {
      window.location.href = "login.html";
    });
  });
}

// Switch Channels
channelButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetChannel = btn.getAttribute("data-channel");
    if (!targetChannel || targetChannel === activeChannel) return;

    activeChannel = targetChannel;
    currentChannelTitle.textContent = activeChannel;
    messageInput.placeholder = `Message #${activeChannel}`;

    channelButtons.forEach((b) => {
      b.classList.remove("bg-[#35373c]", "text-white");
      b.classList.add("hover:bg-[#35373c]/50", "text-[#949ba4]");
    });
    btn.classList.add("bg-[#35373c]", "text-white");
    btn.classList.remove("hover:bg-[#35373c]/50", "text-[#949ba4]");

    loadChannelMessages(activeChannel);
  });
});

// Load Channel Messages with Right Alignment
function loadChannelMessages(channelId) {
  if (unsubscribeMessages) unsubscribeMessages();

  chatBox.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full text-[#949ba4] text-xs gap-2">
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
        <div class="flex flex-col items-center justify-center h-full text-[#949ba4] text-xs text-center p-6 gap-2">
          <p class="font-bold text-white text-sm">Welcome to #${channelId}!</p>
          <p class="text-[#80848e] text-xs">This is the start of the #${channelId} channel.</p>
        </div>
      `;
      return;
    }

    snapshot.forEach((docSnap) => {
      const msg = docSnap.data();
      const timeStr = msg.createdAt?.toDate 
        ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : "Just now";

      const msgDiv = document.createElement("div");
      // flex-row-reverse aligns avatar and text container to the right
      msgDiv.className = "flex gap-3 items-start flex-row-reverse w-full";

      const avatarSrc = msg.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.userName || 'User')}`;

      msgDiv.innerHTML = `
        <img src="${avatarSrc}" class="w-8 h-8 rounded-full object-cover shrink-0 bg-[#2b2d31]" alt="Avatar"/>
        <div class="flex flex-col items-end max-w-[80%]">
          <div class="flex items-center gap-2 mb-1 flex-row-reverse">
            <span class="text-xs font-semibold text-white">${escapeHtml(msg.userName || "User")}</span>
            <span class="text-[10px] text-[#949ba4]">${timeStr}</span>
          </div>
          ${msg.image ? `<img src="${msg.image}" class="rounded-lg max-h-60 object-cover mb-1 border border-[#1e1f22]" />` : ''}
          ${msg.text ? `
            <div class="px-3.5 py-2 rounded-2xl text-xs sm:text-sm leading-relaxed break-words bg-[#5865f2] text-white shadow-sm">
              ${escapeHtml(msg.text)}
            </div>
          ` : ''}
        </div>
      `;

      chatBox.appendChild(msgDiv);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
  }, (err) => {
    console.error("Firestore read error:", err);
  });
}

// Send Message Handler
if (messageForm) {
  messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;

    messageInput.value = "";

    try {
      await addDoc(collection(db, "channels", activeChannel, "messages"), {
        text: text,
        uid: currentUser.uid,
        userName: currentUser.displayName || currentUser.email.split("@")[0],
        photoURL: currentUser.photoURL || "logo10_3_1188.png",
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  });
                       }
      
