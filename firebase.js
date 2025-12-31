import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
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

export const f = {
  // Firestore
  collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
  // Auth
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
};
