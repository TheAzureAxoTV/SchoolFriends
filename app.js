import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limitToLast, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ---------- CONFIG ---------- */
const WORKER_URL = "https://schoolfriends-api.YOUR-SUBDOMAIN.workers.dev"; // your Cloudflare Worker
const ALLOWED_DOMAIN = "";                                                   // e.g. "myschool.edu" to only allow school accounts
const OWNER_EMAILS = ["itsazureaxotv@gmail.com"];

const firebaseConfig = {
  apiKey: "AIzaSyBkHqLMsR_UR_NeRaaGb-0c5MRrWzy3w6Y",
  authDomain: "schoolfriends-dev.firebaseapp.com",
  projectId: "schoolfriends-dev",
  storageBucket: "schoolfriends-dev.firebasestorage.app",
  messagingSenderId: "807033346729",
  appId: "1:807033346729:web:46f85493518ec60608e7b8",
  measurementId: "G-P1SRDNQ9PE"
};

const CHANNELS = [
  { id: "general-chat", name: "General Chat", desc: "Main community chatter", icon: "1000588420.png" },
  { id: "announcements", name: "Announcements", desc: "Server news and updates", icon: "1000588423.png" },
  { id: "polls", name: "Polls & Voting", desc: "Community questions and votes", icon: "1000588422.png" }
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account", ...(ALLOWED_DOMAIN && { hd: ALLOWED_DOMAIN }) });

/* ---------- HELPERS ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const safe = (u) => (/^(https:\/\/|data:image\/)/i.test(u || "") ? esc(u) : "");
const fallbackAvatar = (seed) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

let user = null, me = {}, active = "general-chat", unsub = null, attach = null, toastTimer;

function toast(msg, bad) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "show" + (bad ? " bad" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

/* ---------- CLOUDFLARE WORKER API ---------- */
// Routes expected: GET/PUT /api/me (D1 profile), POST /api/upload?kind=avatar|image (R2)
async function api(path, opts = {}) {
  const token = await user.getIdToken();
  const res = await fetch(WORKER_URL + path, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Server error (${res.status})`);
  return res.json();
}

function shrink(file, max) {
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? ok(b) : no(new Error("Could not process that image"))), "image/webp", 0.88);
    };
    img.onerror = () => no(new Error("That file isn't a valid image"));
    img.src = url;
  });
}

async function upload(file, kind) {
  const blob = await shrink(file, kind === "avatar" ? 320 : 1400);
  const { url } = await api(`/api/upload?kind=${kind}`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
  return url;
}

/* ---------- SIGN-IN ---------- */
const AUTH_ERRORS = {
  "auth/popup-closed-by-user": "Sign-in was cancelled. Try again when you're ready.",
  "auth/cancelled-popup-request": "Sign-in was cancelled. Try again when you're ready.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
  "auth/unauthorized-domain": "This site isn't authorised in Firebase. Add it under Authentication > Settings > Authorised domains."
};

const last = (() => { try { return JSON.parse(localStorage.getItem("sf_last")); } catch { return null; } })();
if (last) {
  $("lastChip").innerHTML = `${safe(last.photo) ? `<img src="${safe(last.photo)}" alt=""/>` : ""}<span>Last signed in as ${esc(last.name)}</span>`;
  $("lastChip").classList.remove("hidden");
}

$("gBtn").onclick = async () => {
  const btn = $("gBtn");
  btn.disabled = true;
  $("authMsg").textContent = "";
  $("gLabel").textContent = "Opening Google…";
  try {
    await setPersistence(auth, $("keep").checked ? browserLocalPersistence : browserSessionPersistence);
    await signInWithPopup(auth, provider);
  } catch (e) {
    $("authMsg").textContent = AUTH_ERRORS[e.code] || e.message;
  }
  btn.disabled = false;
  $("gLabel").textContent = "Continue with Google";
};

$("outBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (u) => {
  if (u && ALLOWED_DOMAIN && !(u.email || "").toLowerCase().endsWith("@" + ALLOWED_DOMAIN)) {
    $("authMsg").textContent = `Use your @${ALLOWED_DOMAIN} school account to continue.`;
    return signOut(auth);
  }
  user = u;
  $("auth").classList.toggle("hidden", !!u);
  $("app").classList.toggle("hidden", !u);
  if (!u) { unsub?.(); return; }
  try { localStorage.setItem("sf_last", JSON.stringify({ name: u.displayName || "Student", photo: u.photoURL || "" })); } catch {}
  $("termBtn").classList.toggle("hidden", !OWNER_EMAILS.includes((u.email || "").toLowerCase()));
  await loadProfile();
  openChannel(active);
});

/* ---------- PROFILE ---------- */
async function loadProfile() {
  const base = { displayName: user.displayName || "Student", photoURL: user.photoURL || fallbackAvatar(user.uid), bio: "Active campus member" };
  try {
    const d = await api("/api/me");
    me = { displayName: d.displayName || base.displayName, photoURL: d.photoURL || base.photoURL, bio: d.bio || base.bio };
  } catch (e) {
    me = base;
    toast("Profile server unreachable. Showing your Google profile for now.", true);
  }
  paintMe();
}

function paintMe() {
  $("meImg").src = $("bigImg").src = me.photoURL;
  $("meName").value = $("fName").value = me.displayName;
  $("meBio").textContent = me.bio;
  $("fBio").value = me.bio;
}

async function saveProfile(patch, okMsg) {
  const prev = me;
  me = { ...me, ...patch };
  paintMe();
  try {
    await api("/api/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(me) });
    toast(okMsg);
  } catch (e) {
    me = prev;
    paintMe();
    toast(e.message, true);
  }
}

// Instant avatar: tap the picture, pick a photo, it shows immediately and uploads in the background
$("avBtn").onclick = $("bigAv").onclick = () => $("avFile").click();
$("avFile").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  $("meImg").src = $("bigImg").src = URL.createObjectURL(f);
  try {
    await saveProfile({ photoURL: await upload(f, "avatar") }, "Profile picture updated");
  } catch (err) {
    paintMe();
    toast(err.message, true);
  }
};

// Instant name edit: click the name in the user panel, type, press Enter
const commitName = () => {
  const v = $("meName").value.trim();
  if (!v) return paintMe();
  if (v !== me.displayName) saveProfile({ displayName: v }, "Name updated");
};
$("meName").onblur = commitName;
$("meName").onkeydown = (e) => {
  if (e.key === "Enter") e.target.blur();
  if (e.key === "Escape") { paintMe(); e.target.blur(); }
};

$("profBtn").onclick = () => $("profModal").classList.remove("hidden");
$("profForm").onsubmit = (e) => {
  e.preventDefault();
  saveProfile({ displayName: $("fName").value.trim() || me.displayName, bio: $("fBio").value.trim() || me.bio }, "Profile saved");
  $("profModal").classList.add("hidden");
};

document.querySelectorAll(".modal").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-close]")) m.classList.add("hidden"); })
);

/* ---------- CHANNELS ---------- */
function renderNav() {
  $("rail").innerHTML = CHANNELS.map((c) => `<button class="srv ${c.id === active ? "on" : ""}" data-ch="${c.id}" title="${c.name}"><img src="${c.icon}" alt="${c.name}"/></button>`).join("");
  $("chs").innerHTML = CHANNELS.map((c) => `<button class="ch ${c.id === active ? "on" : ""}" data-ch="${c.id}"><img src="${c.icon}" alt=""/><span><b>${c.name}</b><small>${c.desc}</small></span></button>`).join("");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ch]");
  if (b) openChannel(b.dataset.ch);
});

const openDrawer = () => { $("side").classList.add("open"); $("scrim").classList.remove("hidden"); };
const closeDrawer = () => { $("side").classList.remove("open"); $("scrim").classList.add("hidden"); };
$("menuBtn").onclick = openDrawer;
$("scrim").onclick = closeDrawer;

/* ---------- MESSAGES (Firebase) ---------- */
function openChannel(id) {
  active = id;
  const c = CHANNELS.find((x) => x.id === id) || CHANNELS[0];
  $("chTitle").textContent = c.name;
  $("chDesc").textContent = c.desc;
  $("chIcon").src = c.icon;
  renderNav();
  closeDrawer();
  unsub?.();
  $("feed").innerHTML = `<div class="empty"><i class="fa-solid fa-circle-notch fa-spin"></i></div>`;

  let first = true;
  unsub = onSnapshot(
    query(collection(db, "channels", c.id, "messages"), orderBy("createdAt", "asc"), limitToLast(150)),
    (snap) => {
      const feed = $("feed");
      if (snap.empty) {
        feed.innerHTML = `<div class="empty"><img src="${c.icon}" alt=""/><b>Welcome to ${c.name}</b><span>${c.desc}. Send the first message.</span></div>`;
        return;
      }
      const stick = first || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 200;
      let prev = null, html = "";
      snap.forEach((d) => {
        const m = d.data(), t = m.createdAt?.toDate?.() || null;
        const time = t ? t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Sending…";
        const grouped = prev && prev.uid === m.uid && t && prev.t && t - prev.t < 3e5;
        const name = esc(m.userName || "Student");
        const img = safe(m.image);
        const body = (m.text ? `<p>${esc(m.text)}</p>` : "") + (img ? `<img class="pic" src="${img}" alt="Attachment" loading="lazy"/>` : "");
        html += grouped
          ? `<div class="m"><span class="sp">${time}</span><div>${body}</div></div>`
          : `<div class="m first"><img src="${safe(m.photoURL) || fallbackAvatar(m.uid || name)}" alt=""/><div><div class="h"><b>${name}</b><time>${time}</time></div>${body}</div></div>`;
        prev = { uid: m.uid, t };
      });
      feed.innerHTML = html;
      if (stick) feed.scrollTop = feed.scrollHeight;
      first = false;
    },
    () => { $("feed").innerHTML = `<div class="empty"><b>Can't load messages</b><span>Check your Firestore security rules allow signed-in reads.</span></div>`; }
  );
}

async function send() {
  const text = $("msg").value.trim();
  if ((!text && !attach) || !user) return;
  $("sendBtn").disabled = true;
  try {
    const image = attach ? await upload(attach, "image") : null;
    await addDoc(collection(db, "channels", active, "messages"), {
      uid: user.uid, userName: me.displayName, photoURL: me.photoURL, text, image, createdAt: serverTimestamp()
    });
    $("msg").value = "";
    clearAttach();
    $("pop").classList.add("hidden");
  } catch (e) {
    toast(e.message || "Message failed to send", true);
  }
  $("sendBtn").disabled = false;
}
$("sendBtn").onclick = send;
$("msg").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

$("imgIn").onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 15e6) { e.target.value = ""; return toast("Choose an image under 15 MB.", true); }
  attach = f;
  $("prevImg").src = URL.createObjectURL(f);
  $("prev").classList.remove("hidden");
};
function clearAttach() { attach = null; $("imgIn").value = ""; $("prev").classList.add("hidden"); }
$("rmImg").onclick = clearAttach;

$("emojiBtn").onclick = () => $("pop").classList.toggle("hidden");
$("pop").onclick = (e) => { const em = e.target.closest("[data-e]"); if (em) { $("msg").value += em.dataset.e; $("msg").focus(); } };
$("micBtn").onclick = () => toast("Voice notes are coming soon.");

/* ---------- ADMIN TERMINAL ---------- */
const out = $("termOut");
const say = (s) => { out.textContent += "\n" + s; out.scrollTop = out.scrollHeight; };
$("termBtn").onclick = () => $("termModal").classList.remove("hidden");
$("termIn").onkeydown = async (e) => {
  if (e.key !== "Enter") return;
  const c = e.target.value.trim();
  e.target.value = "";
  if (!c) return;
  say("> " + c);
  if (c === "/help") say("/clear  /status  /channel  /ping");
  else if (c === "/clear") out.textContent = "";
  else if (c === "/status") say(`Signed in as ${user.email}`);
  else if (c === "/channel") say(`Active channel: ${active}`);
  else if (c === "/ping") {
    const t = performance.now();
    try { await api("/api/me"); say(`Worker OK in ${Math.round(performance.now() - t)} ms`); }
    catch (err) { say("Worker error: " + err.message); }
  } else say(`Unknown command: ${c}. Type /help.`);
};
