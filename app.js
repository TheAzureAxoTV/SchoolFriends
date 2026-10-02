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
  apiKey: "AIzaSyD...", // Your API Key
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

// DOM Elements
const authSection = document.getElementById('authSection');
const mainAppSection = document.getElementById('mainAppSection');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const chatBox = document.getElementById('chatBox');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const imageInput = document.getElementById('imageInput');
const ownerConsoleBtn = document.getElementById('ownerConsoleBtn');
const consoleModal = document.getElementById('consoleModal');
const consoleInput = document.getElementById('consoleInput');
const consoleOutput = document.getElementById('consoleOutput');

// Sign-In Redirect Handler
getRedirectResult(auth).catch(console.error);

if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', () => {
    signInWithRedirect(auth, provider);
  });
}

// Convert image to Base64
if (imageInput) {
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        selectedImageBase64 = reader.result;
      };
      reader.readAsDataURL(file);
    }
  });
}

// Send Chat Message
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text && !selectedImageBase64) return;

  sendBtn.disabled = true;
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

    messageInput.value = "";
    selectedImageBase64 = "";
    if (imageInput) imageInput.value = "";
    loadMessages();
  } catch (err) {
    alert("Failed to send message: " + err.message);
  } finally {
    sendBtn.disabled = false;
  }
}

if (sendBtn) sendBtn.addEventListener('click', sendMessage);

// Load Messages
async function loadMessages() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/messages`);
    const messages = await res.json();
    
    if (chatBox) {
      chatBox.innerHTML = messages.map(msg => `
        <div class="mb-3 p-2 bg-slate-800 rounded-lg">
          <div class="text-xs text-indigo-400 font-bold">${msg.username}</div>
          ${msg.text ? `<div class="text-white text-sm mt-1">${msg.text}</div>` : ''}
          ${msg.image ? `<img src="${msg.image}" class="mt-2 max-h-48 rounded" />` : ''}
        </div>
      `).join('');
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  } catch (e) {
    console.error("Load messages error:", e);
  }
}

// Owner Terminal Command
if (consoleInput) {
  consoleInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const command = consoleInput.value;
      consoleInput.value = "";
      
      const res = await fetch(`${API_BASE_URL}/api/admin/console`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, command })
      });
      const data = await res.json();
      consoleOutput.innerText += `\n> ${command}\n${data.output || data.error}`;
    }
  });
}

// Auth State Listener
onAuthStateChanged(auth, async (user) => {
  if (user) {
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

    if (authSection) authSection.classList.add('hidden');
    if (mainAppSection) mainAppSection.classList.remove('hidden');
    if (currentUser.role === 'OWNER' && ownerConsoleBtn) {
      ownerConsoleBtn.classList.remove('hidden');
    }

    loadMessages();
    setInterval(loadMessages, 3000); // Auto refresh chat every 3 seconds
  } else {
    if (authSection) authSection.classList.remove('hidden');
    if (mainAppSection) mainAppSection.classList.add('hidden');
  }
});
