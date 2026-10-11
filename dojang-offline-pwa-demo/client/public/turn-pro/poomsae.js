/**
 * Dojang Turn Pro - Poomsae Scoring Board Engine
 * 
 * Standar Regulasi World Taekwondo (WT):
 * 1. Accuracy (Akurasi Teknik): Base 4.00
 *    - Minor fault: -0.1 (sudut, posisi tangan, goyang keseimbangan kecil)
 *    - Major fault: -0.3 (kuda-kuda salah, teknik blok melenceng, jeda ragu)
 * 2. Presentation (Penyajian): Base 6.00 (Maks 6.00)
 *    - Speed & Power (0.0 - 2.0)
 *    - Rhythm & Tempo (0.0 - 2.0)
 *    - Expression of Energy (0.0 - 2.0)
 * 3. Multi-Judge Scoring (5 Juri Olympic Trimmed Mean):
 *    - Nilai tertinggi dan terendah pada Akurasi & Presentasi dieliminasi
 *    - Tiga nilai tengah dirata-rata
 * 4. PWA Offline-First via Service Worker & IndexedDB Outbox Queue
 * 5. BroadcastChannel P2P Realtime Stream ke Display Monitor
 */

// ============================================================================
// 1. REGISTRASI SERVICE WORKER & NETWORK MONITOR
// ============================================================================
let swRegistration = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      swRegistration = await navigator.serviceWorker.register('/turn-pro/sw.js', { scope: '/turn-pro/' });
      console.log('[Poomsae] Service Worker aktif dengan scope:', swRegistration.scope);

      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'TRIGGER_OUTBOX_SYNC') {
          console.log('[Poomsae] SW Background Sync dipicu!');
          syncOutboxToServer();
        }
      });
    } catch (err) {
      console.warn('[Poomsae] Service Worker gagal didaftarkan:', err);
    }
  });
}

let simulatedOffline = false;
function isSystemOnline() {
  return navigator.onLine && !simulatedOffline;
}

function updateNetworkUI() {
  const pill = document.getElementById('offline-status');
  const text = document.getElementById('offline-text');
  if (!pill || !text) return;

  if (isSystemOnline()) {
    pill.classList.remove('is-offline');
    text.textContent = 'ONLINE (TERHUBUNG)';
  } else {
    pill.classList.add('is-offline');
    text.textContent = simulatedOffline ? 'OFFLINE (SIMULASI)' : 'OFFLINE (PUTUS SINYAL)';
  }
}

window.addEventListener('online', () => {
  updateNetworkUI();
  syncOutboxToServer();
});
window.addEventListener('offline', updateNetworkUI);

// ============================================================================
// 2. AUDIO SYNTHESIZER (Web Audio API)
// ============================================================================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playPoomsaeSound(type = 'click') {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'minor') {
      // Potongan kecil -0.1 (Soft beep)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.12);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'major') {
      // Potongan besar -0.3 (Low harsh tone)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.25);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'buzzer') {
      // Buzzer waktu habis 90 detik (Loud Arena Horn)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.8);
      gain.gain.setValueAtTime(0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (type === 'chime') {
      // Bell chime persiapan / peringatan waktu
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.1);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'fanfare') {
      // Fanfare Kemenangan
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, now + i * 0.12);
        g.gain.setValueAtTime(0.3, now + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.4);
        o.start(now + i * 0.12);
        o.stop(now + i * 0.12 + 0.4);
      });
    } else {
      // Regular Click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    }
  } catch (e) {
    console.warn('Audio synth failed:', e);
  }
}

// ============================================================================
// 3. LOCAL-FIRST DATABASE (Native IndexedDB)
// ============================================================================
const DB_NAME = 'DojangTurnProDB';
const DB_VERSION = 1;
let db = null;

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('matches')) {
        d.createObjectStore('matches', { keyPath: 'matchId' });
      }
      if (!d.objectStoreNames.contains('poomsaeMatches')) {
        d.createObjectStore('poomsaeMatches', { keyPath: 'matchId' });
      }
      if (!d.objectStoreNames.contains('outbox')) {
        const outboxStore = d.createObjectStore('outbox', { keyPath: 'id' });
        outboxStore.createIndex('synced', 'synced', { unique: false });
        outboxStore.createIndex('matchId', 'matchId', { unique: false });
      }
    };

    req.onsuccess = (e) => {
      db = e.target.result;
      console.log('[Poomsae IndexedDB] Database siap.');
      resolve(db);
    };

    req.onerror = (e) => {
      console.error('[Poomsae IndexedDB] Gagal membuka DB:', e.target.error);
      reject(e.target.error);
    };
  });
}

async function addOutboxEvent(event) {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    store.add(event);
    tx.oncomplete = () => {
      updatePendingOutboxCount();
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function getPendingOutboxCount() {
  if (!db) return 0;
  return new Promise((resolve) => {
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    const req = store.getAll();
    req.onsuccess = () => {
      const items = req.result || [];
      const pending = items.filter((x) => !x.synced);
      resolve(pending.length);
    };
    req.onerror = () => resolve(0);
  });
}

async function updatePendingOutboxCount() {
  const count = await getPendingOutboxCount();
  const badge = document.getElementById('pending-count');
  if (!badge) return;
  badge.textContent = `${count} Event Antrean Offline`;
  if (count > 0) badge.classList.add('has-pending');
  else badge.classList.remove('has-pending');
}

async function syncOutboxToServer() {
  if (!isSystemOnline() || !db) return;
  try {
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    const req = store.getAll();

    req.onsuccess = async () => {
      const all = req.result || [];
      const pending = all.filter((x) => !x.synced);
      if (pending.length === 0) return;

      console.log(`[Poomsae Sync] Mengirim ${pending.length} antrean scoring ke backend...`);
      const res = await fetch('/api/turn-pro/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: pending })
      });

      if (res.ok) {
        const result = await res.json();
        const updateTx = db.transaction('outbox', 'readwrite');
        const updateStore = updateTx.objectStore('outbox');
        pending.forEach((item) => {
          item.synced = true;
          item.syncedAt = new Date().toISOString();
          updateStore.put(item);
        });
        updateTx.oncomplete = () => {
          console.log('[Poomsae Sync] Sukses sinkronisasi event ke server.');
          updatePendingOutboxCount();
        };
      }
    };
  } catch (err) {
    console.warn('[Poomsae Sync] Gagal sync ke server (akan dicoba lagi nanti):', err);
  }
}

// ============================================================================
// 4. BROADCAST CHANNEL P2P ENGINE (0ms Latency)
// ============================================================================
const POOMSAE_CHANNEL_NAME = 'dojang_poomsae_channel';
let poomsaeChannel = null;

function initPoomsaeBroadcast() {
  if ('BroadcastChannel' in window) {
    poomsaeChannel = new BroadcastChannel(POOMSAE_CHANNEL_NAME);
    poomsaeChannel.onmessage = (e) => {
      const data = e.data;
      if (data?.type === 'DISPLAY_PING') {
        broadcastCurrentState();
      }
    };
  }
}

function broadcastToDisplay(type, data = {}) {
  const payload = {
    type,
    ...data,
    timestamp: Date.now()
  };

  if (poomsaeChannel) {
    try {
      poomsaeChannel.postMessage(payload);
    } catch (e) {
      console.warn('BroadcastChannel error:', e);
    }
  }

  try {
    localStorage.setItem('dojang_poomsae_current_state', JSON.stringify({
      ...poomsaeState,
      timerSeconds,
      isTimerRunning,
      isOnline: isSystemOnline()
    }));
  } catch (e) {}
}

function broadcastCurrentState() {
  broadcastToDisplay('STATE_SYNC', {
    state: poomsaeState,
    timerSeconds,
    isTimerRunning,
    isOnline: isSystemOnline()
  });
}

// ============================================================================
// 5. POOMSAE STATE & DATA MODEL (Standar WT 5-Juri)
// ============================================================================
function createDefaultJudgeScores() {
  return [
    { judgeId: 1, minorCount: 0, majorCount: 0, accuracy: 4.0, speedPower: 1.5, rhythmTempo: 1.5, expressionEnergy: 1.5, presentation: 4.5, total: 8.5 },
    { judgeId: 2, minorCount: 0, majorCount: 0, accuracy: 4.0, speedPower: 1.6, rhythmTempo: 1.5, expressionEnergy: 1.6, presentation: 4.7, total: 8.7 },
    { judgeId: 3, minorCount: 0, majorCount: 0, accuracy: 4.0, speedPower: 1.4, rhythmTempo: 1.4, expressionEnergy: 1.5, presentation: 4.3, total: 8.3 },
    { judgeId: 4, minorCount: 0, majorCount: 0, accuracy: 4.0, speedPower: 1.5, rhythmTempo: 1.6, expressionEnergy: 1.5, presentation: 4.6, total: 8.6 },
    { judgeId: 5, minorCount: 0, majorCount: 0, accuracy: 4.0, speedPower: 1.5, rhythmTempo: 1.5, expressionEnergy: 1.5, presentation: 4.5, total: 8.5 }
  ];
}

const poomsaeState = {
  matchId: "PM-201",
  court: "Gelanggang 1 (Court A)",
  category: "Senior Putra Individual Recognized Poomsae",
  phase: "Final Battle",
  poomsaeName: "Koryo",
  type: "BATTLE", // "BATTLE" atau "CUT_OFF"
  activeCorner: "BLUE", // "BLUE" atau "RED"
  status: "READY", // "READY", "PERFORMING", "SCORED", "FINISHED"
  winner: null, // "BLUE", "RED", "DRAW"
  
  blueCorner: {
    id: "ATL-P01",
    name: "Muhammad Fadhil",
    dojang: "Garuda Taekwondo Club",
    danLevel: "Dan 2 Kukkiwon",
    penalties: { overtime: false, outOfBound: false, restart: false },
    judges: createDefaultJudgeScores(),
    finalCalculated: {
      avgAccuracy: 4.00,
      avgPresentation: 4.53,
      totalPenalties: 0.00,
      finalScore: 8.53,
      trimmedDetails: null
    }
  },

  redCorner: {
    id: "ATL-P02",
    name: "Bagas Wicaksono",
    dojang: "Elang Merah Academy",
    danLevel: "Dan 2 Kukkiwon",
    penalties: { overtime: false, outOfBound: false, restart: false },
    judges: createDefaultJudgeScores(),
    finalCalculated: {
      avgAccuracy: 4.00,
      avgPresentation: 4.53,
      totalPenalties: 0.00,
      finalScore: 8.53,
      trimmedDetails: null
    }
  }
};

// ============================================================================
// 6. WT OLYMPIC TRIMMED MEAN CALCULATION ALGORITHM
// ============================================================================
function calculateWTTrimmedScores(cornerData) {
  const judges = cornerData.judges;
  const numJudges = judges.length;

  // 1. Hitung total akurasi & presentasi per juri
  judges.forEach((j) => {
    // Akurasi: Base 4.00 dikurangi minor (-0.1) dan major (-0.3)
    const accDeductions = (j.minorCount * 0.1) + (j.majorCount * 0.3);
    j.accuracy = Math.max(0, Number((4.0 - accDeductions).toFixed(2)));

    // Presentasi: SpeedPower + RhythmTempo + ExpressionEnergy (Maks 6.0)
    const presSum = Number(j.speedPower) + Number(j.rhythmTempo) + Number(j.expressionEnergy);
    j.presentation = Math.min(6.0, Number(presSum.toFixed(2)));

    j.total = Number((j.accuracy + j.presentation).toFixed(2));
  });

  // 2. Hitung Penalti Tambahan
  let totalPenalties = 0;
  if (cornerData.penalties.overtime) totalPenalties += 0.3;
  if (cornerData.penalties.outOfBound) totalPenalties += 0.3;
  if (cornerData.penalties.restart) totalPenalties += 0.6;
  totalPenalties = Number(totalPenalties.toFixed(2));

  // 3. Trimmed Mean untuk 5 Juri
  // Sort Akurasi
  const accValues = judges.map((j) => ({ judgeId: j.judgeId, val: j.accuracy }));
  accValues.sort((a, b) => a.val - b.val);
  const minAccJudgeId = accValues[0].judgeId;
  const maxAccJudgeId = accValues[numJudges - 1].judgeId;

  // Hitung rata-rata 3 nilai tengah akurasi
  const trimmedAccList = accValues.slice(1, numJudges - 1);
  const sumTrimmedAcc = trimmedAccList.reduce((acc, cur) => acc + cur.val, 0);
  const avgAccuracy = Number((sumTrimmedAcc / trimmedAccList.length).toFixed(2));

  // Sort Presentasi
  const presValues = judges.map((j) => ({ judgeId: j.judgeId, val: j.presentation }));
  presValues.sort((a, b) => a.val - b.val);
  const minPresJudgeId = presValues[0].judgeId;
  const maxPresJudgeId = presValues[numJudges - 1].judgeId;

  // Hitung rata-rata 3 nilai tengah presentasi
  const trimmedPresList = presValues.slice(1, numJudges - 1);
  const sumTrimmedPres = trimmedPresList.reduce((acc, cur) => acc + cur.val, 0);
  const avgPresentation = Number((sumTrimmedPres / trimmedPresList.length).toFixed(2));

  // Skor Akhir
  const finalScore = Math.max(0, Number((avgAccuracy + avgPresentation - totalPenalties).toFixed(2)));

  cornerData.finalCalculated = {
    avgAccuracy,
    avgPresentation,
    totalPenalties,
    finalScore,
    trimmedDetails: {
      minAccJudgeId,
      maxAccJudgeId,
      minPresJudgeId,
      maxPresJudgeId
    }
  };

  return cornerData.finalCalculated;
}

// Inisialisasi perhitungan awal
calculateWTTrimmedScores(poomsaeState.blueCorner);
calculateWTTrimmedScores(poomsaeState.redCorner);

// ============================================================================
// 7. TIMER ENGINE (Standar Poomsae: 90 Detik)
// ============================================================================
let timerSeconds = 90;
let isTimerRunning = false;
let timerInterval = null;

function formatTimer(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
  const el = document.getElementById('timer-digits');
  if (!el) return;
  el.textContent = formatTimer(timerSeconds);

  el.classList.remove('warning', 'critical');
  if (timerSeconds <= 10 && timerSeconds > 0) {
    el.classList.add('critical');
  } else if (timerSeconds <= 30) {
    el.classList.add('warning');
  }
}

function toggleTimer() {
  const btn = document.getElementById('btn-timer-toggle');
  if (isTimerRunning) {
    // Jeda
    clearInterval(timerInterval);
    isTimerRunning = false;
    if (btn) {
      btn.textContent = '▶ Lanjutkan';
      btn.classList.remove('btn-pause');
    }
    broadcastToDisplay('TIMER_UPDATE', { timerSeconds, isTimerRunning: false });
  } else {
    // Mulai
    if (timerSeconds === 0) timerSeconds = 90;
    isTimerRunning = true;
    if (btn) {
      btn.textContent = '⏸ Jeda Waktu';
      btn.classList.add('btn-pause');
    }
    playPoomsaeSound('chime');
    broadcastToDisplay('TIMER_UPDATE', { timerSeconds, isTimerRunning: true });

    timerInterval = setInterval(() => {
      if (timerSeconds > 0) {
        timerSeconds--;
        updateTimerDisplay();

        if (timerSeconds === 30 || timerSeconds === 10) {
          playPoomsaeSound('chime');
        }

        if (timerSeconds % 2 === 0) {
          broadcastToDisplay('TIMER_UPDATE', { timerSeconds, isTimerRunning: true });
        }
      } else {
        // Waktu habis!
        clearInterval(timerInterval);
        isTimerRunning = false;
        if (btn) {
          btn.textContent = '▶ Mulai Tampil (90s)';
          btn.classList.remove('btn-pause');
        }
        playPoomsaeSound('buzzer');
        updateTimerDisplay();
        broadcastToDisplay('TIME_UP', { timerSeconds: 0 });
      }
    }, 1000);
  }
}

function resetTimer(seconds = 90) {
  clearInterval(timerInterval);
  isTimerRunning = false;
  timerSeconds = seconds;
  const btn = document.getElementById('btn-timer-toggle');
  if (btn) {
    btn.textContent = `▶ Mulai Tampil (${seconds}s)`;
    btn.classList.remove('btn-pause');
  }
  updateTimerDisplay();
  broadcastToDisplay('TIMER_UPDATE', { timerSeconds, isTimerRunning: false });
}

// ============================================================================
// 8. UI RENDER ENGINE
// ============================================================================
let currentSelectedJudgeId = 1;

function getActiveCornerData() {
  return poomsaeState.activeCorner === 'BLUE' ? poomsaeState.blueCorner : poomsaeState.redCorner;
}

function renderPoomsaeUI() {
  // Update Corner Cards
  const blueCard = document.getElementById('card-blue-corner');
  const redCard = document.getElementById('card-red-corner');

  if (blueCard && redCard) {
    if (poomsaeState.activeCorner === 'BLUE') {
      blueCard.classList.add('is-active-performer');
      redCard.classList.remove('is-active-performer');
    } else {
      redCard.classList.add('is-active-performer');
      blueCard.classList.remove('is-active-performer');
    }
  }

  // Sudut Biru Scores
  calculateWTTrimmedScores(poomsaeState.blueCorner);
  const blueCalc = poomsaeState.blueCorner.finalCalculated;
  const elBlueTotal = document.getElementById('blue-total-score');
  const elBlueAcc = document.getElementById('blue-acc-score');
  const elBluePres = document.getElementById('blue-pres-score');
  const elBlueDed = document.getElementById('blue-ded-score');
  if (elBlueTotal) elBlueTotal.textContent = blueCalc.finalScore.toFixed(2);
  if (elBlueAcc) elBlueAcc.textContent = blueCalc.avgAccuracy.toFixed(2);
  if (elBluePres) elBluePres.textContent = blueCalc.avgPresentation.toFixed(2);
  if (elBlueDed) elBlueDed.textContent = `-${blueCalc.totalPenalties.toFixed(2)}`;

  // Sudut Merah Scores
  calculateWTTrimmedScores(poomsaeState.redCorner);
  const redCalc = poomsaeState.redCorner.finalCalculated;
  const elRedTotal = document.getElementById('red-total-score');
  const elRedAcc = document.getElementById('red-acc-score');
  const elRedPres = document.getElementById('red-pres-score');
  const elRedDed = document.getElementById('red-ded-score');
  if (elRedTotal) elRedTotal.textContent = redCalc.finalScore.toFixed(2);
  if (elRedAcc) elRedAcc.textContent = redCalc.avgAccuracy.toFixed(2);
  if (elRedPres) elRedPres.textContent = redCalc.avgPresentation.toFixed(2);
  if (elRedDed) elRedDed.textContent = `-${redCalc.totalPenalties.toFixed(2)}`;

  // Update Judge Pad Input Fields sesuai Juri yang dipilih & Corner yang aktif
  renderJudgePadInputs();

  // Update Matrix Table
  renderJudgesMatrixTable();
}

function renderJudgePadInputs() {
  const activeData = getActiveCornerData();
  const judge = activeData.judges.find((j) => j.judgeId === currentSelectedJudgeId) || activeData.judges[0];

  // Minor count
  const elMinorCount = document.getElementById('active-minor-count');
  if (elMinorCount) elMinorCount.textContent = `${judge.minorCount}x (${(judge.minorCount * -0.1).toFixed(1)})`;

  // Major count
  const elMajorCount = document.getElementById('active-major-count');
  if (elMajorCount) elMajorCount.textContent = `${judge.majorCount}x (${(judge.majorCount * -0.3).toFixed(1)})`;

  // Accuracy badge
  const elAccBadge = document.getElementById('active-acc-badge');
  if (elAccBadge) elAccBadge.textContent = judge.accuracy.toFixed(2);

  // Presentation Sliders
  const slSpeed = document.getElementById('slider-speed');
  const slRhythm = document.getElementById('slider-rhythm');
  const slEnergy = document.getElementById('slider-energy');
  const valSpeed = document.getElementById('val-speed');
  const valRhythm = document.getElementById('val-rhythm');
  const valEnergy = document.getElementById('val-energy');

  if (slSpeed && valSpeed) {
    slSpeed.value = judge.speedPower;
    valSpeed.textContent = Number(judge.speedPower).toFixed(2);
  }
  if (slRhythm && valRhythm) {
    slRhythm.value = judge.rhythmTempo;
    valRhythm.textContent = Number(judge.rhythmTempo).toFixed(2);
  }
  if (slEnergy && valEnergy) {
    slEnergy.value = judge.expressionEnergy;
    valEnergy.textContent = Number(judge.expressionEnergy).toFixed(2);
  }

  // Penalties
  const chkOvertime = document.getElementById('chk-overtime');
  const chkBound = document.getElementById('chk-bound');
  const chkRestart = document.getElementById('chk-restart');
  if (chkOvertime) chkOvertime.checked = activeData.penalties.overtime;
  if (chkBound) chkBound.checked = activeData.penalties.outOfBound;
  if (chkRestart) chkRestart.checked = activeData.penalties.restart;
}

function renderJudgesMatrixTable() {
  const activeData = getActiveCornerData();
  const trimmed = activeData.finalCalculated.trimmedDetails;
  const tbody = document.getElementById('judges-matrix-body');
  if (!tbody) return;

  let html = '';
  activeData.judges.forEach((j) => {
    const isAccTrimmed = trimmed && (j.judgeId === trimmed.minAccJudgeId || j.judgeId === trimmed.maxAccJudgeId);
    const isPresTrimmed = trimmed && (j.judgeId === trimmed.minPresJudgeId || j.judgeId === trimmed.maxPresJudgeId);

    const isCurrentJudge = j.judgeId === currentSelectedJudgeId;

    html += `
      <tr style="${isCurrentJudge ? 'background: rgba(6, 182, 212, 0.08); font-weight: 700;' : ''}">
        <td><strong>Juri ${j.judgeId}</strong> ${isCurrentJudge ? '👉' : ''}</td>
        <td>${j.minorCount}x</td>
        <td>${j.majorCount}x</td>
        <td class="${isAccTrimmed ? 'is-trimmed' : 'is-counted'}">
          ${j.accuracy.toFixed(2)} ${isAccTrimmed ? '(Trim)' : ''}
        </td>
        <td>${Number(j.speedPower).toFixed(2)}</td>
        <td>${Number(j.rhythmTempo).toFixed(2)}</td>
        <td>${Number(j.expressionEnergy).toFixed(2)}</td>
        <td class="${isPresTrimmed ? 'is-trimmed' : 'is-counted'}">
          ${j.presentation.toFixed(2)} ${isPresTrimmed ? '(Trim)' : ''}
        </td>
        <td style="color: #fff; font-weight: 800;">${j.total.toFixed(2)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ============================================================================
// 9. EVENT LISTENERS & ACTION HANDLERS
// ============================================================================
function setupEventListeners() {
  // Switch Corner
  const btnSelectBlue = document.getElementById('btn-select-blue');
  const btnSelectRed = document.getElementById('btn-select-red');

  if (btnSelectBlue) {
    btnSelectBlue.addEventListener('click', () => {
      poomsaeState.activeCorner = 'BLUE';
      playPoomsaeSound('click');
      renderPoomsaeUI();
      broadcastCurrentState();
    });
  }

  if (btnSelectRed) {
    btnSelectRed.addEventListener('click', () => {
      poomsaeState.activeCorner = 'RED';
      playPoomsaeSound('click');
      renderPoomsaeUI();
      broadcastCurrentState();
    });
  }

  // Judge Tabs (Juri 1 - 5)
  document.querySelectorAll('.btn-judge-tab').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn-judge-tab').forEach((b) => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      currentSelectedJudgeId = parseInt(e.currentTarget.dataset.judgeId, 10);
      playPoomsaeSound('click');
      renderJudgePadInputs();
      renderJudgesMatrixTable();
    });
  });

  // Deduction Minor (-0.1)
  const btnMinor = document.getElementById('btn-deduct-minor');
  if (btnMinor) {
    btnMinor.addEventListener('click', () => {
      const activeData = getActiveCornerData();
      const judge = activeData.judges.find((j) => j.judgeId === currentSelectedJudgeId);
      if (judge) {
        judge.minorCount++;
        playPoomsaeSound('minor');
        renderPoomsaeUI();
        broadcastCurrentState();
        recordScoringOutbox('MINOR_DEDUCTION', {
          corner: poomsaeState.activeCorner,
          judgeId: judge.judgeId,
          minorCount: judge.minorCount
        });
      }
    });
  }

  // Deduction Major (-0.3)
  const btnMajor = document.getElementById('btn-deduct-major');
  if (btnMajor) {
    btnMajor.addEventListener('click', () => {
      const activeData = getActiveCornerData();
      const judge = activeData.judges.find((j) => j.judgeId === currentSelectedJudgeId);
      if (judge) {
        judge.majorCount++;
        playPoomsaeSound('major');
        renderPoomsaeUI();
        broadcastCurrentState();
        recordScoringOutbox('MAJOR_DEDUCTION', {
          corner: poomsaeState.activeCorner,
          judgeId: judge.judgeId,
          majorCount: judge.majorCount
        });
      }
    });
  }

  // Undo Minor
  const btnUndoMinor = document.getElementById('btn-undo-minor');
  if (btnUndoMinor) {
    btnUndoMinor.addEventListener('click', () => {
      const activeData = getActiveCornerData();
      const judge = activeData.judges.find((j) => j.judgeId === currentSelectedJudgeId);
      if (judge && judge.minorCount > 0) {
        judge.minorCount--;
        playPoomsaeSound('click');
        renderPoomsaeUI();
        broadcastCurrentState();
      }
    });
  }

  // Undo Major
  const btnUndoMajor = document.getElementById('btn-undo-major');
  if (btnUndoMajor) {
    btnUndoMajor.addEventListener('click', () => {
      const activeData = getActiveCornerData();
      const judge = activeData.judges.find((j) => j.judgeId === currentSelectedJudgeId);
      if (judge && judge.majorCount > 0) {
        judge.majorCount--;
        playPoomsaeSound('click');
        renderPoomsaeUI();
        broadcastCurrentState();
      }
    });
  }

  // Reset Accuracy Juri Ini
  const btnResetAcc = document.getElementById('btn-reset-accuracy');
  if (btnResetAcc) {
    btnResetAcc.addEventListener('click', () => {
      const activeData = getActiveCornerData();
      const judge = activeData.judges.find((j) => j.judgeId === currentSelectedJudgeId);
      if (judge) {
        judge.minorCount = 0;
        judge.majorCount = 0;
        playPoomsaeSound('click');
        renderPoomsaeUI();
        broadcastCurrentState();
      }
    });
  }

  // Presentation Sliders
  const slSpeed = document.getElementById('slider-speed');
  const slRhythm = document.getElementById('slider-rhythm');
  const slEnergy = document.getElementById('slider-energy');

  const onSliderChange = () => {
    const activeData = getActiveCornerData();
    const judge = activeData.judges.find((j) => j.judgeId === currentSelectedJudgeId);
    if (judge) {
      if (slSpeed) judge.speedPower = parseFloat(slSpeed.value);
      if (slRhythm) judge.rhythmTempo = parseFloat(slRhythm.value);
      if (slEnergy) judge.expressionEnergy = parseFloat(slEnergy.value);
      renderPoomsaeUI();
      broadcastCurrentState();
    }
  };

  if (slSpeed) slSpeed.addEventListener('input', onSliderChange);
  if (slRhythm) slRhythm.addEventListener('input', onSliderChange);
  if (slEnergy) slEnergy.addEventListener('input', onSliderChange);

  // Penalties
  const chkOvertime = document.getElementById('chk-overtime');
  const chkBound = document.getElementById('chk-bound');
  const chkRestart = document.getElementById('chk-restart');

  const onPenaltyChange = () => {
    const activeData = getActiveCornerData();
    activeData.penalties.overtime = !!chkOvertime?.checked;
    activeData.penalties.outOfBound = !!chkBound?.checked;
    activeData.penalties.restart = !!chkRestart?.checked;
    playPoomsaeSound('major');
    renderPoomsaeUI();
    broadcastCurrentState();
  };

  if (chkOvertime) chkOvertime.addEventListener('change', onPenaltyChange);
  if (chkBound) chkBound.addEventListener('change', onPenaltyChange);
  if (chkRestart) chkRestart.addEventListener('change', onPenaltyChange);

  // Timer Buttons
  const btnTimer = document.getElementById('btn-timer-toggle');
  if (btnTimer) btnTimer.addEventListener('click', toggleTimer);

  const btnReset90 = document.getElementById('btn-timer-reset-90');
  if (btnReset90) btnReset90.addEventListener('click', () => resetTimer(90));

  const btnReset60 = document.getElementById('btn-timer-reset-60');
  if (btnReset60) btnReset60.addEventListener('click', () => resetTimer(60));

  // Toolbar Buttons
  const btnSimOffline = document.getElementById('btn-simulate-offline');
  if (btnSimOffline) {
    btnSimOffline.addEventListener('click', () => {
      simulatedOffline = !simulatedOffline;
      btnSimOffline.textContent = simulatedOffline ? '🟢 Pulihkan Sinyal (Online)' : '🔌 Simulasikan Putus Sinyal (Offline)';
      btnSimOffline.style.background = simulatedOffline ? '#059669' : '#991b1b';
      updateNetworkUI();
      if (!simulatedOffline) syncOutboxToServer();
    });
  }

  const btnManualSync = document.getElementById('btn-manual-sync');
  if (btnManualSync) {
    btnManualSync.addEventListener('click', () => {
      syncOutboxToServer();
      playPoomsaeSound('click');
    });
  }

  const btnTestSound = document.getElementById('btn-sound-test');
  if (btnTestSound) {
    btnTestSound.addEventListener('click', () => {
      playPoomsaeSound('buzzer');
    });
  }

  // Open Display Window
  const btnOpenDisplay = document.getElementById('btn-open-display');
  if (btnOpenDisplay) {
    btnOpenDisplay.addEventListener('click', () => {
      window.open('/turn-pro/poomsae-display.html', '_blank', 'width=1280,height=720');
    });
  }

  // Split-Screen Preview Simulator
  const btnToggleSplit = document.getElementById('btn-toggle-split');
  const splitPanel = document.getElementById('split-simulator-panel');
  const btnCloseSplit = document.getElementById('btn-close-split');
  const btnRefreshSplit = document.getElementById('btn-refresh-split');

  if (btnToggleSplit && splitPanel) {
    btnToggleSplit.addEventListener('click', () => {
      splitPanel.classList.toggle('hidden');
    });
  }

  if (btnCloseSplit && splitPanel) {
    btnCloseSplit.addEventListener('click', () => {
      splitPanel.classList.add('hidden');
    });
  }

  if (btnRefreshSplit) {
    btnRefreshSplit.addEventListener('click', () => {
      const iframe = document.getElementById('split-iframe');
      if (iframe) iframe.src = '/turn-pro/poomsae-display.html';
    });
  }

  // Poomsae Forms Preset Selector
  const selPoomsae = document.getElementById('select-poomsae');
  if (selPoomsae) {
    selPoomsae.addEventListener('change', (e) => {
      poomsaeState.poomsaeName = e.target.value;
      const tag = document.getElementById('current-poomsae-tag');
      if (tag) tag.textContent = e.target.value;
      broadcastCurrentState();
    });
  }

  // Match Selector
  const selMatch = document.getElementById('select-match');
  if (selMatch) {
    selMatch.addEventListener('change', (e) => {
      loadMatchPreset(e.target.value);
    });
  }

  // Declare Winner
  const btnDeclareWinner = document.getElementById('btn-declare-winner');
  if (btnDeclareWinner) {
    btnDeclareWinner.addEventListener('click', handleDeclareWinner);
  }

  const btnCloseWinnerModal = document.getElementById('btn-close-winner-modal');
  if (btnCloseWinnerModal) {
    btnCloseWinnerModal.addEventListener('click', () => {
      const modal = document.getElementById('winner-modal');
      if (modal) modal.classList.add('hidden');
    });
  }

  // Quick Randomize Juri (Simulasi Penilaian Nyata untuk Uji Coba Cepat)
  const btnSimulateScores = document.getElementById('btn-simulate-scores');
  if (btnSimulateScores) {
    btnSimulateScores.addEventListener('click', simulateJudgesScores);
  }
}

function handleDeclareWinner() {
  const blueScore = poomsaeState.blueCorner.finalCalculated.finalScore;
  const redScore = poomsaeState.redCorner.finalCalculated.finalScore;

  let winnerCorner = null;
  let winnerAthlete = null;
  let winnerDojang = null;

  if (blueScore > redScore) {
    winnerCorner = 'CHONG (BIRU)';
    winnerAthlete = poomsaeState.blueCorner.name;
    winnerDojang = poomsaeState.blueCorner.dojang;
    poomsaeState.winner = 'BLUE';
  } else if (redScore > blueScore) {
    winnerCorner = 'HONG (MERAH)';
    winnerAthlete = poomsaeState.redCorner.name;
    winnerDojang = poomsaeState.redCorner.dojang;
    poomsaeState.winner = 'RED';
  } else {
    // Seri
    winnerCorner = 'DRAW (SERI)';
    winnerAthlete = 'Skor Kedua Atlet Seimbang';
    winnerDojang = 'WT Rules: Evaluasi Akurasi Tertinggi';
    poomsaeState.winner = 'DRAW';
  }

  playPoomsaeSound('fanfare');

  const modal = document.getElementById('winner-modal');
  const title = document.getElementById('modal-winner-title');
  const athlete = document.getElementById('modal-winner-athlete');
  const details = document.getElementById('modal-winner-details');

  if (modal && title && athlete && details) {
    title.textContent = `🏆 PEMENANG: ${winnerCorner}`;
    athlete.textContent = winnerAthlete;
    details.textContent = `${winnerDojang} • Skor Akhir: Chong ${blueScore.toFixed(2)} vs Hong ${redScore.toFixed(2)}`;
    modal.classList.remove('hidden');
  }

  broadcastToDisplay('WINNER_DECLARED', {
    winner: poomsaeState.winner,
    winnerCorner,
    winnerAthlete,
    winnerDojang,
    blueScore,
    redScore
  });

  recordScoringOutbox('MATCH_WINNER_DECLARED', {
    matchId: poomsaeState.matchId,
    winner: poomsaeState.winner,
    blueScore,
    redScore
  });
}

function simulateJudgesScores() {
  // Isi nilai realistis untuk 5 juri di kedua sudut
  [poomsaeState.blueCorner, poomsaeState.redCorner].forEach((corner) => {
    corner.judges.forEach((j) => {
      j.minorCount = Math.floor(Math.random() * 4); // 0 - 3 minor
      j.majorCount = Math.random() > 0.7 ? 1 : 0;   // 0 atau 1 major
      j.speedPower = Number((1.4 + Math.random() * 0.4).toFixed(2));
      j.rhythmTempo = Number((1.4 + Math.random() * 0.4).toFixed(2));
      j.expressionEnergy = Number((1.4 + Math.random() * 0.4).toFixed(2));
    });
  });

  playPoomsaeSound('chime');
  renderPoomsaeUI();
  broadcastCurrentState();
}

function loadMatchPreset(matchId) {
  if (matchId === 'PM-201') {
    poomsaeState.matchId = 'PM-201';
    poomsaeState.category = 'Senior Putra Individual Recognized Poomsae';
    poomsaeState.poomsaeName = 'Koryo';
    poomsaeState.blueCorner.name = 'Muhammad Fadhil';
    poomsaeState.blueCorner.dojang = 'Garuda Taekwondo Club';
    poomsaeState.redCorner.name = 'Bagas Wicaksono';
    poomsaeState.redCorner.dojang = 'Elang Merah Academy';
  } else if (matchId === 'PM-202') {
    poomsaeState.matchId = 'PM-202';
    poomsaeState.category = 'Senior Putri Individual Recognized Poomsae';
    poomsaeState.poomsaeName = 'Keumgang';
    poomsaeState.blueCorner.name = 'Annisa Larasati';
    poomsaeState.blueCorner.dojang = 'Satria Nusantara Dojang';
    poomsaeState.redCorner.name = 'Siti Rahmawati';
    poomsaeState.redCorner.dojang = 'Rajawali Martial Art';
  }

  const tag = document.getElementById('current-poomsae-tag');
  if (tag) tag.textContent = poomsaeState.poomsaeName;

  const selP = document.getElementById('select-poomsae');
  if (selP) selP.value = poomsaeState.poomsaeName;

  const matchTitle = document.getElementById('match-category-title');
  if (matchTitle) matchTitle.textContent = `${poomsaeState.phase}: ${poomsaeState.category}`;

  const blueName = document.getElementById('blue-performer-name');
  const blueClub = document.getElementById('blue-performer-club');
  if (blueName) blueName.textContent = poomsaeState.blueCorner.name;
  if (blueClub) blueClub.textContent = poomsaeState.blueCorner.dojang;

  const redName = document.getElementById('red-performer-name');
  const redClub = document.getElementById('red-performer-club');
  if (redName) redName.textContent = poomsaeState.redCorner.name;
  if (redClub) redClub.textContent = poomsaeState.redCorner.dojang;

  resetTimer(90);
  renderPoomsaeUI();
  broadcastCurrentState();
}

async function recordScoringOutbox(actionType, payload) {
  const event = {
    id: `ev-poomsae-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    matchId: poomsaeState.matchId,
    actionType,
    payload,
    timestamp: Date.now(),
    synced: false
  };

  await addOutboxEvent(event);
  if (isSystemOnline()) {
    syncOutboxToServer();
  }
}

// ============================================================================
// 10. BOOTSTRAP INITIALIZATION
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  await initIndexedDB();
  initPoomsaeBroadcast();
  setupEventListeners();
  updateNetworkUI();
  updateTimerDisplay();
  updatePendingOutboxCount();
  renderPoomsaeUI();

  // Broadcast state awal agar layar monitor langsung sinkron
  setTimeout(() => {
    broadcastCurrentState();
  }, 500);
});
