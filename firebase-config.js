// firebase-config.js  (ES module, no HTML tags)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ⬇️ Use YOUR real config from the Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyAiWjWEAMoR2mjTQBL0RwTAurV3GxDwXm0",
  authDomain: "sih-941c9.firebaseapp.com",
  projectId: "sih-941c9",
  storageBucket: "sih-941c9.firebasestorage.app",
  messagingSenderId: "571465943120",
  appId: "1:571465943120:web:edd44ef2e57dd5ff392955",
  measurementId: "G-GJDGTEBNB3",
};

// Initialize once and export handles
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
if (!app || !auth || !db || !storage) {
  console.error("[Firebase] Failed to initialize one or more services.", {
    app,
    auth,
    db,
    storage,
  });
}
