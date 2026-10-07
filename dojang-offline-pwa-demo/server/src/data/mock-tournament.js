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
    roundDurationSeconds: 120, // 2 menit
    restDurationSeconds: 60,   // 1 menit istirahat
    maxGamJeom: 5              // 5 gam-jeom = diskualifikasi
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
  ]
};

// Database in-memory untuk menyimpan event skor yang berhasil disinkronisasi
const syncedEventLogs = [];

module.exports = {
  mockTournament,
  syncedEventLogs
};
