import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot,
  serverTimestamp, doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBkHqLMsR_UR_NeRaaGb-0c5MRrWzy3w6Y",
  authDomain: "schoolfriends-dev.firebaseapp.com",
  projectId: "schoolfriends-dev",
  storageBucket: "schoolfriends-dev.firebasestorage.app",
  messagingSenderId: "807033346729",
  appId: "1:807033346729:web:46f85493518ec60608e7b8",
  measurementId: "G-P1SRDNQ9PE"
};

// Your Cloudflare Worker, e.g. "https://schoolfriends-api.yourname.workers.dev".
// Leave empty to run in direct mode (profiles stored in Firestore).
const WORKER_URL = "";
const OWNER_EMAILS = ["itsazureaxotv@gmail.com"];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const channels = [
  { id: "general-chat", name: "General Chat", desc: "Main community chatter", icon: "1000588420.png" },
  { id: "announcements", name: "Announcements", desc: "Server news & updates", icon: "1000588423.png" },
  { id: "polls", name: "Polls & Voting", desc: "Community questions & votes", icon: "1000588422.png" }
];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
const dicebear = (seed) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || "user")}`;

let currentUser = null, profile = {}, active = "general-chat", unsub = null;
let msgs = [], img = null, viaWorker = false, pendingName = "", mode = "in", toastTimer;
const users = {};

function toast(t) {
  const el = $("toast");
  el.textContent = t;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

/* ---------- Cloudflare Worker ---------- */
async function api(path, opts = {}) {
  const token = await auth.currentUser.getIdToken();
  const r = await fetch(WORKER_URL + path, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Worker returned ${r.status}`);
  return r.json();
}
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/* ---------- Auth UI ---------- */
const ERR = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/email-already-in-use": "That email already has an account. Try signing in.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/operation-not-allowed": "This sign-in method isn't enabled in Firebase yet."
};
function say(t, ok) {
  $("aStatus").textContent = t;
  $("aStatus").style.color = ok ? "var(--ok)" : "#ffc46b";
}
async function busy(btn, fn) {
  btn.disabled = true;
  try { await fn(); } catch (e) { console.error(e); say(ERR[e.code] || e.message); }
  btn.disabled = false;
}
function setMode(m) {
  mode = m;
  const up = m === "up";
  $("tabIn").classList.toggle("on", !up);
  $("tabUp").classList.toggle("on", up);
  $("aTitle").textContent = up ? "Create your account" : "Welcome Back";
  $("aSubmit").textContent = up ? "Create account" : "Sign in";
  document.querySelector(".up").classList.toggle("hidden", !up);
  $("forgotRow").classList.toggle("hidden", up);
  $("aPass").autocomplete = up ? "new-password" : "current-password";
  say("");
}
$("tabIn").onclick = () => setMode("in");
$("tabUp").onclick = () => setMode("up");
$("gBtn").onclick = () => busy($("gBtn"), () => signInWithPopup(auth, provider));
$("eye").onclick = () => {
  const p = $("aPass"), show = p.type === "password";
  p.type = show ? "text" : "password";
  $("eye").innerHTML = `<i class="fa-regular fa-eye${show ? "-slash" : ""}"></i>`;
};
$("authForm").onsubmit = (e) => {
  e.preventDefault();
  const email = $("aEmail").value.trim(), pass = $("aPass").value;
  if (!email || !pass) return say("Enter your email and password.");
  busy($("aSubmit"), async () => {
    if (mode === "up") {
      pendingName = $("aName").value.trim() || email.split("@")[0];
      const { user } = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(user, { displayName: pendingName });
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  });
};
$("forgot").onclick = async () => {
  const email = $("aEmail").value.trim();
  if (!email) return say("Type your email first, then tap Forgot password.");
  try { await sendPasswordResetEmail(auth, email); say("Reset link sent. Check your inbox.", true); }
  catch (e) { say(ERR[e.code] || e.message); }
};
$("out").onclick = () => signOut(auth);

/* ---------- Profile ---------- */
const defaults = (u) => ({
  displayName: pendingName || u.displayName || (u.email || "Student").split("@")[0],
  photoURL: u.photoURL || dicebear(u.uid),
  bio: "Active Campus Member"
});

async function loadProfile(u) {
  profile = defaults(u);
  viaWorker = false;
  if (WORKER_URL) {
    try {
      const d = await api("/api/session", json("POST", profile));
      profile = { ...profile, ...d.profile };
      viaWorker = true;
    } catch (e) { console.warn("Worker unreachable, using Firestore:", e); }
  }
  if (!viaWorker) {
    try {
      const s = await getDoc(doc(db, "users", u.uid));
      if (s.exists()) profile = { ...profile, ...s.data() };
      else await setDoc(doc(db, "users", u.uid), { ...profile, email: u.email, uid: u.uid });
    } catch (e) { console.warn("Profile sync:", e); }
  }
  $("conn").textContent = viaWorker ? "Connected" : "Direct mode";
  $("conn").classList.toggle("off", !viaWorker);
  paintProfile();
}

function paintProfile() {
  users[currentUser.uid] = profile;
  $("meAv").src = $("pAv").src = profile.photoURL;
  $("meName").textContent = profile.displayName;
  $("meBio").textContent = profile.bio;
  renderMsgs();
}

async function saveProfile(patch) {
  profile = { ...profile, ...patch };
  paintProfile();
  if (viaWorker) await api("/api/profile", json("PUT", patch));
  else await setDoc(doc(db, "users", currentUser.uid), { ...patch, email: currentUser.email, uid: currentUser.uid, updatedAt: serverTimestamp() }, { merge: true });
}

function resize(file, max, q, square) {
  return new Promise((res, rej) => {
    const im = new Image(), url = URL.createObjectURL(file);
    im.onload = () => {
      const c = document.createElement("canvas"), g = c.getContext("2d");
      if (square) {
        const s = Math.min(im.width, im.height);
        c.width = c.height = max;
        g.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, max, max);
      } else {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        c.width = im.width * k; c.height = im.height * k;
        g.drawImage(im, 0, 0, c.width, c.height);
      }
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? res(b) : rej(new Error("Could not process image"))), "image/jpeg", q);
    };
    im.onerror = () => rej(new Error("That file isn't a valid image"));
    im.src = url;
  });
}
const toDataURL = (b) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

// Instant profile photo: pick a file, it is cropped, uploaded and shown everywhere.
$("avIn").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    toast("Uploading photo...");
    const blob = await resize(f, 256, 0.88, true);
    $("pAv").src = URL.createObjectURL(blob);
    const url = viaWorker
      ? (await api("/api/avatar", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob })).url
      : await toDataURL(blob);
    await saveProfile({ photoURL: url });
    toast("Profile photo updated");
  } catch (err) {
    console.error(err);
    toast("Couldn't update photo: " + err.message);
    paintProfile();
  }
};

const openProfile = () => {
  $("pName").value = profile.displayName;
  $("pBio").value = profile.bio;
  $("pAv").src = profile.photoURL;
  $("pStat").textContent = "";
  $("pm").classList.remove("hidden");
};
document.querySelectorAll("[data-profile]").forEach((b) => (b.onclick = openProfile));
$("pClose").onclick = () => $("pm").classList.add("hidden");
$("pf").onsubmit = async (e) => {
  e.preventDefault();
  const displayName = $("pName").value.trim();
  if (!displayName) return;
  $("pSave").disabled = true;
  try {
    await saveProfile({ displayName, bio: $("pBio").value.trim() || "Active Campus Member" });
    $("pStat").style.color = "var(--ok)";
    $("pStat").textContent = "Saved";
    setTimeout(() => $("pm").classList.add("hidden"), 700);
  } catch (err) {
    $("pStat").style.color = "var(--bad)";
    $("pStat").textContent = "Couldn't save: " + err.message;
  }
  $("pSave").disabled = false;
};

/* ---------- Channels ---------- */
function paintChannels() {
  const f = $("chSearch").value.toLowerCase();
  $("rail").innerHTML = channels.map((c) => `<div class="srvw ${c.id === active ? "on" : ""}"><button class="srv ${c.id === active ? "on" : ""}" data-ch="${c.id}" title="${c.name}"><img src="${c.icon}" alt="${c.name}"></button></div>`).join("");
  $("chList").innerHTML = channels.filter((c) => (c.name + c.desc).toLowerCase().includes(f)).map((c) => `<button class="ch ${c.id === active ? "on" : ""}" data-ch="${c.id}"><img src="${c.icon}" alt=""><span><b>${c.name}</b><small>${c.desc}</small></span></button>`).join("");
}
$("chSearch").oninput = paintChannels;
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ch]");
  if (b) openChannel(b.dataset.ch);
});

function openChannel(id) {
  active = id;
  const c = channels.find((x) => x.id === id) || channels[0];
  $("hTitle").textContent = c.name;
  $("hDesc").textContent = c.desc;
  $("hIcon").src = c.icon;
  paintChannels();
  drawer(false);
  unsub?.();
  msgs = [];
  $("chat").innerHTML = `<div class="empty"><i class="fa-solid fa-circle-notch fa-spin"></i></div>`;
  unsub = onSnapshot(
    query(collection(db, "channels", id, "messages"), orderBy("createdAt", "desc"), limit(100)),
    (snap) => {
      msgs = snap.docs.map((d) => d.data()).reverse();
      msgs.forEach((m) => who(m.uid));
      renderMsgs();
    },
    (err) => {
      console.error(err);
      $("chat").innerHTML = `<div class="empty">Can't load messages. Check that your Firestore rules allow signed-in reads.</div>`;
    }
  );
}

async function who(uid) {
  if (!uid || users[uid]) return;
  users[uid] = {};
  try {
    const s = await getDoc(doc(db, "users", uid));
    if (s.exists()) { users[uid] = s.data(); renderMsgs(); }
  } catch { /* profile doc not readable; message data is used instead */ }
}

function renderMsgs() {
  const box = $("chat");
  if (!currentUser || $("app").classList.contains("hidden") && !msgs.length) return;
  if (!msgs.length) {
    const c = channels.find((x) => x.id === active) || channels[0];
    box.innerHTML = `<div class="empty"><img src="${c.icon}" alt=""><b>Welcome to ${c.name}</b><span>${c.desc}</span></div>`;
    return;
  }
  let prev = null;
  box.innerHTML = msgs.map((m) => {
    const t = m.createdAt?.toDate?.(), ms = t ? +t : Date.now();
    const first = !prev || prev.uid !== m.uid || ms - prev.ms > 3e5;
    prev = { uid: m.uid, ms };
    const u = users[m.uid] || {};
    const name = esc(u.displayName || m.userName || "Student");
    const av = esc(u.photoURL || m.photoURL || dicebear(m.uid));
    const time = t ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now";
    const body = (m.image ? `<img class="pic" src="${esc(m.image)}" alt="">` : "") + (m.text ? `<div class="t">${esc(m.text)}</div>` : "");
    return first
      ? `<div class="m first"><img class="pf" src="${av}" alt=""><div><div><span class="n">${name}</span><span class="ts">${time}</span></div>${body}</div></div>`
      : `<div class="m"><span class="gut">${time}</span><div>${body}</div></div>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

/* ---------- Composer ---------- */
async function send() {
  const text = $("msg").value.trim();
  if ((!text && !img) || !currentUser) return;
  const m = { uid: currentUser.uid, userName: profile.displayName, text, image: img, createdAt: serverTimestamp() };
  if (/^https?:/.test(profile.photoURL)) m.photoURL = profile.photoURL;
  $("msg").value = "";
  clearImg();
  $("emo").classList.add("hidden");
  try { await addDoc(collection(db, "channels", active, "messages"), m); }
  catch (e) { console.error(e); toast("Message not sent: " + e.message); }
}
$("send").onclick = send;
$("msg").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
$("emoBtn").onclick = () => $("emo").classList.toggle("hidden");
$("emo").onclick = (e) => {
  if (e.target.tagName === "BUTTON") { $("msg").value += e.target.textContent; $("msg").focus(); }
};
$("mic").onclick = () => toast("Voice notes are coming soon.");

$("imgIn").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    img = await toDataURL(await resize(f, 1280, 0.8, false));
    $("prevImg").src = img;
    $("prev").classList.remove("hidden");
  } catch (err) { toast(err.message); }
};
function clearImg() { img = null; $("prev").classList.add("hidden"); $("prevImg").src = ""; }
$("rmImg").onclick = clearImg;

/* ---------- Drawer, terminal, shortcuts ---------- */
function drawer(open) {
  $("side").classList.toggle("open", open);
  $("scrim").classList.toggle("hidden", !open);
}
$("menu").onclick = () => drawer(true);
$("scrim").onclick = () => drawer(false);

$("pm").onclick = (e) => { if (e.target.id === "pm") e.target.classList.add("hidden"); };
$("cm").onclick = (e) => { if (e.target.id === "cm") e.target.classList.add("hidden"); };
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { $("pm").classList.add("hidden"); $("cm").classList.add("hidden"); }
});

$("termBtn").onclick = () => $("cm").classList.remove("hidden");
$("cClose").onclick = () => $("cm").classList.add("hidden");
const out = (t) => { $("cout").textContent += "\n" + t; $("cout").scrollTop = $("cout").scrollHeight; };
$("cin").onkeydown = (e) => {
  if (e.key !== "Enter") return;
  const cmd = $("cin").value.trim();
  $("cin").value = "";
  if (!cmd) return;
  out("> " + cmd);
  if (cmd === "/help") out("/clear  /status  /channel  /worker");
  else if (cmd === "/clear") $("cout").textContent = "Type /help for available commands.";
  else if (cmd === "/status") out("Signed in as " + (currentUser?.email || "none"));
  else if (cmd === "/channel") out("Active channel: " + active);
  else if (cmd === "/worker") out(viaWorker ? "Worker connected: " + WORKER_URL : "Direct mode (Worker not set or unreachable)");
  else out("Unknown command. Type /help.");
};

/* ---------- Session ---------- */
onAuthStateChanged(auth, async (u) => {
  currentUser = u;
  if (!u) {
    unsub?.();
    $("aPass").value = "";
    $("auth").classList.remove("hidden");
    $("app").classList.add("hidden");
    return;
  }
  await loadProfile(u);
  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("termBtn").classList.toggle("hidden", !OWNER_EMAILS.includes((u.email || "").toLowerCase()));
  openChannel(active);
});
