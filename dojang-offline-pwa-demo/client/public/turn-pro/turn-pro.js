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
// 3.5. BROADCAST CHANNEL & REALTIME TELEMETRY ENGINE
// ============================================================================
const CHANNEL_NAME = 'dojang_arena_channel';
let arenaChannel = null;
let streamAutoScroll = true;
let activeStreamFilter = 'ALL';
const streamLogsMemory = [];

// Inisialisasi BroadcastChannel untuk komunikasi P2P layar monitor
function initArenaBroadcast() {
  if ('BroadcastChannel' in window) {
    arenaChannel = new BroadcastChannel(CHANNEL_NAME);
    arenaChannel.onmessage = (event) => {
      const data = event.data;
      if (data?.type === 'REQUEST_INITIAL_STATE') {
        logStreamPacket('P2P', 'DISPLAY_HANDSHAKE', 'Monitor Layar meminta State Sinkronisasi Awal', { currentMatch });
        broadcastCurrentState();
      } else if (data?.type === 'STATE_SYNC' && data.payload) {
        // Sync balik jika dipicu langsung dari layar monitor
        Object.assign(currentMatch, data.payload);
        timerSeconds = data.payload.timerSeconds ?? timerSeconds;
        renderScores();
        updateTimerDisplay();
        logStreamPacket('P2P', 'DISPLAY_INBOUND_SYNC', 'Menerima pembaruan state balik dari Monitor Display', data.payload);
      } else if (data?.type === 'TIMER_TOGGLE') {
        isTimerRunning = data.isTimerRunning;
        timerSeconds = data.timerSeconds;
        updateTimerDisplay();
        elBtnTimerToggle.textContent = isTimerRunning ? '⏸ Jeda Ronde' : '▶ Mulai Ronde';
        if (isTimerRunning) elBtnTimerToggle.classList.add('btn-pause');
        else elBtnTimerToggle.classList.remove('btn-pause');
      }
    };

    // Heartbeat transmitter: Memberikan kepastian konektivitas ke layar monitor setiap 2.5 detik
    setInterval(() => {
      if (arenaChannel) {
        arenaChannel.postMessage({
          type: 'HEARTBEAT',
          timestamp: Date.now(),
          matchId: currentMatch.matchId
        });
      }
    }, 2500);
  }
}

function broadcastToDisplay(type, data = {}) {
  const payload = {
    type,
    ...data,
    timestamp: Date.now()
  };

  // 1. BroadcastChannel API
  if (arenaChannel) {
    try {
      arenaChannel.postMessage(payload);
    } catch (e) {
      console.warn('BroadcastChannel error:', e);
    }
  }

  // 2. LocalStorage Fallback antar tab/window
  try {
    localStorage.setItem('dojang_arena_broadcast_event', JSON.stringify(payload));
    localStorage.setItem('dojang_arena_current_state', JSON.stringify({
      ...currentMatch,
      timerSeconds,
      isTimerRunning,
      isOnline: isSystemOnline()
    }));
  } catch (e) {}
}

function broadcastCurrentState() {
  broadcastToDisplay('STATE_SYNC', {
    payload: {
      ...currentMatch,
      timerSeconds,
      isTimerRunning,
      isOnline: isSystemOnline()
    }
  });
}

// Log Terminal Stream Visualizer
function logStreamPacket(category, tag, bodyText, payload = null) {
  const now = new Date();
  const timeStr = `[${now.toTimeString().split(' ')[0]}.${now.getMilliseconds().toString().padStart(3, '0')}]`;

  const logItem = {
    id: 'stream-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    timeStr,
    category, // 'P2P', 'OUTBOX', 'CLOUD', 'NETWORK'
    tag,
    bodyText,
    payload: payload ? JSON.stringify(payload) : null
  };

  streamLogsMemory.push(logItem);
  if (streamLogsMemory.length > 200) {
    streamLogsMemory.shift();
  }

  appendStreamRowToDOM(logItem);
}

function appendStreamRowToDOM(item) {
  const terminal = document.getElementById('stream-terminal');
  if (!terminal) return;

  // Filter check
  if (activeStreamFilter !== 'ALL' && item.category !== activeStreamFilter) {
    return;
  }

  let tagClass = 'tag-p2p';
  if (item.category === 'OUTBOX') tagClass = 'tag-outbox';
  else if (item.tag.includes('POST') || item.category === 'CLOUD') tagClass = 'tag-cloud-post';
  if (item.tag.includes('ACK')) tagClass = 'tag-cloud-ack';
  if (item.category === 'NETWORK') tagClass = 'tag-network';

  const row = document.createElement('div');
  row.className = 'stream-row';
  row.dataset.category = item.category;
  row.innerHTML = `
    <span class="stream-time">${item.timeStr}</span>
    <span class="stream-tag ${tagClass}">${item.tag}</span>
    <div class="stream-body">
      ${item.bodyText}
      ${item.payload ? `<div class="stream-payload">${item.payload.length > 120 ? item.payload.substring(0, 120) + '...' : item.payload}</div>` : ''}
    </div>
  `;

  terminal.appendChild(row);

  if (streamAutoScroll) {
    terminal.scrollTop = terminal.scrollHeight;
  }
}

function renderAllStreamRows() {
  const terminal = document.getElementById('stream-terminal');
  if (!terminal) return;
  terminal.innerHTML = '';
  streamLogsMemory.forEach((item) => {
    if (activeStreamFilter === 'ALL' || item.category === activeStreamFilter) {
      appendStreamRowToDOM(item);
    }
  });
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
const elStreamBufferBadge = document.getElementById('stream-buffer-badge');

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

  let actionLabel = actionType;
  if (actionType === 'PUNCH') actionLabel = '+1 Pukulan';
  else if (actionType === 'BODY_KICK') actionLabel = '+2 Tendangan Badan';
  else if (actionType === 'HEAD_KICK') actionLabel = '+3 Tendangan Kepala';
  else if (actionType === 'GAMJEOM') actionLabel = '+1 Gam-jeom (Pelanggaran)';

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

  // 1. Broadcast ke Layar Display Monitor secara P2P lokal (< 1ms, offline/online)
  broadcastToDisplay('SCORE_HIT', {
    targetCorner,
    actionType,
    actionLabel,
    pointsDelta,
    state: { ...currentMatch }
  });

  logStreamPacket('P2P', 'STREAM_BROADCAST', `Paket skor ${targetCorner} dikirim ke Monitor Display via BroadcastChannel (< 1ms)`, {
    targetCorner,
    actionType,
    pointsDelta,
    matchId: currentMatch.matchId,
    scoreboard: `${currentMatch.bluePoints} - ${currentMatch.redPoints}`
  });

  // 2. Buat Event Log Imutable untuk Outbox Queue
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

  if (!isSystemOnline()) {
    logStreamPacket('OUTBOX', 'IDB_QUEUE_BUFFER', `OFFLINE: Event ${eventPayload.id} disimpan ke antrean IndexedDB Outbox`, eventPayload);
  }

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
    broadcastToDisplay('TIMER_TOGGLE', { isTimerRunning: false, timerSeconds });
    logStreamPacket('P2P', 'TIMER_PAUSE', `Waktu ronde dijeda pada ${formatTimer(timerSeconds)}`, { timerSeconds });
  } else {
    isTimerRunning = true;
    elBtnTimerToggle.textContent = '⏸ Jeda Ronde';
    elBtnTimerToggle.classList.add('btn-pause');
    broadcastToDisplay('TIMER_TOGGLE', { isTimerRunning: true, timerSeconds });
    logStreamPacket('P2P', 'TIMER_START', `Waktu ronde dimulai (${formatTimer(timerSeconds)})`, { timerSeconds });

    timerInterval = setInterval(() => {
      if (timerSeconds > 0) {
        timerSeconds--;
        updateTimerDisplay();
        broadcastToDisplay('TIMER_TICK', { timerSeconds, isTimerRunning: true });
      } else {
        clearInterval(timerInterval);
        isTimerRunning = false;
        elBtnTimerToggle.textContent = '▶ Ronde Selesai';
        playBuzzerSound('buzzer');
        broadcastToDisplay('ROUND_OVER', { round: currentMatch.round });
        logStreamPacket('P2P', 'ROUND_FINISHED', `Ronde ${currentMatch.round} Selesai! Buzzer aktif`, { round: currentMatch.round });
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
  broadcastToDisplay('TIMER_TOGGLE', { isTimerRunning: false, timerSeconds });
  logStreamPacket('P2P', 'TIMER_RESET', 'Timer direset kembali ke 02:00', { timerSeconds });
}

function nextRound() {
  if (currentMatch.round < 3) {
    currentMatch.round++;
    resetTimer();
    renderScores();
    broadcastToDisplay('STATE_SYNC', { payload: { ...currentMatch, timerSeconds, isTimerRunning } });
    logStreamPacket('P2P', 'NEXT_ROUND', `Beralih ke Ronde ${currentMatch.round}`, { round: currentMatch.round });
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

  broadcastToDisplay('NETWORK_STATE', { isOnline: online });
  logStreamPacket('NETWORK', 'NET_SWITCH', `Jaringan arena beralih ke: ${online ? 'ONLINE (Cloud Connected)' : 'OFFLINE (Air-gapped Venue)'}`, { isOnline: online });
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
    logStreamPacket('OUTBOX', 'SYNC_BLOCKED', 'Tidak dapat mengirim sync: Sistem dalam mode OFFLINE (Air-gapped)');
    return;
  }

  const pendingEvents = await getPendingOutboxEvents();
  if (pendingEvents.length === 0) {
    return;
  }

  const payloadSize = JSON.stringify({ events: pendingEvents }).length;
  logStreamPacket('CLOUD', 'SYNC_POST_DISPATCH', `Mengirim batch ${pendingEvents.length} event ke server POST /api/turn-pro/sync (${payloadSize} bytes)...`, { count: pendingEvents.length });

  const startTime = performance.now();
  try {
    const res = await fetch('/api/turn-pro/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: pendingEvents })
    });

    const elapsed = Math.round(performance.now() - startTime);
    const result = await res.json();
    if (result.success && result.syncedEventIds) {
      await markEventsAsSynced(result.syncedEventIds);
      logStreamPacket('CLOUD', 'SYNC_SERVER_ACK', `HTTP 200 OK: ${result.syncedEventIds.length} event di-ack server (latency: ${elapsed}ms)`, {
        syncedCount: result.syncedEventIds.length,
        totalInServer: result.totalLogsInServer,
        latencyMs: elapsed
      });
      await refreshLogsAndPendingCount();
    }
  } catch (err) {
    logStreamPacket('CLOUD', 'SYNC_ERROR', `Koneksi gagal saat dispatch sync: ${err.message}`, { error: err.message });
  }
}

async function refreshLogsAndPendingCount() {
  const pending = await getPendingOutboxEvents();
  const allLogs = await getAllOutboxLogs();

  if (elPendingCount) {
    elPendingCount.textContent = `${pending.length} Event Antrean Offline`;
  }
  if (elStreamBufferBadge) {
    elStreamBufferBadge.textContent = `${pending.length} IN BUFFER`;
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
      logStreamPacket('CLOUD', 'ARENA_SEEDED', `Berhasil pre-cache data gelanggang: ${data.data.arena}`, data.data.rules);
      alert(`Berhasil download ${data.data.matches.length} jadwal pertandingan ke IndexedDB lokal untuk ${data.data.arena}!`);
    }
  } catch (err) {
    alert('Tidak dapat mengunduh data dari server: Pastikan koneksi internet aktif saat inisialisasi awal.');
  }
}

// Simulasi 5 Stream Skor Beruntun (Burst Test)
async function runBurstStreamSimulation() {
  const actions = [
    { corner: 'BLUE', action: 'PUNCH', pts: 1 },
    { corner: 'BLUE', action: 'BODY_KICK', pts: 2 },
    { corner: 'RED', action: 'HEAD_KICK', pts: 3 },
    { corner: 'BLUE', action: 'GAMJEOM', pts: 0 },
    { corner: 'RED', action: 'BODY_KICK', pts: 2 }
  ];

  logStreamPacket('P2P', 'BURST_START', 'Memulai Burst Test: 5 aksi skor beruntun dalam 1.2 detik...');

  for (let i = 0; i < actions.length; i++) {
    const act = actions[i];
    await recordScoreAction(act.corner, act.action, act.pts);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  logStreamPacket('P2P', 'BURST_FINISH', 'Burst Test selesai dieksekusi.');
}

// Simulasi 1 Poin Acak
function runRandomSingleHit() {
  const corners = ['BLUE', 'RED'];
  const actions = [
    { action: 'PUNCH', pts: 1 },
    { action: 'BODY_KICK', pts: 2 },
    { action: 'HEAD_KICK', pts: 3 },
    { action: 'GAMJEOM', pts: 0 }
  ];

  const chosenCorner = corners[Math.floor(Math.random() * corners.length)];
  const chosenAction = actions[Math.floor(Math.random() * actions.length)];

  recordScoreAction(chosenCorner, chosenAction.action, chosenAction.pts);
}

// ============================================================================
// 7. INITIALIZATION & EVENT LISTENERS
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initArenaBroadcast();
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

  // Tombol Deklarasi Pemenang
  document.getElementById('btn-declare-winner')?.addEventListener('click', () => {
    const winner = currentMatch.bluePoints >= currentMatch.redPoints ? 'BLUE' : 'RED';
    broadcastToDisplay('DECLARE_WINNER', {
      winnerCorner: winner,
      finalScore: `${currentMatch.bluePoints} - ${currentMatch.redPoints}`
    });
    logStreamPacket('P2P', 'DECLARE_WINNER', `Wasit mendeklarasikan pemenang partai: Sudut ${winner}!`, {
      winner,
      score: `${currentMatch.bluePoints} - ${currentMatch.redPoints}`
    });
    alert(`Pemenang dideklarasikan: Sudut ${winner === 'BLUE' ? 'CHONG (Biru)' : 'HONG (Merah)'}!`);
  });

  // Tombol Buka Display Monitor (Window / Tab Baru)
  document.getElementById('btn-open-display')?.addEventListener('click', () => {
    window.open('/turn-pro/display.html', '_blank', 'width=1280,height=800,menubar=no,toolbar=no');
    logStreamPacket('P2P', 'WINDOW_OPEN', 'Layar Display Monitor Gelanggang dibuka di jendela terpisah');
  });

  // Tombol Split-Screen Simulator
  const splitPanel = document.getElementById('split-simulator-panel');
  document.getElementById('btn-toggle-split')?.addEventListener('click', () => {
    splitPanel?.classList.toggle('hidden');
    if (!splitPanel?.classList.contains('hidden')) {
      broadcastCurrentState();
    }
  });
  document.getElementById('btn-close-split')?.addEventListener('click', () => {
    splitPanel?.classList.add('hidden');
  });
  document.getElementById('btn-refresh-split')?.addEventListener('click', () => {
    const iframe = document.getElementById('split-iframe');
    if (iframe) iframe.src = '/turn-pro/display.html';
  });

  // Tombol Burst Stream Simulation
  document.getElementById('btn-burst-stream')?.addEventListener('click', runBurstStreamSimulation);

  // Tombol Stream Toolbar
  document.getElementById('btn-stream-random')?.addEventListener('click', runRandomSingleHit);
  document.getElementById('btn-clear-stream')?.addEventListener('click', () => {
    streamLogsMemory.length = 0;
    const terminal = document.getElementById('stream-terminal');
    if (terminal) terminal.innerHTML = '';
  });

  const btnAutoScroll = document.getElementById('btn-autoscroll-stream');
  btnAutoScroll?.addEventListener('click', () => {
    streamAutoScroll = !streamAutoScroll;
    btnAutoScroll.textContent = `Auto-Scroll: ${streamAutoScroll ? 'ON' : 'OFF'}`;
    btnAutoScroll.style.background = streamAutoScroll ? '#047857' : '#4b5563';
  });

  // Filter Tabs Stream
  document.querySelectorAll('.stream-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.stream-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeStreamFilter = tab.dataset.filter || 'ALL';
      renderAllStreamRows();
    });
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

