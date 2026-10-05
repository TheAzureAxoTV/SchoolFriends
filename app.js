import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, orderBy, limitToLast, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ---------- CONFIG ---------- */
const WORKER_URL = "https://schoolfriends-api.mukhopadhyaysudip3.workers.dev"; // your Cloudflare Worker
const ALLOWED_DOMAIN = "";                                                   // e.g. "myschool.edu" to only allow school accounts

const firebaseConfig = {
  apiKey: "AIzaSyBkHqLMsR_UR_NeRaaGb-0c5MRrWzy3w6Y",
  authDomain: "schoolfriends-dev.firebaseapp.com",
  projectId: "schoolfriends-dev",
  storageBucket: "schoolfriends-dev.firebasestorage.app",
  messagingSenderId: "807033346729",
  appId: "1:807033346729:web:46f85493518ec60608e7b8",
  measurementId: "G-P1SRDNQ9PE"
};

const tile = (c1, c2, g) => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='64' height='64' fill='url(#g)'/><text x='32' y='45' font-size='36' font-weight='700' text-anchor='middle' fill='white' font-family='Arial,sans-serif'>${g}</text></svg>`);
const CHANNELS = [
  { id: "general-chat", name: "General Chat", desc: "Main community chatter", icon: tile("#6c7bff", "#4b3fd6", "#") },
  { id: "announcements", name: "Announcements", desc: "Server news and updates", icon: tile("#ff8a5c", "#e0455f", "!") },
  { id: "polls", name: "Polls & Voting", desc: "Community questions and votes", icon: tile("#2fd6a0", "#1b9ac4", "✓") }
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account", ...(ALLOWED_DOMAIN && { hd: ALLOWED_DOMAIN }) });

/* ---------- HELPERS ---------- */
const RANK = { student: 0, mod: 1, admin: 2, owner: 3 };
const j = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const safe = (u) => (/^(https:\/\/|data:image\/)/i.test(u || "") ? esc(u) : "");
const fallbackAvatar = (seed) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

let user = null, me = {}, active = "general-chat", unsub = null, attach = null, toastTimer, replyTo = null, editId = null, selId = null, msgs = {};

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
      const enc = (q) => c.toBlob((b) => (!b ? no(new Error("Could not process that image")) : b.size > 450e3 && q > 0.3 ? enc(q - 0.15) : ok(b)), "image/webp", q);
      enc(0.8);
    };
    img.onerror = () => no(new Error("That file isn't a valid image"));
    img.src = url;
  });
}

async function upload(file, kind) {
  const blob = await shrink(file, kind === "avatar" ? 320 : 1280);
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
  await loadProfile();
  $("termBtn").classList.toggle("hidden", RANK[me.role] < 2);
  openChannel(active);
});

/* ---------- PROFILE ---------- */
async function loadProfile() {
  const base = { displayName: user.displayName || "Student", photoURL: user.photoURL || fallbackAvatar(user.uid), bio: "Active campus member", role: "student" };
  try {
    const d = await api("/api/me");
    me = { displayName: d.displayName || base.displayName, photoURL: d.photoURL || base.photoURL, bio: d.bio || base.bio, role: d.role || "student" };
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
  if (f.size > 5e6) return toast("Profile pictures can be up to 5 MB.", true);
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
  $("rail").innerHTML = CHANNELS.map((c) => `<button class="srv ${c.id === active ? "on" : ""}" data-ch="${c.id}" data-tip="${c.name}" aria-label="${c.name}"><img src="${c.icon}" alt=""/></button>`).join("");
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
  cancelBar();
  $("feed").innerHTML = `<div class="empty"><div class="dots"><i></i><i></i><i></i></div></div>`;

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
      let prev = null, html = ""; msgs = {};
      snap.forEach((d) => {
        const m = d.data(), t = m.createdAt?.toDate?.() || null; msgs[d.id] = m;
        const time = t ? t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Sending…";
        const grouped = prev && prev.uid === m.uid && t && prev.t && t - prev.t < 3e5;
        const name = esc(m.userName || "Student");
        const img = safe(m.image);
        const mine = m.uid === user.uid, can = mine || (RANK[me.role] >= 1 && RANK[me.role] >= (RANK[m.role] || 0));
        const rp = m.replyTo ? `<div class="rp"><i class="fa-solid fa-reply"></i><b>${esc(m.replyTo.name)}</b> ${esc(m.replyTo.text)}</div>` : "";
        const body = rp + (m.text ? `<p>${esc(m.text)}${m.edited ? ` <small class="ed">(edited)</small>` : ""}</p>` : "") + (img ? `<img class="pic" src="${img}" alt="Attachment" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('i'),{textContent:'Image removed'}))"/>` : "");
        const tb = `<div class="tb"><button data-act="reply" title="Reply" aria-label="Reply"><i class="fa-solid fa-reply"></i></button>${mine && m.text ? `<button data-act="edit" title="Edit" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>` : ""}${can ? `<button data-act="del" title="Delete" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>` : ""}</div>`;
        const badge = m.role && m.role !== "student" ? `<em class="rb ${esc(m.role)}">${esc(m.role)}</em>` : "";
        const cls = "m" + (grouped ? "" : " first") + (selId === d.id ? " sel" : "") + (mine ? " mine" : "");
        html += grouped
          ? `<div class="${cls}" data-id="${d.id}"><span class="sp">${time}</span><div>${body}</div>${tb}</div>`
          : `<div class="${cls}" data-id="${d.id}"><img src="${safe(m.photoURL) || fallbackAvatar(m.uid || name)}" alt=""/><div><div class="h"><b>${name}</b>${badge}<time>${time}</time></div>${body}</div>${tb}</div>`;
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
    if (editId) await api("/api/messages", j("PUT", { channel: active, id: editId, text }));
    else {
      const image = attach ? await upload(attach, "image") : null;
      await api("/api/messages", j("POST", { channel: active, text, image, replyTo: replyTo?.id }));
    }
    $("msg").value = "";
    clearBar();
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
  if (f.size > 10e6) { e.target.value = ""; return toast("Choose an image under 10 MB.", true); }
  attach = f;
  $("prevImg").src = URL.createObjectURL(f);
  $("prev").classList.remove("hidden");
};
function clearAttach() { attach = null; $("imgIn").value = ""; $("prev").classList.add("hidden"); }
$("rmImg").onclick = clearAttach;

/* ---------- REPLY / EDIT / DELETE ---------- */
function showBar(t) { $("rtxt").textContent = t; $("rbar").classList.remove("hidden"); }
function clearBar() { replyTo = editId = null; $("rbar").classList.add("hidden"); }
function cancelBar() { if (editId) $("msg").value = ""; clearBar(); }
$("rmReply").onclick = cancelBar;
$("feed").onclick = async (e) => {
  const row = e.target.closest(".m");
  if (!row) return;
  const id = row.dataset.id, m = msgs[id], act = e.target.closest("[data-act]")?.dataset.act;
  if (!m) return;
  if (!act) {
    selId = selId === id ? null : id;
    document.querySelectorAll(".m.sel").forEach((x) => x.classList.remove("sel"));
    if (selId) row.classList.add("sel");
  } else if (act === "reply") {
    editId = null; replyTo = { id }; showBar(`Replying to ${m.userName || "Student"}`); $("msg").focus();
  } else if (act === "edit") {
    replyTo = null; editId = id; $("msg").value = m.text; showBar("Editing message"); $("msg").focus();
  } else if (act === "del" && confirm("Delete this message?")) {
    try { await api("/api/messages", j("DELETE", { channel: active, id })); } catch (err) { toast(err.message, true); }
  }
};

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
  if (c === "/help") say("/clear  /status  /channel  /ping\n/role <email> <admin|mod|student>");
  else if (c === "/clear") out.textContent = "";
  else if (c === "/status") say(`Signed in as ${user.email}`);
  else if (c === "/channel") say(`Active channel: ${active}`);
  else if (c.startsWith("/role ")) {
    const [, email, role] = c.split(/\s+/);
    try { await api("/api/role", j("POST", { email, role })); say(`${email} is now ${role}.`); } catch (err) { say("Error: " + err.message); }
  }
  else if (c === "/ping") {
    const t = performance.now();
    try { await api("/api/me"); say(`Worker OK in ${Math.round(performance.now() - t)} ms`); }
    catch (err) { say("Worker error: " + err.message); }
  } else say(`Unknown command: ${c}. Type /help.`);
};
    
