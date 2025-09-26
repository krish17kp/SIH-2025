// voice.js
// Local mic/cam + music playback. No networking yet (add signaling/SFU to talk to others).

let localStream = null;
let audioEl = null;
let preview = null;
let inVoice = false;

function isSecureEnough() {
  if (location.protocol === "https:") return true;
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

function ensurePreviewUI() {
  if (preview) return preview;
  const wrap = document.createElement("div");
  wrap.id = "voicePreview";
  wrap.style.cssText =
    "position:fixed;right:16px;bottom:16px;display:none;z-index:9999;background:#0f0f0f;border:1px solid #222;border-radius:12px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);";

  const vid = document.createElement("video");
  vid.id = "voiceLocalVideo";
  vid.autoplay = true;
  vid.muted = true;
  vid.playsInline = true;
  vid.style.cssText =
    "width:240px;height:135px;background:#000;border-radius:8px;object-fit:cover;";

  const ctrls = document.createElement("div");
  ctrls.style.cssText =
    "display:flex;gap:8px;margin-top:8px;justify-content:flex-end;";

  const pillCss = (red = false) =>
    `background:${
      red ? "#a00" : "#0a0"
    };color:#fff;border:0;border-radius:999px;padding:6px 10px;font-size:12px;cursor:pointer;`;

  const muteBtn = document.createElement("button");
  muteBtn.textContent = "Mute";
  muteBtn.style.cssText = pillCss();
  muteBtn.onclick = () => {
    if (!localStream) return;
    const t = localStream.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    muteBtn.textContent = t.enabled ? "Mute" : "Unmute";
  };

  const camBtn = document.createElement("button");
  camBtn.textContent = "Cam off";
  camBtn.style.cssText = pillCss();
  camBtn.onclick = () => {
    if (!localStream) return;
    const t = localStream.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    camBtn.textContent = t.enabled ? "Cam off" : "Cam on";
  };

  const leaveBtn = document.createElement("button");
  leaveBtn.textContent = "Leave";
  leaveBtn.style.cssText = pillCss(true);
  leaveBtn.onclick = leaveVoice;

  ctrls.append(muteBtn, camBtn, leaveBtn);
  wrap.append(vid, ctrls);
  document.body.appendChild(wrap);

  preview = { wrap, vid, muteBtn, camBtn, leaveBtn };
  return preview;
}

async function chooseLocalFile(accept = ["audio/*"]) {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = accept.join(",");
    inp.onchange = () => resolve(inp.files?.[0] ?? null);
    inp.click();
  });
}

async function handleMusic() {
  try {
    const choice = prompt(
      "Music source:\n1) Paste an HTTPS audio URL\n2) Leave empty to choose a local file",
      ""
    );

    if (audioEl) {
      audioEl.pause();
      audioEl.src = "";
      audioEl.remove();
      audioEl = null;
    }

    audioEl = document.createElement("audio");
    audioEl.crossOrigin = "anonymous";

    if (choice && choice.trim()) {
      audioEl.src = choice.trim(); // e.g. https://example.com/song.mp3
    } else {
      const file = await chooseLocalFile();
      if (!file) return;
      audioEl.src = URL.createObjectURL(file); // local file
    }

    audioEl.loop = true;
    await audioEl.play();

    // To stream this to others later, pipe through AudioContext and add to your PeerConnection/SFU mix.
    // (Left as a comment for when we wire real calls.)
  } catch (e) {
    console.error(e);
    alert("Could not start music: " + e.message);
  }
}

async function joinVoice({ withVideoPrompt = true } = {}) {
  if (!isSecureEnough()) {
    alert(
      "Could not start voice. Ensure you're on https:// or localhost/127.0.0.1 and allow mic/camera."
    );
    return;
  }
  try {
    const wantVideo =
      withVideoPrompt &&
      confirm("Enable camera too? OK = video+audio, Cancel = audio only");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantVideo,
    });

    localStream = stream;
    inVoice = true;
    const ui = ensurePreviewUI();
    ui.wrap.style.display = "block";
    ui.vid.srcObject = stream;

    window.dispatchEvent(
      new CustomEvent("voice:state", { detail: { inVoice: true } })
    );
  } catch (err) {
    console.error(err);
    alert("Could not start voice: " + (err.message || err));
  }
}

function leaveVoice() {
  try {
    inVoice = false;
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;

    if (preview) {
      preview.wrap.style.display = "none";
      preview.vid.srcObject = null;
    }
    if (audioEl) {
      audioEl.pause();
      audioEl.src = "";
      audioEl.remove();
      audioEl = null;
    }
  } finally {
    window.dispatchEvent(
      new CustomEvent("voice:state", { detail: { inVoice: false } })
    );
  }
}

// Bind to community.html buttons via custom events
window.addEventListener("voice:join", () => joinVoice());
window.addEventListener("voice:leave", () => leaveVoice());
window.addEventListener("voice:music", () => handleMusic());

/* ==== 1:1 test call over WebRTC with Firestore signaling (minimal) ==== */
import { db } from "./firebase-config.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let pc = null;
let remoteEl = null;
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function ensureRemoteUI() {
  if (remoteEl) return remoteEl;
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;right:270px;bottom:16px;background:#0f0f0f;border:1px solid #222;border-radius:12px;padding:10px;z-index:9999;";
  const v = document.createElement("video");
  v.autoplay = true;
  v.playsInline = true;
  v.style.cssText =
    "width:240px;height:135px;background:#000;border-radius:8px;object-fit:cover;";
  const cap = document.createElement("div");
  cap.textContent = "Remote";
  cap.style.cssText =
    "color:#9aa0a6;font-size:12px;margin-top:6px;text-align:right;";
  box.append(v, cap);
  document.body.appendChild(box);
  remoteEl = v;
  return v;
}

async function makePeer() {
  pc = new RTCPeerConnection(rtcConfig);
  pc.ontrack = (e) => {
    const v = ensureRemoteUI();
    v.srcObject = e.streams[0];
  };
  pc.onicecandidate = async (ev) => {
    if (!ev.candidate || !currentCallRef) return;
    const targets = isCaller ? "offerCandidates" : "answerCandidates";
    await addDoc(collection(currentCallRef, targets), ev.candidate.toJSON());
  };
  // add local tracks
  if (localStream)
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
}

let currentCallRef = null;
let isCaller = false;

async function startTestCall() {
  if (!localStream) {
    await joinVoice({ withVideoPrompt: true });
  }
  await makePeer();

  // Create call doc
  currentCallRef = doc(collection(db, "calls"));
  await setDoc(currentCallRef, { createdAt: Date.now() });
  isCaller = true;

  // Offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await updateDoc(currentCallRef, { offer: offer });

  alert(
    "Copy this Call ID and send to the other side:\n\n" + currentCallRef.id
  );

  // Listen for answer
  onSnapshot(currentCallRef, async (snap) => {
    const data = snap.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      await pc.setRemoteDescription(data.answer);
    }
  });

  // Ice exchange
  onSnapshot(collection(currentCallRef, "answerCandidates"), async (snap) => {
    for (const d of snap.docChanges()) {
      if (d.type === "added")
        await pc.addIceCandidate(new RTCIceCandidate(d.doc.data()));
    }
  });
}

async function joinTestCall() {
  const id = prompt("Enter Call ID from the caller");
  if (!id) return;
  if (!localStream) {
    await joinVoice({ withVideoPrompt: true });
  }
  await makePeer();

  currentCallRef = doc(db, "calls", id);
  const callSnap = await getDoc(currentCallRef);
  if (!callSnap.exists()) {
    alert("Call not found.");
    return;
  }

  const data = callSnap.data();
  if (!data?.offer) {
    alert("Call has no offer yet.");
    return;
  }

  await pc.setRemoteDescription(data.offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await updateDoc(currentCallRef, { answer: answer });

  // Ice exchange
  onSnapshot(collection(currentCallRef, "offerCandidates"), async (snap) => {
    for (const d of snap.docChanges()) {
      if (d.type === "added")
        await pc.addIceCandidate(new RTCIceCandidate(d.doc.data()));
    }
  });

  alert(
    "Joined! If the other side is on the page, you should see/hear each other."
  );
}

/* Hook these into your Join/Leave buttons temporarily */
window.addEventListener("voice:join", async () => {
  const mode = prompt(
    "Voice mode:\n1 = Local preview only\n2 = Start 1:1 test (new ID)\n3 = Join 1:1 test (enter ID)",
    "1"
  );
  if (mode === "2") await startTestCall();
  else if (mode === "3") await joinTestCall();
  else await joinVoice();
});
window.addEventListener("voice:leave", async () => {
  try {
    pc?.close();
    pc = null;
  } catch {}
});
