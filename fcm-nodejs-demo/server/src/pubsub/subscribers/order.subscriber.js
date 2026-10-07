const fcmService = require('../../services/fcm.service');

/**
 * Subscriber untuk event seputar transaksi / order
 */
async function handleOrderEvent(eventData) {
  const { eventType, userId, orderId, totalAmount, deviceToken } = eventData;

  console.log(`[OrderSubscriber] Memproses event: ${eventType} untuk Order #${orderId}`);

  if (!deviceToken) {
    console.warn(`[OrderSubscriber] Device token tidak ditemukan untuk user ${userId}, lewati push.`);
    return;
  }

  let title = 'Informasi Pesanan 📦';
  let body = `Status pesanan #${orderId} telah diperbarui.`;

  if (eventType === 'ORDER_PAID') {
    title = 'Pembayaran Berhasil! 💳';
    body = `Pesanan #${orderId} senilai Rp${Number(totalAmount || 0).toLocaleString()} telah kami terima.`;
  } else if (eventType === 'ORDER_SHIPPED') {
    title = 'Pesanan Sedang Dikirim 🚚';
    body = `Pesanan #${orderId} telah diserahkan ke kurir pengiriman.`;
  }

  // Kirim FCM Push Notification dengan metadata routing modul
  await fcmService.sendToToken({
    token: deviceToken,
    title,
    body,
    data: {
      module: 'MOD_ORDER',
      actionUrl: `/orders/detail/${orderId}`,
      orderId: String(orderId),
      eventType: String(eventType)
    }
  });

  console.log(`[OrderSubscriber] Push notif berhasil dikirim ke perangkat user ${userId}.`);
}

module.exports = {
  handleOrderEvent
};
