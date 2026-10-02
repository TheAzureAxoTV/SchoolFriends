import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithRedirect, 
  getRedirectResult, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD...", // Replace with your actual Firebase API Key
  authDomain: "schoolfriends-dev.firebaseapp.com",
  projectId: "schoolfriends-dev",
  storageBucket: "schoolfriends-dev.appspot.com",
  messagingSenderId: "807033346729",
  appId: "1:807033346729:web:..."
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Worker API Base URL
const API_BASE_URL = "https://schoolfriends-api.mukhopadhyaysudip3.workers.dev";

// Global User State
let currentUserData = null;

// DOM Elements
const authSection = document.getElementById('authSection');
const mainAppSection = document.getElementById('mainAppSection');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userAvatar = document.getElementById('userAvatar');
const ownerConsoleBtn = document.getElementById('ownerConsoleBtn');

// Handle Sign-In Redirect Results
getRedirectResult(auth)
  .then((result) => {
    if (result) {
      console.log("Redirect login successful:", result.user);
    }
  })
  .catch((error) => {
    console.error("Redirect Error:", error);
    alert("Authentication failed: " + error.message);
  });

// Google Sign-In Click Event
if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', async () => {
    try {
      googleSignInBtn.innerText = "Redirecting to Google...";
      googleSignInBtn.disabled = true;
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Auth Trigger Error:", error);
      alert("Could not start Google Sign-In: " + error.message);
      googleSignInBtn.disabled = false;
      googleSignInBtn.innerText = "Continue with Google";
    }
  });
}

// Sign-Out Event
if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.reload();
  });
}

// Auth State Monitor
onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (authSection) authSection.classList.add('hidden');
    if (mainAppSection) mainAppSection.classList.remove('hidden');
    if (userAvatar) userAvatar.src = user.photoURL || "https://via.placeholder.com/40";

    // Sync session with Cloudflare Worker D1 Database
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL
        })
      });

      const data = await response.json();
      if (data.success) {
        currentUserData = data;
        
        // Render Owner Console Terminal Button if user is OWNER
        if (data.role === 'OWNER' && ownerConsoleBtn) {
          ownerConsoleBtn.classList.remove('hidden');
        }
      }
    } catch (err) {
      console.error("Database sync failed:", err);
    }
  } else {
    if (authSection) authSection.classList.remove('hidden');
    if (mainAppSection) mainAppSection.classList.add('hidden');
    if (ownerConsoleBtn) ownerConsoleBtn.classList.add('hidden');
  }
});
