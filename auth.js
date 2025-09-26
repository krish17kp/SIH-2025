// auth.js
// Requires: <script type="module" src="firebase-config.js"></script> BEFORE this tag

import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ---------- elements from login.html ---------- */
const $ = (id) => document.getElementById(id);

// Login
const loginEmail = $("loginEmail");
const loginPass = $("loginPass");
const loginBtn = $("loginBtn");
const forgotLink = $("forgotLink");

// Sign-up
const signupName = $("signupName");
const signupEmail = $("signupEmail");
const signupPass = $("signupPass");
const signupBtn = $("signupBtn");

/* ---------- helpers ---------- */
function toast(msg) {
  console.log(msg);
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed",
    left: "50%",
    bottom: "20px",
    transform: "translateX(-50%)",
    background: "#111",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: "10px",
    boxShadow: "0 8px 24px rgba(0,0,0,.25)",
    zIndex: 9999,
    fontWeight: "700",
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function getReturnTo() {
  const u = new URL(location.href);
  const v = u.searchParams.get("returnTo");
  return v && v.startsWith("/") ? v : "index.html";
}

/* ---------- session persistence ---------- */
await setPersistence(auth, browserLocalPersistence);

/* 
  We only redirect when the *current* page action completed.
  Use a short-lived flag so simply visiting login.html doesn’t redirect.
*/
const FLAG = "postAuthRedirect";

/* ---------- auth state listener ---------- */
onAuthStateChanged(auth, (user) => {
  const shouldRedirect = sessionStorage.getItem(FLAG) === "1";

  if (user && shouldRedirect) {
    sessionStorage.removeItem(FLAG);
    location.replace(getReturnTo());
  }

  // Otherwise do nothing — no auto-redirect just for being signed in
});

/* ---------- LOGIN ---------- */
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    try {
      const email = (loginEmail?.value || "").trim();
      const pass = (loginPass?.value || "").trim();
      if (!email || !pass) return toast("Enter email and password");

      // Set the intent BEFORE we trigger Firebase so the state listener can see it
      sessionStorage.setItem(FLAG, "1");
      await signInWithEmailAndPassword(auth, email, pass);
      toast("Welcome back!");

      // Safety net: if the state event already fired before the flag was read
      // (rare), do a delayed manual redirect.
      setTimeout(() => {
        if (sessionStorage.getItem(FLAG) === "1" && auth.currentUser) {
          sessionStorage.removeItem(FLAG);
          location.replace(getReturnTo());
        }
      }, 300);
    } catch (err) {
      sessionStorage.removeItem(FLAG);
      console.error(err);
      toast(err.message || "Login failed");
    }
  });
}

/* ---------- SIGN UP ---------- */
if (signupBtn) {
  signupBtn.addEventListener("click", async () => {
    try {
      const name = (signupName?.value || "").trim();
      const email = (signupEmail?.value || "").trim();
      const pass = (signupPass?.value || "").trim();
      if (!name || !email || !pass) return toast("Fill all fields");

      sessionStorage.setItem(FLAG, "1");
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (name) await updateProfile(cred.user, { displayName: name });
      toast("Account created!");

      setTimeout(() => {
        if (sessionStorage.getItem(FLAG) === "1" && auth.currentUser) {
          sessionStorage.removeItem(FLAG);
          location.replace(getReturnTo());
        }
      }, 300);
    } catch (err) {
      sessionStorage.removeItem(FLAG);
      console.error(err);
      toast(err.message || "Sign up failed");
    }
  });
}

/* ---------- FORGOT PASSWORD ---------- */
if (forgotLink) {
  forgotLink.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const email = (loginEmail?.value || "").trim();
      if (!email) return toast("Type your email first");
      await sendPasswordResetEmail(auth, email);
      toast("Reset link sent to your inbox");
    } catch (err) {
      console.error(err);
      toast(err.message || "Could not send reset email");
    }
  });
}
