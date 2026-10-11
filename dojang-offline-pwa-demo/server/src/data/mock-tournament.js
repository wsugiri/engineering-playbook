/**
 * Mock Data Master Pertandingan Turnamen Dojang
 * Digunakan untuk di-download ke IndexedDB sebelum masuk ke gelanggang
 */

const mockTournament = {
  id: "TRN-2026-NATIONAL",
  name: "Dojang Championship Open 2026",
  arena: "Gelanggang 1 (Court A)",
  date: "2026-10-07",
  rules: {
    rounds: 3,
    roundDurationSeconds: 120, // 2 menit kyorugi
    restDurationSeconds: 60,   // 1 menit istirahat
    maxGamJeom: 5,             // 5 gam-jeom = diskualifikasi
    poomsaeDurationSeconds: 90,// 90 detik batas durasi poomsae
    poomsaeBaseAccuracy: 4.0,  // Base akurasi WT: 4.00
    poomsaeBasePresentation: 6.0 // Base presentasi WT: 6.00
  },
  matches: [
    {
      matchId: "M-101",
      order: 1,
      category: "Senior Putra Kyorugi Under 68kg",
      phase: "Semifinal",
      blueCorner: {
        id: "ATL-001",
        name: "Ahmad Rayhan",
        dojang: "Garuda Taekwondo Club",
        points: 0,
        gamJeom: 0
      },
      redCorner: {
        id: "ATL-002",
        name: "Budi Santoso",
        dojang: "Rajawali Martial Art",
        points: 0,
        gamJeom: 0
      },
      status: "READY" // READY | IN_PROGRESS | COMPLETED
    },
    {
      matchId: "M-102",
      order: 2,
      category: "Senior Putra Kyorugi Under 58kg",
      phase: "Final",
      blueCorner: {
        id: "ATL-003",
        name: "Kevin Pratama",
        dojang: "Harimau Putih Dojang",
        points: 0,
        gamJeom: 0
      },
      redCorner: {
        id: "ATL-004",
        name: "Dian Wahyudi",
        dojang: "Singa Perkasa Club",
        points: 0,
        gamJeom: 0
      },
      status: "UPCOMING"
    }
  ],
  poomsaeMatches: [
    {
      matchId: "PM-201",
      order: 1,
      type: "BATTLE",
      category: "Senior Putra Individual Recognized Poomsae",
      phase: "Final Battle",
      poomsaeName: "Koryo",
      durationSeconds: 90,
      blueCorner: {
        id: "ATL-P01",
        name: "Muhammad Fadhil",
        dojang: "Garuda Taekwondo Club",
        danLevel: "Dan 2 Kukkiwon"
      },
      redCorner: {
        id: "ATL-P02",
        name: "Bagas Wicaksono",
        dojang: "Elang Merah Academy",
        danLevel: "Dan 2 Kukkiwon"
      },
      status: "READY"
    },
    {
      matchId: "PM-202",
      order: 2,
      type: "BATTLE",
      category: "Senior Putri Individual Recognized Poomsae",
      phase: "Final Battle",
      poomsaeName: "Keumgang",
      durationSeconds: 90,
      blueCorner: {
        id: "ATL-P03",
        name: "Annisa Larasati",
        dojang: "Satria Nusantara Dojang",
        danLevel: "Dan 3 Kukkiwon"
      },
      redCorner: {
        id: "ATL-P04",
        name: "Siti Rahmawati",
        dojang: "Rajawali Martial Art",
        danLevel: "Dan 2 Kukkiwon"
      },
      status: "UPCOMING"
    },
    {
      matchId: "PM-203",
      order: 3,
      type: "CUT_OFF",
      category: "Junior Putra Recognized Poomsae (Cut-off Leaderboard)",
      phase: "Babak Final",
      poomsaeName: "Taegeuk 8 Jang",
      durationSeconds: 90,
      contestants: [
        { id: "ATL-P05", name: "Rizky Ramadhan", dojang: "Garuda Taekwondo Club", score: 7.82 },
        { id: "ATL-P06", name: "Dimas Anggara", dojang: "Harimau Putih Dojang", score: 7.74 },
        { id: "ATL-P07", name: "Alif Hidayat", dojang: "Singa Perkasa Club", score: 0.00 }
      ],
      status: "UPCOMING"
    }
  ]
};

// Database in-memory untuk menyimpan event skor yang berhasil disinkronisasi
const syncedEventLogs = [];

module.exports = {
  mockTournament,
  syncedEventLogs
};
