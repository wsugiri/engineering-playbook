/**
 * Dojang Turn Pro - Offline-First Match Engine & Scoreboard
 * 
 * Fitur:
 * 1. Dedicated Service Worker Registration (/turn-pro/)
 * 2. Local-First Database via IndexedDB (Match state & Outbox Queue)
 * 3. Web Audio API Synthesizer (Buzzer & Gong instan tanpa file MP3 eksternal)
 * 4. Background Sync & Outbox Batch Dispatcher
 * 5. Fitur Simulasi Mode Offline untuk Testing
 */

// ============================================================================
// 1. REGISTRASI SERVICE WORKER (Scope: /turn-pro/)
// ============================================================================
let swRegistration = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      swRegistration = await navigator.serviceWorker.register('/turn-pro/sw.js', { scope: '/turn-pro/' });
      console.log('[Turn Pro] Service Worker aktif dengan scope:', swRegistration.scope);

      // Listener pesan dari Service Worker (misal pemicu background sync)
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'TRIGGER_OUTBOX_SYNC') {
          console.log('[Turn Pro] Menerima instruksi sync dari Service Worker!');
          syncOutboxToServer();
        }
      });
    } catch (err) {
      console.error('[Turn Pro] Gagal mendaftarkan Service Worker:', err);
    }
  });
}

// ============================================================================
// 2. LOCAL-FIRST DATABASE (Native IndexedDB)
// ============================================================================
const DB_NAME = 'DojangTurnProDB';
const DB_VERSION = 1;
let db = null;

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      // Object Store 1: Data Master Pertandingan & Bagan
      if (!database.objectStoreNames.contains('matches')) {
        database.createObjectStore('matches', { keyPath: 'matchId' });
      }
      // Object Store 2: Outbox Scoring Actions (Event Sourcing)
      if (!database.objectStoreNames.contains('outbox')) {
        const outboxStore = database.createObjectStore('outbox', { keyPath: 'id' });
        outboxStore.createIndex('synced', 'synced', { unique: false });
        outboxStore.createIndex('matchId', 'matchId', { unique: false });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      console.log('[IndexedDB] Database DojangTurnProDB siap digunakan secara offline.');
      resolve(db);
    };

    request.onerror = (e) => {
      console.error('[IndexedDB] Gagal membuka database:', e.target.error);
      reject(e.target.error);
    };
  });
}

async function saveMatchToLocalDB(matchData) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('matches', 'readwrite');
    const store = tx.objectStore('matches');
    store.put(matchData);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function addOutboxEvent(event) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    store.add(event);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getPendingOutboxEvents() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result || [];
      const pending = all.filter((item) => !item.synced);
      resolve(pending);
    };
    request.onerror = () => reject(tx.error);
  });
}

async function getAllOutboxLogs() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(tx.error);
  });
}

async function markEventsAsSynced(eventIds) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    
    eventIds.forEach((id) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const data = getReq.result;
        if (data) {
          data.synced = true;
          data.syncedAt = new Date().toISOString();
          store.put(data);
        }
      };
    });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================================
// 3. SOUND SYNTHESIZER (Web Audio API)
// ============================================================================
let audioCtx = null;

function playBuzzerSound(type = 'point') {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'buzzer') {
      // Suara Buzzer Keras / Gong Ronde Selesai
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, audioCtx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } else {
      // Suara Beep Skor Poin
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    }
  } catch (err) {
    console.warn('Audio synthesis error:', err);
  }
}

// ============================================================================
// 4. SCOREBOARD STATE & LOGIC
// ============================================================================
let currentMatch = {
  matchId: "M-101",
  category: "Senior Putra Kyorugi Under 68kg",
  round: 1,
  bluePoints: 0,
  redPoints: 0,
  blueGamJeom: 0,
  redGamJeom: 0
};

let timerSeconds = 120;
let timerInterval = null;
let isTimerRunning = false;
let isSimulatedOffline = false;

// DOM Elements
const elBlueScore = document.getElementById('blue-score');
const elRedScore = document.getElementById('red-score');
const elBlueGamjeom = document.getElementById('blue-gamjeom');
const elRedGamjeom = document.getElementById('red-gamjeom');
const elRoundNumber = document.getElementById('round-number');
const elTimerDisplay = document.getElementById('timer-display');
const elBtnTimerToggle = document.getElementById('btn-timer-toggle');
const elPendingCount = document.getElementById('pending-count');
const elOfflineStatus = document.getElementById('offline-status');
const elOfflineText = document.getElementById('offline-text');
const elBtnSimulateOffline = document.getElementById('btn-simulate-offline');
const elLogTableBody = document.getElementById('log-table-body');

function renderScores() {
  if (elBlueScore) elBlueScore.textContent = currentMatch.bluePoints;
  if (elRedScore) elRedScore.textContent = currentMatch.redPoints;
  if (elBlueGamjeom) elBlueGamjeom.textContent = currentMatch.blueGamJeom;
  if (elRedGamjeom) elRedGamjeom.textContent = currentMatch.redGamJeom;
  if (elRoundNumber) elRoundNumber.textContent = currentMatch.round;
}

function formatTimer(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
  if (elTimerDisplay) {
    elTimerDisplay.textContent = formatTimer(timerSeconds);
  }
}

// Tambah Aksi Skor & Tulis Langsung ke Local Outbox (Zero-Latency)
async function recordScoreAction(targetCorner, actionType, pointsDelta) {
  playBuzzerSound('point');

  // Update State Lokal UI langsung
  if (targetCorner === 'BLUE') {
    if (actionType === 'GAMJEOM') {
      currentMatch.blueGamJeom += 1;
      currentMatch.redPoints += 1; // Taekwondo: Gam-jeom lawan dapat 1 poin
    } else {
      currentMatch.bluePoints += pointsDelta;
    }
  } else if (targetCorner === 'RED') {
    if (actionType === 'GAMJEOM') {
      currentMatch.redGamJeom += 1;
      currentMatch.bluePoints += 1;
    } else {
      currentMatch.redPoints += pointsDelta;
    }
  }
  renderScores();

  // Buat Event Log Imutable
  const eventPayload = {
    id: 'evt-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    matchId: currentMatch.matchId,
    targetCorner,
    actionType,
    pointsDelta,
    round: currentMatch.round,
    timestamp: Date.now(),
    synced: false
  };

  // Simpan ke IndexedDB Outbox
  await addOutboxEvent(eventPayload);
  await refreshLogsAndPendingCount();

  // Jika kondisi online, coba sync otomatis
  if (isSystemOnline()) {
    triggerSync();
  }
}

// ============================================================================
// 5. TIMER MANAGEMENT
// ============================================================================
function toggleTimer() {
  if (isTimerRunning) {
    clearInterval(timerInterval);
    isTimerRunning = false;
    elBtnTimerToggle.textContent = '▶ Mulai Ronde';
    elBtnTimerToggle.classList.remove('btn-pause');
  } else {
    isTimerRunning = true;
    elBtnTimerToggle.textContent = '⏸ Jeda Ronde';
    elBtnTimerToggle.classList.add('btn-pause');

    timerInterval = setInterval(() => {
      if (timerSeconds > 0) {
        timerSeconds--;
        updateTimerDisplay();
      } else {
        clearInterval(timerInterval);
        isTimerRunning = false;
        elBtnTimerToggle.textContent = '▶ Ronde Selesai';
        playBuzzerSound('buzzer');
        alert(`Waktu Ronde ${currentMatch.round} Selesai!`);
      }
    }, 1000);
  }
}

function resetTimer() {
  clearInterval(timerInterval);
  isTimerRunning = false;
  timerSeconds = 120;
  updateTimerDisplay();
  if (elBtnTimerToggle) elBtnTimerToggle.textContent = '▶ Mulai Ronde';
}

function nextRound() {
  if (currentMatch.round < 3) {
    currentMatch.round++;
    resetTimer();
    renderScores();
  } else {
    alert('Pertandingan 3 Ronde telah selesai!');
  }
}

// ============================================================================
// 6. SYNC ENGINE (Local Outbox to Server Cloud)
// ============================================================================
function isSystemOnline() {
  return navigator.onLine && !isSimulatedOffline;
}

function updateNetworkUI() {
  const online = isSystemOnline();
  if (online) {
    elOfflineStatus.classList.remove('is-offline');
    elOfflineText.textContent = 'TERHUBUNG (ONLINE)';
    elBtnSimulateOffline.textContent = '🔌 Simulasikan Putus Sinyal (Offline)';
  } else {
    elOfflineStatus.classList.add('is-offline');
    elOfflineText.textContent = 'TERPUTUS (MODE OFFLINE)';
    elBtnSimulateOffline.textContent = '🟢 Pulihkan Sinyal (Online)';
  }
}

async function triggerSync() {
  // Jika browser mendukung Background Sync, request sync
  if ('serviceWorker' in navigator && 'SyncManager' in window && swRegistration) {
    try {
      await swRegistration.sync.register('sync-match-scores');
    } catch (e) {
      // Fallback direct sync
      syncOutboxToServer();
    }
  } else {
    syncOutboxToServer();
  }
}

async function syncOutboxToServer() {
  if (!isSystemOnline()) {
    console.log('[Sync Engine] Tidak bisa sync: Mode Offline aktif.');
    return;
  }

  const pendingEvents = await getPendingOutboxEvents();
  if (pendingEvents.length === 0) {
    return;
  }

  console.log(`[Sync Engine] Mengirim ${pendingEvents.length} event ke server...`);

  try {
    const res = await fetch('/api/turn-pro/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: pendingEvents })
    });

    const result = await res.json();
    if (result.success && result.syncedEventIds) {
      await markEventsAsSynced(result.syncedEventIds);
      console.log('[Sync Engine] Berhasil menyinkronkan event ke cloud.');
      await refreshLogsAndPendingCount();
    }
  } catch (err) {
    console.warn('[Sync Engine] Gagal mengirim sync (jaringan tidak stabil):', err.message);
  }
}

async function refreshLogsAndPendingCount() {
  const pending = await getPendingOutboxEvents();
  const allLogs = await getAllOutboxLogs();

  if (elPendingCount) {
    elPendingCount.textContent = `${pending.length} Event Antrean Offline`;
  }

  if (elLogTableBody) {
    elLogTableBody.innerHTML = allLogs
      .slice(-10)
      .reverse()
      .map((item) => `
        <tr>
          <td>${item.id}</td>
          <td>Ronde ${item.round}</td>
          <td><strong>${item.targetCorner}</strong>: ${item.actionType} (${item.pointsDelta > 0 ? '+' : ''}${item.pointsDelta})</td>
          <td>${new Date(item.timestamp).toLocaleTimeString()}</td>
          <td>
            <span class="${item.synced ? 'tag-synced' : 'tag-pending'}">
              ${item.synced ? '✓ Tersinkronisasi' : '⏳ Pending di IndexedDB'}
            </span>
          </td>
        </tr>
      `)
      .join('');
  }
}

// Download Data Master Gelanggang
async function downloadArenaData() {
  try {
    const res = await fetch('/api/turn-pro/matches');
    const data = await res.json();
    if (data.success) {
      await saveMatchToLocalDB(data.data.matches[0]);
      alert(`Berhasil download ${data.data.matches.length} jadwal pertandingan ke IndexedDB lokal untuk ${data.data.arena}!`);
    }
  } catch (err) {
    alert('Tidak dapat mengunduh data dari server: Pastikan koneksi internet aktif saat inisialisasi awal.');
  }
}

// ============================================================================
// 7. INITIALIZATION & EVENT LISTENERS
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await initIndexedDB();
  renderScores();
  updateTimerDisplay();
  updateNetworkUI();
  await refreshLogsAndPendingCount();

  // Tombol Download Data Gelanggang
  document.getElementById('btn-download-data')?.addEventListener('click', downloadArenaData);

  // Tombol Sync Manual
  document.getElementById('btn-manual-sync')?.addEventListener('click', () => {
    syncOutboxToServer();
  });

  // Tombol Simulasi Offline/Online
  elBtnSimulateOffline?.addEventListener('click', () => {
    isSimulatedOffline = !isSimulatedOffline;
    updateNetworkUI();
    if (!isSimulatedOffline) {
      syncOutboxToServer();
    }
  });

  // Tombol Timer
  elBtnTimerToggle?.addEventListener('click', toggleTimer);
  document.getElementById('btn-timer-reset')?.addEventListener('click', resetTimer);
  document.getElementById('btn-next-round')?.addEventListener('click', nextRound);

  // Tombol Sound Buzzer Manual
  document.getElementById('btn-sound-buzzer')?.addEventListener('click', () => {
    playBuzzerSound('buzzer');
  });

  // Event Keypad Chong (Biru)
  document.querySelectorAll('.btn-blue-action').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const pts = parseInt(btn.dataset.points, 10) || 0;
      recordScoreAction('BLUE', action, pts);
    });
  });

  // Event Keypad Hong (Merah)
  document.querySelectorAll('.btn-red-action').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const pts = parseInt(btn.dataset.points, 10) || 0;
      recordScoreAction('RED', action, pts);
    });
  });

  // Network Event Listeners Native Browser
  window.addEventListener('online', () => {
    updateNetworkUI();
    syncOutboxToServer();
  });

  window.addEventListener('offline', () => {
    updateNetworkUI();
  });
});
