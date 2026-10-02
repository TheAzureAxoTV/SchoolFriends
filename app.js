import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// SchoolFriends Firebase Web App configuration
const firebaseConfig = {
  apiKey: "AIzaSyBkHqLMsR_UR_NeRaaGb-0c5MRrWzy3w6Y",
  authDomain: "schoolfriends-dev.firebaseapp.com",
  projectId: "schoolfriends-dev",
  storageBucket: "schoolfriends-dev.firebasestorage.app",
  messagingSenderId: "807033346729",
  appId: "1:807033346729:web:46f85493518ec60608e7b8",
  measurementId: "G-P1SRDNQ9PE"
};

const API_BASE_URL = "https://schoolfriends-api.mukhopadhyaysudip3.workers.dev";
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

let currentUser = null;
let selectedImageBase64 = "";
let messagePollTimer = null;
let authBootComplete = false;

const $ = (id) => document.getElementById(id);

function setLoginBusy(busy, label = "Continue with Google") {
  const button = $("googleSignInBtn");
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("opacity-70", busy);
  button.innerHTML = busy
    ? `<i class="fa-solid fa-spinner fa-spin text-lg"></i><span>${label}</span>`
    : `<i class="fa-brands fa-google text-lg"></i><span>Continue with Google</span>`;
}

function setAuthStatus(message = "") {
  const el = $("authStatus");
  if (el) el.textContent = message;
}

function showLogin() {
  const authSection = $("authSection");
  const mainAppSection = $("mainAppSection");
  const userProfile = $("userProfile");
  const ownerConsoleBtn = $("ownerConsoleBtn");

  if (authSection) authSection.style.display = "flex";
  if (mainAppSection) mainAppSection.classList.add("hidden");
  if (userProfile) userProfile.classList.add("hidden");
  if (ownerConsoleBtn) ownerConsoleBtn.classList.add("hidden");
}

function showApp(user) {
  const authSection = $("authSection");
  const mainAppSection = $("mainAppSection");
  const userProfile = $("userProfile");
  const userAvatar = $("userAvatar");

  if (authSection) authSection.style.display = "none";
  if (mainAppSection) mainAppSection.classList.remove("hidden");
  if (userProfile) userProfile.classList.remove("hidden");
  if (userAvatar) {
    userAvatar.src = user.photoURL || "https://via.placeholder.com/36";
    userAvatar.alt = user.displayName || "Profile";
  }
}

function friendlyAuthError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/unauthorized-domain": `This domain is not authorized by Firebase. Add ${location.hostname} in Firebase Authentication → Settings → Authorized domains.`,
    "auth/operation-not-allowed": "Google sign-in is disabled. Enable Google under Firebase Authentication → Sign-in method.",
    "auth/invalid-api-key": "The Firebase API key is invalid or the deployed site is using an old app.js.",
    "auth/network-request-failed": "Firebase could not reach the network. Check your connection and try again.",
    "auth/popup-blocked": "The browser blocked the Google login window. Trying the redirect login instead…",
    "auth/popup-closed-by-user": "The Google login window was closed before completing sign-in.",
    "auth/cancelled-popup-request": "Another Google login request is already running.",
    "auth/invalid-credential": "Google returned an invalid credential. Check the Firebase Google provider configuration.",
    "auth/internal-error": "Firebase returned an internal authentication error. Check the browser console for details."
  };
  return messages[code] || error?.message || code || "Unknown Firebase authentication error.";
}

async function beginGoogleLogin() {
  setLoginBusy(true, "Opening Google…");
  setAuthStatus("");

  try {
    // Explicit local persistence makes the session survive the OAuth round trip.
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, provider);
    // onAuthStateChanged is the single source of truth and will open the app.
  } catch (popupError) {
    console.warn("Google popup login failed:", popupError);

    const fallbackCodes = new Set([
      "auth/popup-blocked",
      "auth/popup-closed-by-user",
      "auth/cancelled-popup-request",
      "auth/operation-not-supported-in-this-environment"
    ]);

    if (fallbackCodes.has(popupError?.code)) {
      try {
        setAuthStatus("Opening Google securely…");
        await setPersistence(auth, browserLocalPersistence);
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirectError) {
        console.error("Google redirect login failed:", redirectError);
        setLoginBusy(false);
        setAuthStatus(friendlyAuthError(redirectError));
        alert(`Google sign-in failed:\n\n${friendlyAuthError(redirectError)}`);
        return;
      }
    }

    setLoginBusy(false);
    setAuthStatus(friendlyAuthError(popupError));
    alert(`Google sign-in failed:\n\n${friendlyAuthError(popupError)}`);
  }
}

async function handleRedirectResult() {
  try {
    await setPersistence(auth, browserLocalPersistence);
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log("Google redirect completed:", result.user.uid);
    }
  } catch (error) {
    console.error("Google redirect result error:", error);
    setLoginBusy(false);
    setAuthStatus(friendlyAuthError(error));
    // Do not reload or loop. The user can try again.
  }
}

async function syncUserToApi(user) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: user.displayName || "SchoolFriends User",
        email: user.email || "",
        photoURL: user.photoURL || ""
      })
    });

    if (!response.ok) {
      throw new Error(`Auth sync returned HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    // API sync must never kick a successfully authenticated user back to login.
    console.error("Cloudflare Worker auth sync failed:", error);
    return null;
  }
}

async function loadMessages() {
  const chatBox = $("chatBox");
  if (!chatBox) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/messages`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const messages = await response.json();

    if (!Array.isArray(messages)) return;

    chatBox.innerHTML = messages.map((msg) => {
      const username = escapeHtml(msg.username || "User");
      const text = escapeHtml(msg.text || "");
      const image = typeof msg.image === "string" && /^data:image\//i.test(msg.image)
        ? `<img src="${msg.image}" class="mt-2 max-h-48 max-w-full rounded-lg object-cover" alt="Shared image" loading="lazy">`
        : "";

      return `<div class="mb-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/50">
        <div class="text-xs font-semibold text-indigo-400 mb-1">${username}</div>
        ${text ? `<div class="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap break-words">${text}</div>` : ""}
        ${image}
      </div>`;
    }).join("");

    chatBox.scrollTop = chatBox.scrollHeight;
  } catch (error) {
    console.error("Error loading chat:", error);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendMessage() {
  const input = $("messageInput");
  const sendBtn = $("sendBtn");
  const text = input?.value.trim() || "";

  if (!currentUser || (!text && !selectedImageBase64)) return;
  if (sendBtn) sendBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        text,
        image: selectedImageBase64
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    if (input) input.value = "";
    selectedImageBase64 = "";
    const imageInput = $("imageInput");
    const preview = $("imagePreviewContainer");
    if (imageInput) imageInput.value = "";
    if (preview) preview.classList.add("hidden");

    await loadMessages();
  } catch (error) {
    alert(`Error sending message: ${error.message}`);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function startMessagePolling() {
  if (messagePollTimer) clearInterval(messagePollTimer);
  loadMessages();
  messagePollTimer = setInterval(loadMessages, 3000);
}

function stopMessagePolling() {
  if (messagePollTimer) {
    clearInterval(messagePollTimer);
    messagePollTimer = null;
  }
}

function wireUi() {
  $("googleSignInBtn")?.addEventListener("click", beginGoogleLogin);

  $("signOutBtn")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      alert(`Sign out failed: ${error.message || error}`);
    }
  });

  $("sendBtn")?.addEventListener("click", sendMessage);
  $("messageInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendMessage();
  });

  $("imageInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("Please choose an image smaller than 3 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      selectedImageBase64 = String(reader.result || "");
      const preview = $("imagePreview");
      const container = $("imagePreviewContainer");
      if (preview) preview.src = selectedImageBase64;
      if (container) container.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  $("removeImageBtn")?.addEventListener("click", () => {
    selectedImageBase64 = "";
    const input = $("imageInput");
    const preview = $("imagePreviewContainer");
    if (input) input.value = "";
    if (preview) preview.classList.add("hidden");
  });

  $("ownerConsoleBtn")?.addEventListener("click", () => $("consoleModal")?.classList.remove("hidden"));
  $("closeConsoleBtn")?.addEventListener("click", () => $("consoleModal")?.classList.add("hidden"));

  $("consoleInput")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    const input = event.currentTarget;
    const command = input.value.trim();
    if (!command || !currentUser) return;
    input.value = "";

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/console`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, command })
      });
      const data = await response.json();
      const output = $("consoleOutput");
      if (output) {
        output.innerText += `\n> ${command}\n${data.output || data.error || "No output"}\n`;
        output.scrollTop = output.scrollHeight;
      }
    } catch (error) {
      const output = $("consoleOutput");
      if (output) output.innerText += `\n> Error running command: ${error.message}\n`;
    }
  });
}

async function boot() {
  showLogin();
  setAuthStatus("Checking your sign-in session…");
  setLoginBusy(true, "Checking session…");

  wireUi();

  // Resolve an OAuth redirect before relying on the auth state listener.
  await handleRedirectResult();

  onAuthStateChanged(auth, async (user) => {
    authBootComplete = true;

    if (!user) {
      currentUser = null;
      stopMessagePolling();
      showLogin();
      setLoginBusy(false);
      setAuthStatus("");
      return;
    }

    currentUser = {
      id: user.uid,
      username: user.displayName || user.email?.split("@")[0] || "user",
      display_name: user.displayName || "",
      role: "MEMBER"
    };

    showApp(user);
    setLoginBusy(false);
    setAuthStatus("");

    // The Cloudflare API sync is deliberately non-blocking for authentication.
    const data = await syncUserToApi(user);
    if (data?.user) {
      currentUser = { ...currentUser, ...data.user, id: data.user.id || user.uid };
      if (currentUser.role === "OWNER") {
        $("ownerConsoleBtn")?.classList.remove("hidden");
      }
    }

    startMessagePolling();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
