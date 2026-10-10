const { messaging } = require('../config/firebase');

function getMessaging() {
  if (!messaging) {
    throw new Error('Firebase Admin SDK belum diinisialisasi. Pastikan file service-account.json valid.');
  }
  return messaging;
}

/**
 * Kirim notifikasi ke 1 token perangkat
 */
async function sendToToken({ token, title, body, data = {}, imageUrl }) {
  if (!token) throw new Error('Target token wajib diisi');

  const message = {
    token,
    notification: {
      title,
      body,
      ...(imageUrl && { imageUrl })
    },
    // Data custom (Semua value wajib bertipe string di FCM)
    data: Object.fromEntries(
      Object.entries(data).map(([key, val]) => [key, String(val)])
    ),
    android: {
      priority: 'high',
      notification: {
        sound: 'default'
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      }
    }
  };

  return await getMessaging().send(message);
}

/**
 * Kirim notifikasi ke banyak token sekaligus (Multicast)
 */
async function sendMulticast({ tokens = [], title, body, data = {} }) {
  if (!tokens.length) throw new Error('Daftar tokens tidak boleh kosong');

  const message = {
    tokens,
    notification: {
      title,
      body
    },
    data: Object.fromEntries(
      Object.entries(data).map(([key, val]) => [key, String(val)])
    )
  };

  const response = await getMessaging().sendEachForMulticast(message);

  // Identifikasi token yang gagal atau sudah expired
  const failedTokens = [];
  response.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const errorCode = resp.error?.code;
      failedTokens.push({
        token: tokens[idx],
        error: errorCode
      });

      // Token ini harus dibersihkan dari database
      if (
        errorCode === 'messaging/registration-token-not-registered' ||
        errorCode === 'messaging/invalid-registration-token'
      ) {
        console.warn(`[Cleanup Warning] Token kedaluwarsa: ${tokens[idx]}`);
      }
    }
  });

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    failedTokens
  };
}

/**
 * Kirim notifikasi ke suatu topik
 */
async function sendToTopic({ topic, title, body, data = {} }) {
  if (!topic) throw new Error('Topic wajib diisi');

  const message = {
    topic,
    notification: {
      title,
      body
    },
    data: Object.fromEntries(
      Object.entries(data).map(([key, val]) => [key, String(val)])
    )
  };

  return await getMessaging().send(message);
}

/**
 * Subscribe token ke topik tertentu
 */
async function subscribeTopic(tokens, topic) {
  const tokenList = Array.isArray(tokens) ? tokens : [tokens];
  return await getMessaging().subscribeToTopic(tokenList, topic);
}

/**
 * Unsubscribe token dari topik tertentu
 */
async function unsubscribeTopic(tokens, topic) {
  const tokenList = Array.isArray(tokens) ? tokens : [tokens];
  return await getMessaging().unsubscribeFromTopic(tokenList, topic);
}

module.exports = {
  sendToToken,
  sendMulticast,
  sendToTopic,
  subscribeTopic,
  unsubscribeTopic
};
