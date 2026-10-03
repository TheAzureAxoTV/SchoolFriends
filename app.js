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

// YOUR FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
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

let currentUser = null;
let unsubscribeMessages = null;
const activeChannel = "general-chat";

// Helper: Escape HTML to prevent XSS
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Monitor Auth State
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    userName.textContent = user.displayName || user.email.split("@")[0];
    userAvatar.src = user.photoURL || "logo10_3_1188.png";
    loadChannelMessages(activeChannel);
  } else {
    window.location.href = "login.html"; // Redirect if not authenticated
  }
});

// Logout Handler
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    signOut(auth).then(() => {
      window.location.href = "login.html";
    });
  });
}

// LOAD MESSAGES (ALL ALIGNED TO THE RIGHT)
function loadChannelMessages(channelId) {
  if (unsubscribeMessages) unsubscribeMessages();

  chatBox.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full text-slate-500 text-xs gap-2">
      <i class="fa-solid fa-circle-notch animate-spin text-lg text-indigo-400"></i>
      <span>Loading channel messages...</span>
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
          <p class="font-bold text-slate-200 text-sm">No messages here yet!</p>
          <p class="text-slate-400 text-xs">Send the first SMS in general-chat.</p>
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
      // flex-row-reverse aligns both avatar and message bubble to the right
      msgDiv.className = "flex gap-3 items-start flex-row-reverse w-full";

      const avatarSrc = msg.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.userName || 'User')}`;

      msgDiv.innerHTML = `
        <img src="${avatarSrc}" class="w-8 h-8 rounded-xl object-cover shrink-0 border border-slate-700 bg-slate-800 shadow-sm" alt="Avatar"/>
        <div class="flex flex-col items-end max-w-[82%] sm:max-w-[70%]">
          <div class="flex items-center gap-2 mb-1 px-1 flex-row-reverse">
            <span class="text-[11px] font-bold text-slate-300">${escapeHtml(msg.userName || "User")}</span>
            <span class="text-[9px] text-slate-500">${timeStr}</span>
          </div>
          ${msg.image ? `<img src="${msg.image}" class="rounded-2xl max-h-60 object-cover mb-1.5 border border-slate-800 shadow-lg" />` : ''}
          ${msg.text ? `
            <div class="px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed break-words bg-indigo-600 text-white rounded-tr-xs shadow-md shadow-indigo-950/40">
              ${escapeHtml(msg.text)}
            </div>
          ` : ''}
        </div>
      `;

      chatBox.appendChild(msgDiv);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
  }, (err) => {
    console.error("Firestore error:", err);
  });
}

// SEND MESSAGE HANDLER
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
