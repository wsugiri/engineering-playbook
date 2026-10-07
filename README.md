# Engineering Playbook

Repository ini berfungsi sebagai **Centralized Knowledge Base & Architecture Playbook** untuk tim engineering. Berisi panduan teknis, studi kasus arsitektur, dan contoh implementasi nyata (*Proof-of-Concept / Runnable Demos*).

---

## 📚 Katalog Studi Kasus & Panduan Teknis

| Proyek / Panduan | Kategori | Ringkasan Arsitektur | Dokumentasi & Kode |
| :--- | :--- | :--- | :--- |
| **Dojang PWA & Offline Engine** | *Frontend & PWA / Cloud* | Arsitektur 1 Domain Multi-Subpath (`/`, `/turn-pro/`, `/coach/`, `/member/`) dengan **Offline-First Capability**, Pre-caching, Local-First IndexedDB Outbox, Audio Synth, serta pemetaan AWS S3 & API Gateway/CloudFront tanpa Nginx. | [Buka Dokumentasi](file:///Users/riopermana/Source/docs/dojang-offline-pwa-demo/README.md) |
| **Firebase Cloud Messaging (FCM)** | *Backend & Notification* | Implementasi FCM HTTP v1 API menggunakan Node.js, Web Push Service Worker di client, pendaftaran token, dan integrasi Pub/Sub Event Subscriber. | [Buka Dokumentasi](file:///Users/riopermana/Source/docs/fcm-nodejs-demo/README.md) |
| **Evaluasi Internal QA & Dev** | *Engineering Process* | Laporan hasil diskusi dan evaluasi internal alur kerja development antara tim QA dan Developer. | [Lihat Dokumen PDF](file:///Users/riopermana/Source/docs/Laporan%20Hasil%20Diskusi%20dan%20Evaluasi%20Internal%20Proses%20Development%20-%20Tim%20QA%20&%20Dev.pdf) |

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
├── fcm-nodejs-demo/                           # 🔔 Studi Kasus: FCM HTTP v1 & Pub/Sub
│   ├── README.md                              # Dokumentasi alur pengiriman push notification
│   ├── client/                                # Web client penerima Web Push
│   └── server/                                # Backend Node.js pengirim notifikasi
│
└── Laporan Hasil Diskusi dan Evaluasi...pdf   # 📋 Laporan retrospektif QA & Dev
```

---

## 🎯 Detail Studi Kasus

### 1. [Dojang Offline-First PWA Demo](file:///Users/riopermana/Source/docs/dojang-offline-pwa-demo/README.md)
* **Kebutuhan:** Sistem pertandingan bela diri di mana arena gelanggang sering mengalami putus koneksi internet / WiFi tidak stabil.
* **Solusi Arsitektur:**
  * **Scoped Service Workers:** `/sw.js` (Core) dan `/turn-pro/sw.js` (Pertandingan) dalam 1 domain yang sama.
  * **Local-First Database:** Menggunakan native IndexedDB untuk menyimpan data partai dan antrean event skor secara *zero-latency*.
  * **Event Sourcing & Outbox Pattern:** Setiap poin tersimpan sebagai aksi imutabel yang otomatis disinkronkan saat online melalui background sync.
  * **AWS S3 + API Gateway / CloudFront:** Konfigurasi hosting statis multi-subpath tanpa Nginx dengan header `Service-Worker-Allowed` dan bypass cache untuk `sw.js`.

### 2. [Firebase Cloud Messaging (FCM) Demo](file:///Users/riopermana/Source/docs/fcm-nodejs-demo/README.md)
* **Kebutuhan:** Standar push notification berbasis web dan mobile yang aman dan sesuai protokol terbaru Google FCM HTTP v1.
* **Solusi Arsitektur:**
  * Pemisahan kredensial: VAPID Public Key di web client dan Private Service Account di backend.
  * Background notification via `firebase-messaging-sw.js`.
  * Integrasi event consumer (Pub/Sub) untuk memicu notifikasi transaksi/order secara asinkron.

---

## 🛠️ Konvensi Menambahkan Dokumentasi Baru

Jika tim ingin menambahkan studi kasus atau PoC baru ke dalam repository ini:
1. Buat folder baru dengan format nama: `<topik>-<kategori>-demo` (misal: `oauth2-sso-demo`, `websocket-chat-poc`).
2. Setiap folder wajib memiliki `README.md` mandiri yang menjelaskan arsitektur, diagram alur (Mermaid), dan langkah menjalankan demo.
3. Cantumkan `.env.example` jika membutuhkan variabel konfigurasi, **jangan commit file `.env` asli atau kredensial rahasia**.
4. Daftarkan studi kasus baru pada tabel katalog di root [README.md](file:///Users/riopermana/Source/docs/README.md).
