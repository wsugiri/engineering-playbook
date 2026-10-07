const fcmService = require('../services/fcm.service');
const { publish } = require('../config/pubsub');

// Penyimpanan token sederhana dalam memori (untuk simulasi/sample)
// Pada aplikasi production sesungguhnya, simpan di database (PostgreSQL, MongoDB, MySQL, dsb)
const userTokenStore = new Map();

/**
 * POST /api/tokens/register
 * Menerima token dari frontend Web/Mobile Client dan menyimpannya
 */
async function registerToken(req, res) {
  try {
    const { userId = 'anonymous', token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'FCM Token wajib disertakan' });
    }

    if (!userTokenStore.has(userId)) {
      userTokenStore.set(userId, new Set());
    }
    userTokenStore.get(userId).add(token);

    console.log(`[Token Registered] User: ${userId}, Token: ${token.substring(0, 20)}...`);

    return res.status(200).json({
      success: true,
      message: 'Token berhasil didaftarkan',
      userId,
      totalTokensForUser: userTokenStore.get(userId).size
    });
  } catch (error) {
    console.error('Error register token:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/tokens
 * Melihat daftar token yang sedang terdaftar (untuk kemudahan testing)
 */
async function listTokens(req, res) {
  const list = {};
  for (const [user, tokens] of userTokenStore.entries()) {
    list[user] = Array.from(tokens);
  }
  return res.json({ success: true, users: list });
}

/**
 * POST /api/notifications/send-user
 * Mengirim push notification ke user tertentu berdasarkan userId (Synchronous HTTP)
 */
async function sendToUser(req, res) {
  try {
    const { userId, title, body, data } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({
        success: false,
        message: 'userId, title, dan body wajib disertakan'
      });
    }

    const tokens = userTokenStore.get(userId);
    if (!tokens || tokens.size === 0) {
      return res.status(404).json({
        success: false,
        message: `Tidak ditemukan token aktif untuk user: ${userId}`
      });
    }

    const tokenArray = Array.from(tokens);

    if (tokenArray.length === 1) {
      const messageId = await fcmService.sendToToken({
        token: tokenArray[0],
        title,
        body,
        data
      });
      return res.json({ success: true, mode: 'single', messageId });
    }

    const result = await fcmService.sendMulticast({
      tokens: tokenArray,
      title,
      body,
      data
    });

    return res.json({ success: true, mode: 'multicast', result });
  } catch (error) {
    console.error('Error send to user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/notifications/send-direct
 * Mengirim notifikasi langsung ke spesifik token yang diinput di request body
 */
async function sendDirect(req, res) {
  try {
    const { token, title, body, data } = req.body;

    if (!token || !title || !body) {
      return res.status(400).json({
        success: false,
        message: 'token, title, dan body wajib disertakan'
      });
    }

    const messageId = await fcmService.sendToToken({ token, title, body, data });
    return res.json({ success: true, messageId });
  } catch (error) {
    console.error('Error send direct:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/notifications/send-topic
 * Mengirim notifikasi ke nama topik tertentu (broadcast FCM Topic)
 */
async function sendToTopic(req, res) {
  try {
    const { topic, title, body, data } = req.body;

    if (!topic || !title || !body) {
      return res.status(400).json({
        success: false,
        message: 'topic, title, dan body wajib disertakan'
      });
    }

    const messageId = await fcmService.sendToTopic({ topic, title, body, data });
    return res.json({ success: true, messageId });
  } catch (error) {
    console.error('Error send topic:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/events/publish
 * Mensimulasikan backend service (misal Service Order atau Service HR)
 * yang melempar event ke sistem Pub/Sub secara Asynchronous
 */
async function publishEvent(req, res) {
  try {
    const { topic, eventData = {} } = req.body;

    if (!topic) {
      return res.status(400).json({ success: false, message: 'Nama topic wajib disertakan' });
    }

    // Jika tidak menyertakan deviceToken langsung, coba ambil dari token user yang terdaftar
    if (!eventData.deviceToken && eventData.userId) {
      const userTokens = userTokenStore.get(eventData.userId);
      if (userTokens && userTokens.size > 0) {
        eventData.deviceToken = Array.from(userTokens)[0];
      }
    }

    // Lempar event ke Pub/Sub (Non-blocking)
    publish(topic, eventData);

    return res.status(202).json({
      success: true,
      message: `Event berhasil diterbitkan ke Pub/Sub topik "${topic}". Notifikasi akan diproses di background worker.`
    });
  } catch (error) {
    console.error('Error publish event:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  registerToken,
  listTokens,
  sendToUser,
  sendDirect,
  sendToTopic,
  publishEvent
};
