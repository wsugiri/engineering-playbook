// Berkas Service Worker Wajib di root domain untuk FCM Web (Background Message Handler)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Konfigurasi Web Firebase Client
// Catatan: Service Worker tidak bisa membaca import.meta.env secara langsung,
// ganti placeholder berikut dengan credential Firebase project Anda:
const firebaseConfig = {
  apiKey: "AIzaSyBAwIlUMb57gABVPm6Wxi_4hhWUm03O3ZM",
  authDomain: "gen-lang-client-0912255908.firebaseapp.com",
  projectId: "gen-lang-client-0912255908",
  storageBucket: "gen-lang-client-0912255908.appspot.com",
  messagingSenderId: "335732295529",
  appId: "1:335732295529:web:469cb41624596d6f785ff8"
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
