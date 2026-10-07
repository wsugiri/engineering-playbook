import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging';

// Konfigurasi Web Firebase Client
// Mengambil dari environment variable Vite (.env) atau default fallback
export const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || "AIzaSy_YOUR_API_KEY",
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || "your-project-id.firebaseapp.com",
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || "your-project-id",
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || "your-project-id.appspot.com",
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || "1:1234567890:web:abcdef"
};

// VAPID Key publik dari Firebase Console -> Project Settings -> Cloud Messaging -> Web Push certificates
export const VAPID_KEY = import.meta.env?.VITE_FIREBASE_VAPID_KEY || "YOUR_PUBLIC_VAPID_KEY";

// URL API Backend Server
export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || "http://localhost:3000";

// Inisialisasi Firebase App
export const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);
