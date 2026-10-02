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
  apiKey: "AIzaSyD...", // Make sure your real API key is here
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

// Element Selectors
const googleSignInBtn = document.getElementById('googleSignInBtn');
const messageInput = document.querySelector('input[placeholder*="max 340 chars"]');
const sendBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Send');
const chatBoxContainer = messageInput ? messageInput.closest('.min-h-screen, body').querySelector('.rounded-lg:nth-child(2)') || messageInput.parentElement.previousElementSibling : null;

// Sign In Redirect
getRedirectResult(auth).catch(console.error);

if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', () => {
    signInWithRedirect(auth, provider);
  });
}

// Send Message Handler
async function sendMessage() {
  if (!messageInput || !currentUser) return;
  const text = messageInput.value.trim();
  if (!text && !selectedImageBase64) return;

  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        text: text,
        image: selectedImageBase64
      })
    });

    if (res.ok) {
      messageInput.value = "";
      selectedImageBase64 = "";
      loadMessages();
    }
  } catch (err) {
    console.error("Failed to send message:", err);
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

// Load Chat Messages
async function loadMessages() {
  if (!chatBoxContainer) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/messages`);
    const messages = await res.json();
    
    const messagesHTML = messages.map(msg => `
      <div class="mb-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/50">
        <div class="text-xs font-semibold text-indigo-400 mb-1">${msg.username}</div>
        ${msg.text ? `<div class="text-slate-100 text-sm leading-relaxed">${msg.text}</div>` : ''}
        ${msg.image ? `<img src="${msg.image}" class="mt-2 max-h-52 rounded-lg object-cover" />` : ''}
      </div>
    `).join('');

    chatBoxContainer.innerHTML = messagesHTML || `<div class="text-center text-slate-500 py-10 text-sm">No messages yet. Say hello!</div>`;
    chatBoxContainer.scrollTop = chatBoxContainer.scrollHeight;
  } catch (e) {
    console.error("Error loading chat messages:", e);
  }
}

// Auth State Monitor
onAuthStateChanged(auth, async (user) => {
  if (user) {
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

      loadMessages();
      setInterval(loadMessages, 3000); // Poll messages every 3 seconds
    } catch (e) {
      console.error("Auth sync error:", e);
    }
  }
});
  
