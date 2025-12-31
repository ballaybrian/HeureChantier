import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously,
  signInWithCustomToken, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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
export const functions = getFunctions(app);

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

export async function isAdmin() {
  const u = auth.currentUser;
  if (!u) return false;
  const token = await u.getIdTokenResult(true);
  return token?.claims?.admin === true;
}

export async function enableAdminWithCode(code) {
  // Appelle Cloud Function qui valide le code et renvoie un custom token admin
  const fn = httpsCallable(functions, "getAdminToken");
  const res = await fn({ code });
  const customToken = res?.data?.token;
  if (!customToken) throw new Error("Token manquant");
  await signInWithCustomToken(auth, customToken);
  return true;
}

export async function disableAdmin() {
  // on repasse en anonyme (signOut puis signInAnonymously)
  await signOut(auth);
  await signInAnonymously(auth);
}
