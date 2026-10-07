const fcmService = require('../../services/fcm.service');

/**
 * Subscriber untuk event seputar modul HR / Kepegawaian (misal pengajuan cuti)
 */
async function handleHrEvent(eventData) {
  const { eventType, userId, leaveRequestId, employeeName, deviceToken } = eventData;

  console.log(`[HrSubscriber] Memproses event: ${eventType} untuk pengajuan cuti #${leaveRequestId}`);

  if (!deviceToken) {
    console.warn(`[HrSubscriber] Device token tidak ditemukan untuk user ${userId}, lewati push.`);
    return;
  }

  let title = 'Pembaruan HR 🏢';
  let body = 'Ada pembaruan status kepegawaian Anda.';

  if (eventType === 'LEAVE_APPROVED') {
    title = 'Pengajuan Cuti Disetujui ✅';
    body = `Halo ${employeeName || 'Karyawan'}, permohonan cuti Anda #${leaveRequestId} telah disetujui atasan.`;
  } else if (eventType === 'LEAVE_REJECTED') {
    title = 'Pengajuan Cuti Ditolak ❌';
    body = `Permohonan cuti #${leaveRequestId} Anda belum disetujui. Silakan cek detail alasan.`;
  }

  // Kirim FCM Push Notification dengan metadata modul HR
  await fcmService.sendToToken({
    token: deviceToken,
    title,
    body,
    data: {
      module: 'MOD1_HR',
      actionUrl: `/mod1/cuti/detail/${leaveRequestId}`,
      leaveRequestId: String(leaveRequestId),
      eventType: String(eventType)
    }
  });

  console.log(`[HrSubscriber] Push notif HR berhasil dikirim ke perangkat user ${userId}.`);
}

module.exports = {
  handleHrEvent
};
