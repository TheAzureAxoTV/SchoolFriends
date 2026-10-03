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

// ======================================================
// 1. FIREBASE CONFIGURATION
// Replace values below with your Firebase project credentials
// ======================================================
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

// ======================================================
// 2. DOM ELEMENT REFERENCES
// ======================================================
const chatBox = document.getElementById("chatBox");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const imageInput = document.getElementById("imageInput");
const imagePreviewBar = document.getElementById("imagePreviewBar");
const previewImg = document.getElementById("previewImg");
const previewFileName = document.getElementById("previewFileName");
const removeImageBtn = document.getElementById("removeImageBtn");

const userName = document.getElementById("userName");
const userTag = document.getElementById("userTag");
const userAvatar = document.getElementById("userAvatar");
const logoutBtn = document.getElementById("logoutBtn");

const memberUserName = document.getElementById("memberUserName");
const memberUserAvatar = document.getElementById("memberUserAvatar");

const currentChannelTitle = document.getElementById("currentChannelTitle");
const currentChannelTopic = document.getElementById("currentChannelTopic");
const channelButtons = document.querySelectorAll(".channel-btn");

const toggleMenuBtn = document.getElementById("toggleMenuBtn");
const channelSidebar = document.getElementById("channelSidebar");
const mobileBackdrop = document.getElementById("mobileBackdrop");
const toggleMemberListBtn = document.getElementById("toggleMemberListBtn");
const memberSidebar = document.getElementById("memberSidebar");

// ======================================================
// 3. APPLICATION STATE
// ======================================================
let currentUser = null;
let unsubscribeMessages = null;
let activeChannel = "general-chat";
let base64ImageAttachment = null;

const channelTopics = {
  "general-chat": "General conversation for school friends",
  "announcements": "Official updates and server news",
  "polls": "Vote on class decisions and events",
  "gaming-zone": "LFG, Minecraft clips, and game discussion"
};

// ======================================================
// 4. UTILITY FUNCTIONS
// ======================================================
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function toggleMobileSidebar(open) {
  if (open) {
    channelSidebar.classList.remove("-translate-x-full");
    mobileBackdrop.classList.remove("hidden");
  } else {
    channelSidebar.classList.add("-translate-x-full");
    mobileBackdrop.classList.add("hidden");
  }
}

// Convert uploaded image file to Base64 data URL
function handleImageSelect(file) {
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    base64ImageAttachment = e.target.result;
    previewImg.src = base64ImageAttachment;
    previewFileName.textContent = file.name;
    imagePreviewBar.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

function clearImageAttachment() {
  base64ImageAttachment = null;
  imageInput.value = "";
  previewImg.src = "";
  imagePreviewBar.classList.add("hidden");
}

// ======================================================
// 5. EVENT LISTENERS & NAVIGATION
// ======================================================
toggleMenuBtn?.addEventListener("click", () => toggleMobileSidebar(true));
mobileBackdrop?.addEventListener("click", () => toggleMobileSidebar(false));

toggleMemberListBtn?.addEventListener("click", () => {
  memberSidebar?.classList.toggle("hidden");
});

imageInput?.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) {
    handleImageSelect(e.target.files[0]);
  }
});

removeImageBtn?.addEventListener("click", clearImageAttachment);

// Handle Channel Switching
channelButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetChannel = btn.getAttribute("data-channel");
    if (!targetChannel || targetChannel === activeChannel) return;

    activeChannel = targetChannel;
    currentChannelTitle.textContent = activeChannel;
    if (currentChannelTopic) {
      currentChannelTopic.textContent = channelTopics[activeChannel] || "Discussion channel";
    }
    messageInput.placeholder = `Message #${activeChannel}`;

    // Update active UI styles on channels
    channelButtons.forEach((b) => {
      b.classList.remove("bg-discord-hover", "text-white");
      b.classList.add("hover:bg-discord-hover/50", "text-discord-muted");
    });
    btn.classList.add("bg-discord-hover", "text-white");
    btn.classList.remove("hover:bg-discord-hover/50", "text-discord-muted");

    toggleMobileSidebar(false);
    loadChannelMessages(activeChannel);
  });
});

// Auth Observer
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    const displayName = user.displayName || user.email.split("@")[0];
    
    if (userName) userName.textContent = displayName;
    if (userTag) userTag.textContent = `#${user.uid.substring(0, 4)}`;
    
    const avatar = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;
    if (userAvatar) userAvatar.src = avatar;

    if (memberUserName) memberUserName.textContent = displayName;
    if (memberUserAvatar) memberUserAvatar.src = avatar;

    loadChannelMessages(activeChannel);
  } else {
    // If auth state is missing, fallback graceful redirect
    console.warn("User not authenticated. Redirecting to login.html...");
    window.location.href = "login.html";
  }
});

// Logout Listener
logoutBtn?.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
});

// ======================================================
// 6. REALTIME CHAT ENGINE (FIRESTORE)
// ======================================================
function loadChannelMessages(channelId) {
  if (unsubscribeMessages) unsubscribeMessages();

  chatBox.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full text-discord-muted text-xs gap-3">
      <i class="fa-solid fa-circle-notch animate-spin text-2xl text-brand"></i>
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
        <div class="flex flex-col items-center justify-center h-full text-discord-muted text-xs text-center p-6 gap-3">
          <div class="w-14 h-14 rounded-full bg-discord-rail flex items-center justify-center text-brand text-2xl shadow-inner">
            <i class="fa-solid fa-hashtag"></i>
          </div>
          <p class="font-bold text-white text-lg">Welcome to #${channelId}!</p>
          <p class="text-discord-subtle text-xs max-w-sm">This is the start of the #${channelId} channel.</p>
        </div>
      `;
      return;
    }

    snapshot.forEach((docSnap) => {
      const msg = docSnap.data();
      const timeStr = msg.createdAt?.toDate 
        ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : "Just now";

      const isMe = currentUser && msg.uid === currentUser.uid;
      const msgDiv = document.createElement("div");
      
      // Right-aligned for current user, left-aligned for others
      msgDiv.className = `flex gap-3 items-start w-full animate-msg ${isMe ? 'flex-row-reverse' : ''}`;

      const avatarSrc = msg.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.userName || 'User')}`;

      msgDiv.innerHTML = `
        <img src="${avatarSrc}" class="w-9 h-9 rounded-full object-cover shrink-0 bg-discord-sidebar border border-discord-rail shadow-sm" alt="Avatar"/>
        <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%] sm:max-w-[70%]">
          <div class="flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}">
            <span class="text-xs font-bold text-white">${escapeHtml(msg.userName || "User")}</span>
            <span class="text-[10px] text-discord-subtle font-medium">${timeStr}</span>
          </div>
          ${msg.image ? `
            <div class="mb-1.5 overflow-hidden rounded-xl border border-discord-rail shadow-md max-w-sm">
              <img src="${msg.image}" class="max-h-64 w-full object-cover" alt="Attachment" />
            </div>
          ` : ''}
          ${msg.text ? `
            <div class="px-3.5 py-2 rounded-2xl text-xs sm:text-sm leading-relaxed break-words shadow-sm ${
              isMe 
                ? 'bg-brand text-white rounded-tr-none' 
                : 'bg-discord-input text-[#dbdee1] rounded-tl-none border border-discord-rail/50'
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
    console.error("Firestore Error:", err);
    chatBox.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-discord-rose text-xs gap-1">
        <i class="fa-solid fa-triangle-exclamation text-lg"></i>
        <span>Failed to load messages. Verify Firebase permissions.</span>
      </div>
    `;
  });
}

// Send Message Form Submit
messageForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();

  if ((!text && !base64ImageAttachment) || !currentUser) return;

  const payload = {
    text: text || "",
    image: base64ImageAttachment || null,
    uid: currentUser.uid,
    userName: currentUser.displayName || currentUser.email.split("@")[0],
    photoURL: currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser.uid)}`,
    createdAt: serverTimestamp()
  };

  messageInput.value = "";
  clearImageAttachment();

  try {
    await addDoc(collection(db, "channels", activeChannel, "messages"), payload);
  } catch (error) {
    console.error("Failed to send message:", error);
  }
});
  
