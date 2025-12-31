import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDXXLxMSTPIgHkIQ2W6-UXKYU21wQcmMXg",
  authDomain: "heure-chantier.firebaseapp.com",
  projectId: "heure-chantier",
  storageBucket: "heure-chantier.firebasestorage.app",
  messagingSenderId: "392797525494",
  appId: "1:392797525494:web:e5a9b7788f54fcb568a3d7"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export async function ensureAnon() {
  if (auth.currentUser) return auth.currentUser;
  return await new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) { unsub(); resolve(u); return; }
        await signInAnonymously(auth);
      } catch (e) {
        unsub(); reject(e);
      }
    });
  });
}
