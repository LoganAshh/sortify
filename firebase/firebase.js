// firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Firebase config for React Native app
const firebaseConfig = {
  apiKey: "AIzaSyAxdTCs-Pdlzxl6iOjD3IziwXXzSLoVRnI",
  authDomain: "sortify-94710.firebaseapp.com",
  projectId: "sortify-94710",
  storageBucket: "sortify-94710.firebasestorage.app",
  messagingSenderId: "564680713683",
  appId: "1:564680713683:web:b5ec265f4dc4ba7ae93b26",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore instance
const db = getFirestore(app);

export { db };
