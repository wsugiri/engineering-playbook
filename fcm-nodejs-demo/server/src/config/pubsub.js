const EventEmitter = require('events');

/**
 * Pub/Sub Message Broker Adapter
 * 
 * Secara default menggunakan Node.js EventEmitter bawaan agar bisa langsung
 * dijalankan tanpa perlu setup cluster eksternal.
 * 
 * Jika di production ingin dihubungkan ke Google Cloud Pub/Sub atau Redis:
 * Cukup ganti method publish() & subscribe() di bawah dengan SDK masing-masing.
 */
class PubSubBroker extends EventEmitter {}

const broker = new PubSubBroker();
// Tingkatkan limit listener agar tidak warning pada banyak subscriber
broker.setMaxListeners(50);

/**
 * Publish pesan ke suatu topik
 * @param {string} topic - Nama topik (misal: 'order-events', 'hr-events')
 * @param {object} payload - Data event
 */
function publish(topic, payload) {
  console.log(`[PubSub -> Publish] Topik: "${topic}"`, payload);
  // Menggunakan setImmediate agar benar-benar asynchronous (non-blocking)
  setImmediate(() => {
    broker.emit(topic, payload);
  });
}

/**
 * Mendaftarkan subscriber ke suatu topik
 * @param {string} topic - Nama topik
 * @param {Function} handler - Callback fungsi yang dieksekusi saat pesan masuk
 */
function subscribe(topic, handler) {
  console.log(`[PubSub -> Subscribed] Menyimak topik: "${topic}"`);
  broker.on(topic, async (payload) => {
    try {
      await handler(payload);
    } catch (error) {
      console.error(`[PubSub Error] Gagal memproses pesan di topik "${topic}":`, error.message);
    }
  });
}

module.exports = {
  publish,
  subscribe
};
