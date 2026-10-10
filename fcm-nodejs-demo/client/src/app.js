import { getToken, onMessage } from 'firebase/messaging';
import { messaging, VAPID_KEY, API_BASE_URL } from './firebase-config.js';

// Element DOM
const btnRequestPermission = document.getElementById('btnRequestPermission');
const btnRegisterToServer = document.getElementById('btnRegisterToServer');
const userIdInput = document.getElementById('userIdInput');
const fcmTokenInput = document.getElementById('fcmTokenInput');
const permissionStatus = document.getElementById('permissionStatus');
const logArea = document.getElementById('logArea');

let currentFcmToken = null;

function appendLog(message) {
  const time = new Date().toLocaleTimeString();
  logArea.textContent += `\n[${time}] ${message}`;
  logArea.scrollTop = logArea.scrollHeight;
}

function updatePermissionBadge() {
  const perm = Notification.permission;
  permissionStatus.textContent = `Status Izin: ${perm.toUpperCase()}`;
  if (perm === 'granted') {
    permissionStatus.style.background = '#065f46';
    permissionStatus.style.color = '#34d399';
  } else if (perm === 'denied') {
    permissionStatus.style.background = '#7f1d1d';
    permissionStatus.style.color = '#f87171';
  }
}

// 1. Registrasi Service Worker & Ambil Token
async function initFCM() {
  try {
    if (!('serviceWorker' in navigator)) {
      appendLog('❌ Browser ini tidak mendukung Service Worker!');
      return;
    }

    appendLog('⚙️ Meregistrasikan Service Worker (firebase-messaging-sw.js)...');
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    appendLog('✅ Service Worker berhasil aktif.');

    appendLog('🔔 Meminta izin notifikasi ke browser...');
    const permission = await Notification.requestPermission();
    updatePermissionBadge();

    if (permission !== 'granted') {
      appendLog('⚠️ Izin notifikasi ditolak.');
      return;
    }

    if (!VAPID_KEY || VAPID_KEY.includes('YOUR_PUBLIC_VAPID_KEY') || VAPID_KEY.includes('GANTI_DENGAN')) {
      appendLog('⚠️ VAPID Key belum diset! Silakan isi VITE_FIREBASE_VAPID_KEY di file client/.env (diambil dari Firebase Console -> Cloud Messaging -> Web Push certificates).');
      return;
    }

    appendLog('🔑 Mengambil FCM Token dengan VAPID Key...');
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      currentFcmToken = token;
      fcmTokenInput.value = token;
      btnRegisterToServer.disabled = false;
      appendLog(`✅ Token berhasil didapatkan! (${token.substring(0, 16)}...)`);
    } else {
      appendLog('⚠️ Gagal mendapatkan token, periksa kembali VAPID Key di Firebase Console.');
    }
  } catch (error) {
    appendLog(`❌ Terjadi error: ${error.message}`);
    console.error(error);
  }
}

// 2. Kirim Token ke Server Node.js
async function registerTokenToServer() {
  if (!currentFcmToken) {
    alert('FCM Token belum ada!');
    return;
  }

  const userId = userIdInput.value.trim() || 'user_123';
  appendLog(`📤 Mengirim token ke backend (${API_BASE_URL}/api/tokens/register)...`);

  try {
    const res = await fetch(`${API_BASE_URL}/api/tokens/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, token: currentFcmToken })
    });

    const data = await res.json();
    if (res.ok) {
      appendLog(`✅ Token berhasil disimpan di server untuk User [${userId}]!`);
    } else {
      appendLog(`❌ Gagal kirim ke server: ${data.message}`);
    }
  } catch (error) {
    appendLog(`❌ Error fetch ke server: ${error.message}`);
  }
}

function showToast(title, body) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-title">🔔 ${title || 'Notifikasi Masuk'}</div>
    <div class="toast-body">${body || ''}</div>
  `;
  container.appendChild(toast);

  // Otomatis hilangkan setelah 6 detik
  setTimeout(() => {
    toast.style.transition = 'opacity 0.5s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 6000);
}

// 3. Listener Notifikasi Saat Tab Aktif (Foreground)
onMessage(messaging, (payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Notifikasi Baru';
  const body = payload.notification?.body || payload.data?.body || '';

  appendLog(`📩 Notifikasi Foreground Masuk: ${title} - ${body}`);
  console.log('[Foreground message]', payload);

  // Tampilkan visual toast pop-up di layar
  showToast(title, body);
});

// Event Listeners
btnRequestPermission.addEventListener('click', initFCM);
btnRegisterToServer.addEventListener('click', registerTokenToServer);

// Inisialisasi awal status
updatePermissionBadge();
