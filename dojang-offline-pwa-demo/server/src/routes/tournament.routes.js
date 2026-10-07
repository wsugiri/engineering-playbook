const express = require("express");
const router = express.Router();
const { mockTournament, syncedEventLogs } = require("../data/mock-tournament");

/**
 * GET /api/turn-pro/matches
 * Endpoint untuk download data gelanggang sebelum pertandingan (Pre-caching di IndexedDB)
 */
router.get("/matches", (req, res) => {
  return res.json({
    success: true,
    data: mockTournament,
    downloadedAt: new Date().toISOString()
  });
});

/**
 * POST /api/turn-pro/sync
 * Endpoint untuk menerima batch action events dari Outbox Queue offline client
 */
router.post("/sync", (req, res) => {
  const { events } = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Daftar events kosong atau format tidak valid"
    });
  }

  const processedIds = [];
  const errors = [];

  events.forEach((event) => {
    // Idempotency check: Jangan simpan jika event ID sudah pernah disinkronkan
    const exists = syncedEventLogs.some((e) => e.id === event.id);
    if (!exists) {
      syncedEventLogs.push({
        ...event,
        serverReceivedAt: new Date().toISOString()
      });
      processedIds.push(event.id);
    } else {
      // Sudah ada, tetap dianggap sukses (idempotent)
      processedIds.push(event.id);
    }
  });

  console.log(`[Sync Engine] Berhasil memproses ${processedIds.length} event dari client.`);

  return res.json({
    success: true,
    message: `Berhasil menyinkronkan ${processedIds.length} event`,
    syncedEventIds: processedIds,
    totalLogsInServer: syncedEventLogs.length,
    serverTimestamp: Date.now()
  });
});

/**
 * GET /api/turn-pro/logs
 * Melihat semua log scoring yang telah disinkronkan ke server
 */
router.get("/logs", (req, res) => {
  return res.json({
    success: true,
    count: syncedEventLogs.length,
    logs: syncedEventLogs
  });
});

module.exports = router;
