const state = {
  channel: localStorage.getItem("sf_channel") || "general-chat",
  name: localStorage.getItem("sf_name") || "Guest",
  muted: false,
  deafened: false,
  attachedImage: null,
  messages: JSON.parse(localStorage.getItem("sf_messages") || "{}")
};

const channels = {
  "general-chat": {
    topic: "General conversation for school friends",
    seed: [
      { name: "SchoolFriends", text: "Welcome to SchoolFriends! 👋", time: "Today" },
      { name: "SchoolFriends", text: "This is your general chat. Send a message below to get started.", time: "Today" }
    ]
  },
  announcements: {
    topic: "Important updates and community announcements",
    seed: [{ name: "SchoolFriends", text: "No announcements yet.", time: "Today" }]
  },
  polls: {
    topic: "Create and discuss school polls",
    seed: [{ name: "SchoolFriends", text: "Polls channel is ready! 📊", time: "Today" }]
  },
  "gaming-zone": {
    topic: "Games, Minecraft and everything gaming",
    seed: [{ name: "SchoolFriends", text: "Welcome to Gaming Zone! 🎮", time: "Today" }]
  }
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));

function saveMessages() {
  localStorage.setItem("sf_messages", JSON.stringify(state.messages));
}

function getMessages(channel) {
  if (!Array.isArray(state.messages[channel])) {
    state.messages[channel] = [...channels[channel].seed];
    saveMessages();
  }
  return state.messages[channel];
}

function renderMembers() {
  $("onlineMemberList").innerHTML = `
    <div class="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-discord-hover/40">
      <div class="relative shrink-0">
        <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(state.name)}" class="w-8 h-8 rounded-full bg-discord-chat" alt="User">
        <div class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-discord-green rounded-full border-2 border-discord-sidebar"></div>
      </div>
      <div class="flex flex-col truncate">
        <span class="text-xs font-semibold text-white truncate">${escapeHtml(state.name)}</span>
        <span class="text-[10px] text-discord-subtle">Online</span>
      </div>
    </div>`;
  $("onlineCount").textContent = "1";
}

function renderMessages() {
  const box = $("chatBox");
  const messages = getMessages(state.channel);
  box.innerHTML = "";

  messages.forEach((msg) => {
    const wrapper = document.createElement("div");
    wrapper.className = "flex gap-3 group animate-msg";
    const avatarSeed = encodeURIComponent(msg.name);
    const image = msg.image
      ? `<img src="${msg.image}" alt="Attached image" class="max-w-xs max-h-64 rounded-lg mt-2 border border-discord-input">`
      : "";
    wrapper.innerHTML = `
      <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=${avatarSeed}" class="w-10 h-10 rounded-full shrink-0" alt="">
      <div class="min-w-0">
        <div class="flex items-baseline gap-2">
          <span class="font-semibold text-sm text-white">${escapeHtml(msg.name)}</span>
          <span class="text-[10px] text-discord-subtle">${escapeHtml(msg.time || "Now")}</span>
        </div>
        <div class="text-sm text-[#dbdee1] whitespace-pre-wrap break-words">${escapeHtml(msg.text || "")}</div>
        ${image}
      </div>`;
    box.appendChild(wrapper);
  });

  requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}

function selectChannel(channel) {
  if (!channels[channel]) return;
  state.channel = channel;
  localStorage.setItem("sf_channel", channel);

  document.querySelectorAll(".channel-btn").forEach(btn => {
    const active = btn.dataset.channel === channel;
    btn.classList.toggle("bg-discord-hover", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("text-discord-muted", !active);
  });

  $("currentChannelTitle").textContent = channel;
  $("currentChannelTopic").textContent = channels[channel].topic;
  $("messageInput").placeholder = `Message #${channel}`;
  renderMessages();

  // Close mobile drawer after choosing a channel.
  if (window.innerWidth < 640) closeMobileMenu();
}

function sendMessage() {
  const input = $("messageInput");
  const text = input.value.trim();

  if (!text && !state.attachedImage) return;

  getMessages(state.channel).push({
    name: state.name,
    text: text || "",
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    image: state.attachedImage
  });

  saveMessages();
  input.value = "";
  clearAttachment();
  renderMessages();
}

function clearAttachment() {
  state.attachedImage = null;
  $("imageInput").value = "";
  $("previewImg").src = "";
  $("previewFileName").textContent = "";
  $("imagePreviewBar").classList.add("hidden");
  $("imagePreviewBar").classList.remove("flex");
}

function handleImage(file) {
  if (!file || !file.type.startsWith("image/")) return;

  // Limit localStorage usage for this demo.
  if (file.size > 2 * 1024 * 1024) {
    alert("Please choose an image smaller than 2 MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    state.attachedImage = reader.result;
    $("previewImg").src = reader.result;
    $("previewFileName").textContent = file.name;
    $("imagePreviewBar").classList.remove("hidden");
    $("imagePreviewBar").classList.add("flex");
  };
  reader.readAsDataURL(file);
}

function openMobileMenu() {
  $("channelSidebar").classList.remove("-translate-x-full");
  $("mobileBackdrop").classList.remove("hidden");
}

function closeMobileMenu() {
  $("channelSidebar").classList.add("-translate-x-full");
  $("mobileBackdrop").classList.add("hidden");
}

function openSettings() {
  $("displayNameInput").value = state.name;
  $("settingsModal").classList.remove("hidden");
  $("settingsModal").classList.add("flex");
}

function closeSettings() {
  $("settingsModal").classList.add("hidden");
  $("settingsModal").classList.remove("flex");
}

function saveSettings() {
  const value = $("displayNameInput").value.trim().slice(0, 32);
  if (value) {
    state.name = value;
    localStorage.setItem("sf_name", value);
  }
  $("userName").textContent = state.name;
  $("userTag").textContent = "#0001";
  renderMembers();
  closeSettings();
}

function setup() {
  $("userName").textContent = state.name;
  $("displayNameInput").value = state.name;

  document.querySelectorAll(".channel-btn").forEach(btn => {
    btn.addEventListener("click", () => selectChannel(btn.dataset.channel));
  });

  $("messageForm").addEventListener("submit", e => {
    e.preventDefault();
    sendMessage();
  });

  $("imageInput").addEventListener("change", e => handleImage(e.target.files[0]));
  $("removeImageBtn").addEventListener("click", clearAttachment);

  $("emojiBtn").addEventListener("click", () => {
    $("messageInput").value += " 😊";
    $("messageInput").focus();
  });

  $("toggleMenuBtn").addEventListener("click", openMobileMenu);
  $("mobileBackdrop").addEventListener("click", closeMobileMenu);

  $("toggleMemberListBtn").addEventListener("click", () => {
    $("memberSidebar").classList.toggle("hidden");
    $("memberSidebar").classList.toggle("lg:flex");
  });

  $("micToggleBtn").addEventListener("click", () => {
    state.muted = !state.muted;
    const icon = $("micToggleBtn").querySelector("i");
    icon.className = state.muted ? "fa-solid fa-microphone-slash text-xs" : "fa-solid fa-microphone text-xs";
    $("micToggleBtn").classList.toggle("text-discord-rose", state.muted);
  });

  $("deafenToggleBtn").addEventListener("click", () => {
    state.deafened = !state.deafened;
    const icon = $("deafenToggleBtn").querySelector("i");
    icon.className = state.deafened ? "fa-solid fa-headphones-simple text-xs" : "fa-solid fa-headphones text-xs";
    $("deafenToggleBtn").classList.toggle("text-discord-rose", state.deafened);
  });

  $("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("sf_name");
    state.name = "Guest";
    $("userName").textContent = state.name;
    renderMembers();
  });

  $("openSettingsBtn").addEventListener("click", openSettings);
  $("closeSettingsBtn").addEventListener("click", closeSettings);
  $("saveSettingsBtn").addEventListener("click", saveSettings);

  $("settingsModal").addEventListener("click", e => {
    if (e.target === $("settingsModal")) closeSettings();
  });

  $("searchInput").addEventListener("input", e => {
    const query = e.target.value.trim().toLowerCase();
    document.querySelectorAll("#chatBox > div").forEach(row => {
      row.classList.toggle("hidden", query && !row.textContent.toLowerCase().includes(query));
    });
  });

  selectChannel(state.channel);
  renderMembers();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setup);
} else {
  setup();
}
