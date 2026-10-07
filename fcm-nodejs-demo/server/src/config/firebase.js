const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './service-account.json';
const resolvedPath = path.resolve(process.cwd(), serviceAccountPath);

try {
  const serviceAccount = require(resolvedPath);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK berhasil diinisialisasi.');
  }
} catch (error) {
  console.error(`❌ Gagal memuat file service account dari: ${resolvedPath}`);
  console.error('Silakan letakkan file service-account.json dari Firebase Console di folder server/');
}

const messaging = admin.messaging();

module.exports = {
  admin,
  messaging
};
