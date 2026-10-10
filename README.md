# Engineering Playbook

Repository ini berfungsi sebagai **Centralized Knowledge Base & Architecture Playbook** untuk tim engineering. Berisi panduan teknis, studi kasus arsitektur, dan contoh implementasi nyata (*Proof-of-Concept / Runnable Demos*).

---

## 📚 Katalog Studi Kasus & Panduan Teknis

| Proyek / Panduan | Kategori | Ringkasan Arsitektur | Dokumentasi & Kode |
| :--- | :--- | :--- | :--- |
| **Dojang PWA & Offline Engine** | *Frontend & PWA / Cloud* | Arsitektur 1 Domain Multi-Subpath (`/`, `/turn-pro/`, `/coach/`, `/member/`) dengan **Offline-First Capability**, Pre-caching, Local-First IndexedDB Outbox, Audio Synth, serta pemetaan AWS S3 & API Gateway/CloudFront tanpa Nginx. | [Buka Dokumentasi](dojang-offline-pwa-demo/README.md) |
| **Firebase Cloud Messaging (FCM)** | *Backend & Notification* | Implementasi FCM HTTP v1 API menggunakan Node.js, Web Push Service Worker di client, pendaftaran token, dan integrasi Pub/Sub Event Subscriber. | [Buka Dokumentasi](fcm-nodejs-demo/README.md) |

---

## 📂 Struktur Direktori Monorepo

```text
engineering-playbook/
├── README.md                                  # 📍 Katalog & Indeks Utama (File ini)
├── .gitignore                                 # Mengabaikan node_modules, .env, secret keys secara global
│
├── dojang-offline-pwa-demo/                   # 🥋 Studi Kasus: Multi-Subpath PWA & Offline Turnamen
│   ├── README.md                              # Dokumentasi arsitektur Dojang, SW scoping & AWS mapping
│   ├── client/                                # Frontend: Core, Turn Pro, Coach, Member
│   ├── server/                                # Backend Express: Batch Outbox Sync API & Mock Server
│   └── infra/                                 # AWS Cloud: S3 Deploy script & CloudFront SPA functions
│
└── fcm-nodejs-demo/                           # 🔔 Studi Kasus: FCM HTTP v1 & Pub/Sub
    ├── README.md                              # Dokumentasi alur pengiriman push notification
    ├── client/                                # Web client penerima Web Push
    └── server/                                # Backend Node.js pengirim notifikasi
```

---

## 🎯 Detail Studi Kasus

### 1. [Dojang Offline-First PWA Demo](dojang-offline-pwa-demo/README.md)
* **Kebutuhan:** Sistem pertandingan bela diri di mana arena gelanggang sering mengalami putus koneksi internet / WiFi tidak stabil.
* **Solusi Arsitektur:**
  * **Scoped Service Workers:** `/sw.js` (Core) dan `/turn-pro/sw.js` (Pertandingan) dalam 1 domain yang sama.
  * **Local-First Database:** Menggunakan native IndexedDB untuk menyimpan data partai dan antrean event skor secara *zero-latency*.
  * **Event Sourcing & Outbox Pattern:** Setiap poin tersimpan sebagai aksi imutabel yang otomatis disinkronkan saat online melalui background sync.
  * **AWS S3 + API Gateway / CloudFront:** Konfigurasi hosting statis multi-subpath tanpa Nginx dengan header `Service-Worker-Allowed` dan bypass cache untuk `sw.js`.

### 2. [Firebase Cloud Messaging (FCM) Demo](fcm-nodejs-demo/README.md)
* **Kebutuhan:** Standar push notification berbasis web dan mobile yang aman dan sesuai protokol terbaru Google FCM HTTP v1.
* **Solusi Arsitektur:**
  * Pemisahan kredensial: VAPID Public Key di web client dan Private Service Account di backend.
  * Background notification via `firebase-messaging-sw.js` (mendukung standalone root maupun modular subpath via `serviceWorkerRegistration`).
  * Integrasi event consumer (Pub/Sub) untuk memicu notifikasi transaksi/order secara asinkron.

---

## 🛡️ Best Practice Arsitektur: Multi-Service Worker & Mitigasi Konflik (1 Domain, Multi-Subpath)

Ketika membangun aplikasi monorepo di mana masing-masing modul memiliki proses build dan direktori terpisah namun di-host dalam **1 domain yang sama** (misal `domain.com/` untuk Core portal dan `domain.com/turn-pro/` untuk modul arena):

### Mengapa TIDAK CUKUP Hanya Memasang Service Worker di Core?
1. **Cold Start & Direct Refresh**: Jika user langsung membuka link atau merefresh tab di `domain.com/turn-pro/` saat offline tanpa pernah membuka landing page Core, browser belum pernah mengunduh SW Core. Halaman akan langsung down.
2. **Decoupled Build & Deployment**: Setiap modul memiliki hash asset dan siklus rilis mandiri. Menyatukan SW di Core memaksa build ulang Core setiap ada perubahan kecil di sub-modul.
3. **Strategi Caching Berlawanan**: Core memerlukan strategi `NetworkFirst`/`StaleWhileRevalidate`, sementara modul arena memerlukan `CacheFirst` agresif.

### 4 Pilar Menghindari Konflik Saat User Mulai dari Core Lalu Pindah ke Subpath:

1. **Bypass Intersepsi di Core SW (`/sw.js`)**:
   Pada event `fetch` milik Core SW, wajib lakukan pengecekan pathname. Jika request mengarah ke subpath modul independen (`/turn-pro/`, `/coach/`), biarkan langsung lolos (*passthrough*) agar tidak terintersepsi oleh routing SPA Core:
   ```javascript
   // Di /sw.js (Core)
   self.addEventListener('fetch', (event) => {
     const url = new URL(event.request.url);
     if (url.pathname.startsWith('/turn-pro/')) return; // Biarkan SW Turn Pro yang menangani
     // ... logic caching Core
   });
   ```
2. **Isolasi Namespace Cache Storage**:
   Karena `CacheStorage` berbagi origin yang sama, berikan prefix unik (misal `core-v1` vs `turnpro-v1`). Saat pembersihan cache lama di event `activate`, pastikan hanya menghapus cache dengan prefix masing-masing agar tidak saling menghapus cache offline modul lain.
3. **Instant Claiming di Subpath SW (`/turn-pro/sw.js`)**:
   Gunakan `self.skipWaiting()` pada event `install` dan `self.clients.claim()` pada event `activate` agar SW subpath langsung mengambil kendali tab saat user bernavigasi dari Core, tanpa harus menunggu reload berikutnya.
4. **Registrasi FCM Eksplisit**:
   Pada modul subpath yang membutuhkan push notification, jangan mengandalkan pencarian default root `/firebase-messaging-sw.js`. Selalu oper instance `serviceWorkerRegistration` lokal ke `getToken(messaging, { serviceWorkerRegistration })`.

---

## 🛠️ Konvensi Menambahkan Dokumentasi Baru

Jika tim ingin menambahkan studi kasus atau PoC baru ke dalam repository ini:
1. Buat folder baru dengan format nama: `<topik>-<kategori>-demo` (misal: `oauth2-sso-demo`, `websocket-chat-poc`).
2. Setiap folder wajib memiliki `README.md` mandiri yang menjelaskan arsitektur, diagram alur (Mermaid), dan langkah menjalankan demo.
3. Cantumkan `.env.example` jika membutuhkan variabel konfigurasi, **jangan commit file `.env` asli atau kredensial rahasia**.
4. Daftarkan studi kasus baru pada tabel katalog di root [README.md](README.md).

