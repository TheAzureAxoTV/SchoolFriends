import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithRedirect, 
  getRedirectResult, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyD...", // Make sure your real API Key is here!
  authDomain: "schoolfriends-dev.firebaseapp.com",
  projectId: "schoolfriends-dev",
  storageBucket: "schoolfriends-dev.appspot.com",
  messagingSenderId: "807033346729",
  appId: "1:807033346729:web:..."
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const API_BASE_URL = "https://schoolfriends-api.mukhopadhyaysudip3.workers.dev";

let currentUser = null;
let selectedImageBase64 = "";

// Handle Auth Redirect
getRedirectResult(auth).catch(console.error);

// Wait for DOM to load fully
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

  // Sign In Click
  if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', () => {
      signInWithRedirect(auth, provider);
    });
  }

  // Sign Out Click
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      signOut(auth).then(() => window.location.reload());
    });
  }

  // Image Attachment Handling
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

  // Terminal Console Modal Toggle
  if (ownerConsoleBtn && consoleModal) {
    ownerConsoleBtn.addEventListener('click', () => consoleModal.classList.remove('hidden'));
  }
  if (closeConsoleBtn && consoleModal) {
    closeConsoleBtn.addEventListener('click', () => consoleModal.classList.add('hidden'));
  }

  // Run Terminal Commands
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
          if (consoleOutput) consoleOutput.innerText += `\n> Error executing command\n`;
        }
      }
    });
  }

  // Send Message
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

  // Load Messages from API
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

  // Auth State Listener
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Force UI to show Main App immediately
      if (authSection) authSection.style.display = 'none';
      if (mainAppSection) mainAppSection.classList.remove('hidden');
      if (userAvatar && user.photoURL) userAvatar.src = user.photoURL;

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
        currentUser = data.user;

        if (currentUser && currentUser.role === 'OWNER' && ownerConsoleBtn) {
          ownerConsoleBtn.classList.remove('hidden');
        }

        loadMessages();
        setInterval(loadMessages, 3000);
      } catch (err) {
        console.error("DB Sync error:", err);
        // Fallback user object if DB worker is down
        currentUser = { id: user.email.split('@')[0], username: user.displayName };
      }
    } else {
      if (authSection) authSection.style.display = 'flex';
      if (mainAppSection) mainAppSection.classList.add('hidden');
    }
  });
});
