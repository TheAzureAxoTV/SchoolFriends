import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithRedirect, 
  getRedirectResult, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBkHqLMsR_UR_NeRaaGb-0c5MRrWzy3w6Y",
  authDomain: "schoolfriends-dev.firebaseapp.com",
  projectId: "schoolfriends-dev",
  storageBucket: "schoolfriends-dev.firebasestorage.app",
  messagingSenderId: "807033346729",
  appId: "1:807033346729:web:46f85493518ec60608e7b8",
  measurementId: "G-P1SRDNQ9PE"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const API_BASE_URL = "https://schoolfriends-api.mukhopadhyaysudip3.workers.dev";

let currentUser = null;
let selectedImageBase64 = "";
let messagePollTimer = null;

// Complete the Google redirect flow. The auth-state listener below is the
// source of truth for switching from the login screen to the app.
getRedirectResult(auth).catch((error) => {
  console.error("Google redirect error:", error);
  const code = error?.code || "";
  if (code === "auth/unauthorized-domain") {
    alert("This website is not authorized for Google sign-in. Add the current domain in Firebase Console → Authentication → Settings → Authorized domains.");
  } else if (code && code !== "auth/popup-closed-by-user") {
    alert(`Google sign-in failed: ${error.message || code}`);
  }
});

// DOM Event Handlers
document.addEventListener("DOMContentLoaded", () => {
  const authSection = document.getElementById('authSection');
  const mainAppSection = document.getElementById('mainAppSection');
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const userAvatar = document.getElementById('userAvatar');
  const chatBox = document.getElementById('chatBox');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const imageInput = document.getElementById('imageInput');
  const imagePreviewContainer = document.getElementById('imagePreviewContainer');
  const imagePreview = document.getElementById('imagePreview');
  const removeImageBtn = document.getElementById('removeImageBtn');
  const ownerConsoleBtn = document.getElementById('ownerConsoleBtn');
  const consoleModal = document.getElementById('consoleModal');
  const closeConsoleBtn = document.getElementById('closeConsoleBtn');
  const consoleInput = document.getElementById('consoleInput');
  const consoleOutput = document.getElementById('consoleOutput');

  if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', async () => {
      googleSignInBtn.disabled = true;
      googleSignInBtn.classList.add('opacity-70');
      try {
        await signInWithRedirect(auth, provider);
      } catch (error) {
        console.error("Google sign-in error:", error);
        googleSignInBtn.disabled = false;
        googleSignInBtn.classList.remove('opacity-70');
        alert(`Google sign-in failed: ${error.message || error.code || "Unknown error"}`);
      }
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => signOut(auth).then(() => window.location.reload()));
  }

  if (imageInput) {
    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          selectedImageBase64 = reader.result;
          if (imagePreview) imagePreview.src = selectedImageBase64;
          if (imagePreviewContainer) imagePreviewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (removeImageBtn) {
    removeImageBtn.addEventListener('click', () => {
      selectedImageBase64 = "";
      if (imageInput) imageInput.value = "";
      if (imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
    });
  }

  if (ownerConsoleBtn && consoleModal) {
    ownerConsoleBtn.addEventListener('click', () => consoleModal.classList.remove('hidden'));
  }
  if (closeConsoleBtn && consoleModal) {
    closeConsoleBtn.addEventListener('click', () => consoleModal.classList.add('hidden'));
  }

  if (consoleInput) {
    consoleInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const command = consoleInput.value.trim();
        if (!command) return;
        consoleInput.value = "";

        try {
          const res = await fetch(`${API_BASE_URL}/api/admin/console`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, command })
          });
          const data = await res.json();
          if (consoleOutput) {
            consoleOutput.innerText += `\n> ${command}\n${data.output || data.error}\n`;
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
          }
        } catch (err) {
          if (consoleOutput) consoleOutput.innerText += `\n> Error running command\n`;
        }
      }
    });
  }

  async function sendMessage() {
    const text = messageInput ? messageInput.value.trim() : "";
    if (!text && !selectedImageBase64) return;

    if (sendBtn) sendBtn.disabled = true;

    try {
      await fetch(`${API_BASE_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          text: text,
          image: selectedImageBase64
        })
      });

      if (messageInput) messageInput.value = "";
      selectedImageBase64 = "";
      if (imageInput) imageInput.value = "";
      if (imagePreviewContainer) imagePreviewContainer.classList.add('hidden');

      loadMessages();
    } catch (err) {
      alert("Error sending message: " + err.message);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  async function loadMessages() {
    if (!chatBox) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/messages`);
      const messages = await res.json();

      if (Array.isArray(messages)) {
        chatBox.innerHTML = messages.map(msg => `
          <div class="mb-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/50">
            <div class="text-xs font-semibold text-indigo-400 mb-1">${msg.username}</div>
            ${msg.text ? `<div class="text-slate-100 text-sm leading-relaxed">${msg.text}</div>` : ''}
            ${msg.image ? `<img src="${msg.image}" class="mt-2 max-h-48 rounded-lg object-cover" />` : ''}
          </div>
        `).join('');
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    } catch (err) {
      console.error("Error loading chat:", err);
    }
  }

  // Auth Listener: Hard Force Display Toggle
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Force UI switch
      if (authSection) authSection.style.setProperty('display', 'none', 'important');
      if (mainAppSection) mainAppSection.classList.remove('hidden');
      if (userAvatar && user.photoURL) userAvatar.src = user.photoURL;

      const userId = user.email ? user.email.split('@')[0] : 'user';
      currentUser = { id: userId, username: user.displayName || userId };

      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL
          })
        });

        const data = await res.json();
        if (data.user) {
          currentUser = data.user;
          if (currentUser.role === 'OWNER' && ownerConsoleBtn) {
            ownerConsoleBtn.classList.remove('hidden');
          }
        }
      } catch (err) {
        console.error("DB Sync error:", err);
      }

      loadMessages();
      if (messagePollTimer) clearInterval(messagePollTimer);
      messagePollTimer = setInterval(loadMessages, 3000);
    } else {
      currentUser = null;
      if (messagePollTimer) {
        clearInterval(messagePollTimer);
        messagePollTimer = null;
      }
      if (authSection) authSection.style.setProperty('display', 'flex', 'important');
      if (mainAppSection) mainAppSection.classList.add('hidden');
    }
  });
});
              
