// community.js
import { auth, db, storage } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  getDoc,
  getDocs,
  where,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref as sRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* ──────────────────────────────────────────────────────────────
   Global error surfacing (so silent errors don't block auth gate)
   ────────────────────────────────────────────────────────────── */
window.addEventListener("error", (e) => {
  console.error("[GlobalError]", e.error || e.message || e);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[UnhandledRejection]", e.reason || e);
});

/* ──────────────────────────────────────────────────────────────
   Elements
   ────────────────────────────────────────────────────────────── */
const el = (id) => document.getElementById(id);

const $rail = el("serversRail");
const $serverName = el("serverName");
const $channelName = el("channelName");
const $channelsList = el("channelsList");
const $messages = el("messages");
const $composer = el("composer");
const $input = el("chatInput");
const $imageInput = el("imageInput");
const $fileInput = el("fileInput");
const $att = el("attachments");
const $emojiBtn = el("emojiBtn");
const $emojiPanel = el("emojiPanel");
const $badge = el("userBadge");
const $addServerBtn = el("addServerBtn");
const $addChannelBtn = el("addChannelBtn");

// user dropdown + modals
const $userBtn = el("userBtn");
const $userMenu = el("userMenu");
const $userName = el("userName");
const $userAvatar = el("userAvatar");
const $signOut = el("signOutBtn");
const $openProfile = el("openProfile");
const $openFriends = el("openFriends");
const $manageAccount = el("manageAccount");
const $switchAccount = el("switchAccount");

const $profileModal = el("profileModal");
const $profileName = el("profileName");
const $profilePhoto = el("profilePhoto");
const $profilePreview = el("profilePreview");
const $saveProfile = el("saveProfile");
const $closeProfile = el("closeProfile");

const $friendsModal = el("friendsModal");
const $friendEmail = el("friendEmail");
const $friendReqs = el("friendReqs");
const $friendList = el("friendList");
const $addFriendBtn = el("addFriendBtn");
const $closeFriends = el("closeFriends");

// voice
const $joinVoice = el("joinVoice");
const $leaveVoice = el("leaveVoice");
const $musicBtn = el("musicBtn");

// hover tip
const $tip = el("profileTip");
const $tipAvatar = el("tipAvatar");
const $tipName = el("tipName");
const $tipEmail = el("tipEmail");

/* ──────────────────────────────────────────────────────────────
   State
   ────────────────────────────────────────────────────────────── */
let me = null;
let activeServerId = null;
let activeChannelId = null;
let unsubMsgs = null;

/* ──────────────────────────────────────────────────────────────
   Auth gate (robust; logs status; updates header)
   ────────────────────────────────────────────────────────────── */
onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      console.log("[Auth] No user → redirecting to login.html");
      if ($badge) $badge.textContent = "Not signed in";
      window.location.href = "login.html";
      return;
    }

    console.log("[Auth] Signed in as", user.uid, user.email);
    me = user;

    if ($badge)
      $badge.textContent = `Signed in as ${
        user.displayName || user.email || "You"
      }`;
    wireHeaderUI(user);

    await ensureUserProfile(user);

    // bind UI and load data
    bindDropdown();
    bindProfileModal();
    bindFriendsModal();
    bindEmoji();
    bindAttachments();
    bindVoice();

    await loadServers();
  } catch (err) {
    console.error("[Auth Gate Error]", err);
    if ($badge) $badge.textContent = "Auth error";
  }
});

// keep header identity in sync
function wireHeaderUI(user) {
  if ($userName)
    $userName.textContent = user.displayName || user.email || "You";
  if ($userAvatar) $userAvatar.src = user.photoURL || "images/sih_logo.png";
}

/* ──────────────────────────────────────────────────────────────
   Header actions
   ────────────────────────────────────────────────────────────── */
if ($signOut) $signOut.addEventListener("click", () => signOut(auth));
if ($manageAccount)
  $manageAccount.addEventListener("click", () =>
    window.open("https://myaccount.google.com", "_blank")
  );
if ($switchAccount)
  $switchAccount.addEventListener(
    "click",
    () => (window.location.href = "login.html")
  );

/* ──────────────────────────────────────────────────────────────
   Dropdown + Modals
   ────────────────────────────────────────────────────────────── */
function bindDropdown() {
  if (!$userBtn || !$userMenu) return;

  $userBtn.onclick = () => {
    $userMenu.style.display =
      $userMenu.style.display === "block" ? "none" : "block";
  };
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#userBox")) $userMenu.style.display = "none";
  });

  if ($openProfile)
    $openProfile.onclick = () => {
      if ($profileModal) $profileModal.style.display = "grid";
    };

  if ($openFriends)
    $openFriends.onclick = () => {
      if ($friendsModal) $friendsModal.style.display = "grid";
      startFriendsListeners();
    };
}

/* ──────────────────────────────────────────────────────────────
   Emoji
   ────────────────────────────────────────────────────────────── */
function bindEmoji() {
  if (!$emojiPanel || !$emojiBtn) return;

  const EMOJIS =
    "😀 😃 😄 😁 😆 😊 🙂 🙃 😉 😌 😍 🥰 😘 😚 😎 🤗 👍 👏 🙏 ✨ 💪 💙 🔥 🎉 🚀".split(
      " "
    );
  $emojiPanel.innerHTML = EMOJIS.map(
    (e) => `<button type="button">${e}</button>`
  ).join("");

  $emojiBtn.onclick = () => {
    $emojiPanel.style.display =
      $emojiPanel.style.display === "block" ? "none" : "block";
  };
  $emojiPanel.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") {
      $input.value += e.target.textContent;
      $emojiPanel.style.display = "none";
      $input.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!(e.target.closest("#emojiPanel") || e.target === $emojiBtn))
      $emojiPanel.style.display = "none";
  });
}

/* ──────────────────────────────────────────────────────────────
   Attachments (preview)
   Note: your HTML uses <label> that opens hidden inputs, so we
   do NOT look for non-existent #imageBtn/#fileBtn.
   ────────────────────────────────────────────────────────────── */
let pending = []; // [{file, type, name, url}]
function bindAttachments() {
  if ($imageInput)
    $imageInput.addEventListener("change", (e) =>
      addPending(e.target.files, true)
    );
  if ($fileInput)
    $fileInput.addEventListener("change", (e) =>
      addPending(e.target.files, false)
    );
}

function addPending(fileList, isImage) {
  [...fileList].forEach((f) => {
    const p = { file: f, type: f.type, name: f.name, url: "" };
    if (isImage) {
      const r = new FileReader();
      r.onload = () => {
        p.url = r.result;
        renderPending();
      };
      r.readAsDataURL(f);
    }
    pending.push(p);
  });
  if ($imageInput) $imageInput.value = "";
  if ($fileInput) $fileInput.value = "";
  renderPending();
}

function renderPending() {
  if (!$att) return;
  $att.innerHTML = "";
  pending.forEach((p, i) => {
    if (p.type.startsWith("image/") && p.url) {
      const img = document.createElement("img");
      img.src = p.url;
      img.className = "thumb";
      img.style.cssText =
        "width:64px;height:64px;border-radius:10px;border:1px solid #262626;object-fit:cover";
      $att.appendChild(img);
    } else {
      const tag = document.createElement("div");
      tag.textContent = p.name;
      tag.className = "chip";
      $att.appendChild(tag);
    }
    const x = document.createElement("button");
    x.className = "btn";
    x.textContent = "✕";
    x.style.cssText =
      "padding:2px 8px;background:#222;border:1px solid #333;border-radius:8px;color:#bbb";
    x.onclick = () => {
      pending.splice(i, 1);
      renderPending();
    };
    $att.appendChild(x);
  });
}

/* ──────────────────────────────────────────────────────────────
   Servers (default icon uses your logo)
   ────────────────────────────────────────────────────────────── */
async function loadServers() {
  const qSrv = query(collection(db, "servers"));
  onSnapshot(qSrv, (snap) => {
    // clear buttons except add
    [...$rail.querySelectorAll(".srv.srv-item")].forEach((n) => n.remove());

    snap.forEach((d) => {
      const data = d.data();
      const b = document.createElement("button");
      b.className = "srv srv-item" + (d.id === activeServerId ? " active" : "");
      b.title = data.name || "Server";
      const img = document.createElement("img");
      img.src = data.iconURL || "images/sih_logo.png";
      b.appendChild(img);
      b.onclick = () => switchServer(d.id, data.name || "Server");
      $rail.insertBefore(b, $addServerBtn);
    });

    if (!activeServerId && snap.size) {
      const first = snap.docs[0];
      switchServer(first.id, first.data().name);
    } else if (!snap.size) {
      // seed a default server
      createServer("test1", true);
    }
  });
}

$addServerBtn?.addEventListener("click", async () => {
  const name = prompt("Server name?");
  if (!name) return;
  await createServer(name, true);
});

async function createServer(name, selectAfter) {
  const srv = await addDoc(collection(db, "servers"), {
    name,
    owner: me.uid,
    createdAt: serverTimestamp(),
    iconURL: "images/sih_logo.png",
  });
  await setDoc(doc(db, "servers", srv.id, "members", me.uid), {
    uid: me.uid,
    joinedAt: serverTimestamp(),
  });
  if (selectAfter) switchServer(srv.id, name);
}

async function switchServer(serverId, name) {
  activeServerId = serverId;
  if ($serverName) $serverName.textContent = name || "Server";

  await setDoc(
    doc(db, "servers", serverId, "members", me.uid),
    { uid: me.uid, joinedAt: serverTimestamp() },
    { merge: true }
  );

  loadChannels(serverId);
}

/* ──────────────────────────────────────────────────────────────
   Channels (with categories)
   ────────────────────────────────────────────────────────────── */
function loadChannels(serverId) {
  const col = collection(db, "servers", serverId, "channels");
  onSnapshot(query(col, orderBy("createdAt", "asc")), async (snap) => {
    // create default set if empty
    const desired = [
      { name: "Getting started", slug: "getting-started", type: "info" },
      { name: "Announcements", slug: "announcements", type: "announce" },
      { name: "Events", slug: "events", type: "events" },
      { name: "Chat", slug: "general", type: "text" },
      { name: "Voice", slug: "voice", type: "voice" },
    ];

    if (snap.empty) {
      for (const it of desired) {
        await addDoc(col, {
          name: it.slug,
          label: it.name,
          type: it.type,
          createdAt: serverTimestamp(),
        });
      }
      return; // snapshot will retrigger
    }

    // render by category
    $channelsList.innerHTML = "";
    const cats = { info: [], announce: [], events: [], text: [], voice: [] };

    snap.forEach((d) => {
      const data = d.data();
      const t = data.type || "text";
      cats[t]?.push({ id: d.id, data });
    });

    function addCat(label, arr) {
      if (!arr || !arr.length) return;
      const h = document.createElement("div");
      h.className = "cat";
      h.textContent = label.toUpperCase();
      $channelsList.appendChild(h);

      arr.forEach((c, idx) => {
        const row = document.createElement("div");
        row.className = "row" + (c.id === activeChannelId ? " active" : "");
        row.textContent =
          (c.data.type === "voice" ? "🔊 " : "# ") +
          (c.data.label || c.data.name);
        row.onclick = () => switchChannel(c.id, c.data);
        $channelsList.appendChild(row);

        if (
          !activeChannelId &&
          idx === 0 &&
          (label === "Chat" || label === "Getting started")
        ) {
          switchChannel(c.id, c.data);
        }
      });
    }

    addCat("Getting started", cats.info);
    addCat("Announcements", cats.announce);
    addCat("Events", cats.events);
    addCat("Chat", cats.text);
    addCat("Voice", cats.voice);
  });
}

$addChannelBtn?.addEventListener("click", async () => {
  if (!activeServerId) return;
  const name = prompt("Channel name (no #):");
  if (!name) return;
  await addDoc(collection(db, "servers", activeServerId, "channels"), {
    name,
    label: name,
    type: "text",
    createdAt: serverTimestamp(),
  });
});

function switchChannel(channelId, data) {
  activeChannelId = channelId;
  if ($channelName)
    $channelName.textContent =
      (data.type === "voice" ? "🔊 " : "# ") + (data.label || data.name);
  listenMessages();
}

/* ──────────────────────────────────────────────────────────────
   Messages
   ────────────────────────────────────────────────────────────── */
function listenMessages() {
  if (!activeServerId || !activeChannelId) return;
  if (unsubMsgs) unsubMsgs();
  $messages.innerHTML = `<div class="empty">Loading messages…</div>`;

  const qy = query(
    collection(
      db,
      "servers",
      activeServerId,
      "channels",
      activeChannelId,
      "messages"
    ),
    orderBy("createdAt", "asc"),
    limit(400)
  );

  unsubMsgs = onSnapshot(qy, (snap) => {
    $messages.innerHTML = "";
    if (snap.empty) {
      $messages.innerHTML = `<div class="empty">Say hi 👋 — no messages yet.</div>`;
      return;
    }
    snap.forEach((d) => renderMessage(d.data()));
    $messages.scrollTop = $messages.scrollHeight;
  });
}

function renderMessage(m) {
  const wrap = document.createElement("div");
  wrap.className = "msg" + (m.uid === me.uid ? " me" : "");

  const meta = document.createElement("div");
  meta.className = "meta";

  const avatar = document.createElement("img");
  avatar.src =
    m.photoURL ||
    `https://api.dicebear.com/8.x/identicon/svg?seed=${m.uid || "anon"}`;
  avatar.dataset.uid = m.uid;
  avatar.className = "uavatar";

  const who = document.createElement("span");
  who.textContent = m.displayName || "User";
  who.style.fontWeight = "700";
  who.dataset.uid = m.uid;
  who.className = "uname";

  const time = document.createElement("span");
  time.className = "time";
  const ts = m.createdAt?.toDate ? m.createdAt.toDate() : null;
  time.textContent = ts
    ? ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "…";

  meta.append(avatar, who, time);

  const body = document.createElement("div");
  body.textContent = m.text || "";
  wrap.append(meta, body);

  // attachments
  if (Array.isArray(m.attachments) && m.attachments.length) {
    const box = document.createElement("div");
    box.style.cssText = "margin-top:6px;display:flex;gap:8px;flex-wrap:wrap";
    m.attachments.forEach((a) => {
      if (a.type?.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = a.url;
        img.alt = a.name;
        img.style.cssText =
          "max-width:260px;border-radius:10px;border:1px solid #222";
        box.appendChild(img);
      } else {
        const link = document.createElement("a");
        link.href = a.url;
        link.target = "_blank";
        link.textContent = a.name || "file";
        link.className = "link";
        box.appendChild(link);
      }
    });
    wrap.appendChild(box);
  }

  $messages.appendChild(wrap);
}

/* hover mini-profile */
$messages.addEventListener("mousemove", async (e) => {
  const t = e.target.closest(".uavatar,.uname");
  if (!t) {
    $tip.style.display = "none";
    return;
  }
  const uid = t.dataset.uid;
  const info = await fetchUser(uid);
  if (!info) {
    $tip.style.display = "none";
    return;
  }
  $tipAvatar.src = info.photoURL || "images/sih_logo.png";
  $tipName.textContent = info.displayName || "User";
  $tipEmail.textContent = info.email || "";
  $tip.style.display = "flex";
  $tip.style.left = e.pageX + 12 + "px";
  $tip.style.top = e.pageY + 12 + "px";
});
$messages.addEventListener("mouseleave", () => {
  $tip.style.display = "none";
});

/* send */
$composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeServerId || !activeChannelId) return;
  const text = ($input.value || "").trim();
  if (!text && pending.length === 0) return;

  // upload attachments
  const attachments = [];
  for (const p of pending) {
    const path = `uploads/${me.uid}/${Date.now()}_${(p.name || "file").replace(
      /\s+/g,
      "_"
    )}`;
    const r = sRef(storage, path);
    await uploadBytes(r, p.file);
    const url = await getDownloadURL(r);
    attachments.push({ url, name: p.name, type: p.type });
  }

  await addDoc(
    collection(
      db,
      "servers",
      activeServerId,
      "channels",
      activeChannelId,
      "messages"
    ),
    {
      text,
      attachments,
      uid: me.uid,
      displayName: me.displayName || me.email || "",
      photoURL: me.photoURL || "",
      createdAt: serverTimestamp(),
    }
  );

  pending = [];
  renderPending();
  $input.value = "";
});

/* ──────────────────────────────────────────────────────────────
   Profile modal
   ────────────────────────────────────────────────────────────── */
function bindProfileModal() {
  if (!$profileModal) return;

  $closeProfile.onclick = () => ($profileModal.style.display = "none");
  $profileName.value = me.displayName || "";
  $profilePreview.src = me.photoURL || "images/sih_logo.png";

  $profilePhoto.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => ($profilePreview.src = r.result);
    r.readAsDataURL(f);
  });

  $saveProfile.onclick = async () => {
    let photoURL = me.photoURL || "";
    const f = $profilePhoto.files && $profilePhoto.files[0];
    if (f) {
      const r = sRef(
        storage,
        `avatars/${me.uid}/${Date.now()}_${f.name.replace(/\s+/g, "_")}`
      );
      await uploadBytes(r, f);
      photoURL = await getDownloadURL(r);
    }
    const displayName = $profileName.value.trim() || me.displayName || "";
    await updateProfile(me, { displayName, photoURL });
    await setDoc(
      doc(db, "users", me.uid),
      {
        uid: me.uid,
        email: me.email || "",
        displayName,
        photoURL,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    wireHeaderUI({ ...me, displayName, photoURL });
    $profileModal.style.display = "none";
  };
}

/* ──────────────────────────────────────────────────────────────
   Friends
   ────────────────────────────────────────────────────────────── */
function bindFriendsModal() {
  if (!$friendsModal) return;

  $closeFriends.onclick = () => ($friendsModal.style.display = "none");

  $addFriendBtn.onclick = async () => {
    const email = $friendEmail.value.trim().toLowerCase();
    if (!email) return;

    const q = query(collection(db, "users"), where("email", "==", email));
    const s = await getDocs(q);
    if (s.empty) {
      alert("No user with that email.");
      return;
    }
    const to = s.docs[0].id;
    if (to === me.uid) {
      alert("That’s you 🙂");
      return;
    }

    const bucket = doc(db, "friends", to);
    await setDoc(doc(bucket, "requests", me.uid), {
      fromUid: me.uid,
      fromEmail: me.email,
      createdAt: serverTimestamp(),
    });

    alert("Request sent!");
    $friendEmail.value = "";
  };
}

function startFriendsListeners() {
  // requests to me
  onSnapshot(collection(db, "friends", me.uid, "requests"), (snap) => {
    $friendReqs.innerHTML = "";
    snap.forEach((d) => {
      const r = d.data();
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.alignItems = "center";
      row.textContent = r.fromEmail || r.fromUid;

      const acc = document.createElement("button");
      acc.className = "btn brand";
      acc.textContent = "Accept";
      acc.onclick = async () => {
        await setDoc(doc(db, "friends", me.uid, "list", r.fromUid), {
          uid: r.fromUid,
          since: serverTimestamp(),
        });
        await setDoc(doc(db, "friends", r.fromUid, "list", me.uid), {
          uid: me.uid,
          since: serverTimestamp(),
        });
        // mark request handled (simplest)
        await updateDoc(doc(db, "friends", me.uid, "requests", r.fromUid), {
          accepted: true,
          handledAt: serverTimestamp(),
        });
      };

      row.appendChild(acc);
      $friendReqs.appendChild(row);
    });
  });

  // my friend list
  onSnapshot(collection(db, "friends", me.uid, "list"), (snap) => {
    $friendList.innerHTML = "";
    snap.forEach((d) => {
      const fr = d.data();
      const row = document.createElement("div");
      row.textContent = fr.uid;
      row.style.color = "#9aa0a6";
      $friendList.appendChild(row);
    });
  });
}

/* ──────────────────────────────────────────────────────────────
   Voice (events bridged to voice.js)
   ────────────────────────────────────────────────────────────── */
function bindVoice() {
  if ($joinVoice)
    $joinVoice.onclick = () =>
      window.dispatchEvent(
        new CustomEvent("voice:join", {
          detail: { serverId: activeServerId, channelId: activeChannelId },
        })
      );

  if ($leaveVoice)
    $leaveVoice.onclick = () =>
      window.dispatchEvent(
        new CustomEvent("voice:leave", {
          detail: { serverId: activeServerId, channelId: activeChannelId },
        })
      );

  if ($musicBtn)
    $musicBtn.onclick = () =>
      window.dispatchEvent(
        new CustomEvent("voice:music", {
          detail: { serverId: activeServerId, channelId: activeChannelId },
        })
      );

  // reflect state from voice.js
  window.addEventListener("voice:state", (e) => {
    const { inVoice } = e.detail;
    if ($joinVoice)
      $joinVoice.style.display = inVoice ? "none" : "inline-block";
    if ($leaveVoice)
      $leaveVoice.style.display = inVoice ? "inline-block" : "none";
  });
}

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */
async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp(),
    });
  }
}

async function fetchUser(uid) {
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? s.data() : null;
}
