const express = require('express');
const router = express.Router();
const {
  registerToken,
  listTokens,
  sendToUser,
  sendDirect,
  sendToTopic,
  publishEvent
} = require('../controllers/notification.controller');

// Rute pendaftaran dan pengecekan token
router.post('/tokens/register', registerToken);
router.get('/tokens', listTokens);

// Rute pengiriman notifikasi langsung (REST API Sync)
router.post('/notifications/send-user', sendToUser);
router.post('/notifications/send-direct', sendDirect);
router.post('/notifications/send-topic', sendToTopic);

// Rute simulasi event Pub/Sub (Async Producer)
router.post('/events/publish', publishEvent);

module.exports = router;
