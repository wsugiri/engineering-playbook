const { subscribe } = require('../config/pubsub');
const { handleOrderEvent } = require('./subscribers/order.subscriber');
const { handleHrEvent } = require('./subscribers/hr.subscriber');

/**
 * Mendaftarkan seluruh subscriber ke masing-masing topik Pub/Sub
 */
function initPubSubListeners() {
  console.log('📡 Menginisialisasi Pub/Sub Event Listeners...');

  // Topik: order-events -> ditangani oleh order.subscriber
  subscribe('order-events', handleOrderEvent);

  // Topik: hr-events -> ditangani oleh hr.subscriber
  subscribe('hr-events', handleHrEvent);

  console.log('✅ Semua Pub/Sub listeners aktif dan siap menerima event.');
}

module.exports = {
  initPubSubListeners
};
