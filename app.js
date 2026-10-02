// app.js - SchoolFriends Frontend Core Engine
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// YOUR FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyBkHqLMsR_UR_NeRaaGb-0c5MRrWzy3w6Y",
  authDomain: "schoolfriends-dev.firebaseapp.com",
  projectId: "schoolfriends-dev",
  storageBucket: "schoolfriends-dev.firebasestorage.app",
  messagingSenderId: "807033346729",
  appId: "1:807033346729:web:46f85493518ec60608e7b8",
  measurementId: "G-P1SRDNQ9PE"
};

// YOUR CLOUDFLARE WORKER ENDPOINT
const API_BASE_URL = "https://schoolfriends-api.mukhopadhyaysudip3.workers.dev";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// DOM Elements
const googleSignInBtn = document.getElementById('googleSignInBtn');
const authCard = document.getElementById('authCard');
const chatSection = document.getElementById('chatSection');
const userAvatar = document.getElementById('userAvatar');
const ownerConsoleBtn = document.getElementById('ownerConsoleBtn');

let currentUserToken = null;
let userRole = 'MEMBER';

// LISTEN FOR AUTH STATE CHANGES
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Get Firebase ID Token
    currentUserToken = await user.getIdToken();
    
    // Sync User with Cloudflare Worker API & D1
    await syncUserWithBackend(user, currentUserToken);

    // Update UI Elements
    if (userAvatar) {
      userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=4f46e5&color=fff`;
    }
    if (authCard) authCard.classList.add('hidden');
    if (chatSection) chatSection.classList.remove('hidden');

  } else {
    // Logged Out View
    if (authCard) authCard.classList.remove('hidden');
    if (chatSection) chatSection.classList.add('hidden');
    if (ownerConsoleBtn) ownerConsoleBtn.classList.add('hidden');
  }
});

// GOOGLE SIGN-IN CLICK HANDLER
if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', async () => {
    try {
      googleSignInBtn.innerText = "Signing in...";
      googleSignInBtn.disabled = true;
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Authentication Error:", error);
      alert("Sign in failed: " + error.message);
    } finally {
      googleSignInBtn.innerHTML = `
        <svg class="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span>Continue with Google</span>`;
      googleSignInBtn.disabled = false;
    }
  });
}

// SYNC USER SESSION WITH CLOUDFLARE WORKER
async function syncUserWithBackend(user, token) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL
      })
    });

    const data = await res.json();
    if (data.role === 'OWNER') {
      userRole = 'OWNER';
      if (ownerConsoleBtn) ownerConsoleBtn.classList.remove('hidden');
    }
  } catch (err) {
    console.error("Backend Sync Error:", err);
  }
  }
  
