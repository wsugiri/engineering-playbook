// Berkas Service Worker Wajib di root domain untuk FCM Web (Background Message Handler)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Konfigurasi Web Firebase Client
// Catatan: Service Worker tidak bisa membaca import.meta.env secara langsung,
// ganti placeholder berikut dengan credential Firebase project Anda:
const firebaseConfig = {
  apiKey: "AIzaSy_YOUR_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handler notifikasi saat browser/tab di-minimize atau di background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Menerima notifikasi background:', payload);

  const notificationTitle = payload.notification?.title || 'Notifikasi Baru';
  const notificationOptions = {
    body: payload.notification?.body || 'Anda menerima pesan baru.',
    icon: payload.notification?.icon || '/vite.svg',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
