const express = require('express');
const cors = require('cors');
require('dotenv').config();

const notificationRoutes = require('./routes/notification.routes');
const { initPubSubListeners } = require('./pubsub/pubsub.listener');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', notificationRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Jalankan Server & Listeners
app.listen(PORT, () => {
  console.log(`🚀 FCM Server berjalan di http://localhost:${PORT}`);
  console.log(`📡 Endpoint register token: POST http://localhost:${PORT}/api/tokens/register`);
  console.log(`🔔 Endpoint kirim notifikasi: POST http://localhost:${PORT}/api/notifications/send-user`);
  console.log(`⚡ Endpoint publish event Pub/Sub: POST http://localhost:${PORT}/api/events/publish`);

  // Inisialisasi antrian subscriber Pub/Sub
  initPubSubListeners();
});
