/**
 * Dojang Turn Pro - Display Monitor Gelanggang Engine
 * 
 * Fitur:
 * 1. Komunikasi P2P Ultra-Low Latency via BroadcastChannel ('dojang_arena_channel')
 * 2. Fallback Storage Event untuk kompatibilitas lintas browser
 * 3. Render LED Scoreboard, Gam-jeom dots, Timer besar & animasi Hit Banner
 * 4. Winner Announcement Overlay Modal (Deklarasi Juara Partai)
 * 5. Stream Telemetry Inspector Drawer (Log Paket Data Masuk)
 * 6. Quick Test Simulation Bar (Dapat diuji langsung dari layar display)
 * 7. Heartbeat Link Monitor dengan deteksi liveness operator
 * 8. Web Audio API Buzzer & Gong (tanpa file mp3 eksternal)
 */

// ============================================================================
// 1. STATE & CONSTANTS
// ============================================================================
const CHANNEL_NAME = 'dojang_arena_channel';
let arenaChannel = null;
let soundEnabled = true;
let totalPacketsReceived = 0;
let audioCtx = null;
let lastHeartbeatTime = Date.now();
let localTimerInterval = null;

let displayState = {
  matchId: "M-101",
  category: "Senior Putra Kyorugi Under 68kg",
  round: 1,
  bluePoints: 0,
  redPoints: 0,
  blueGamJeom: 0,
  redGamJeom: 0,
  timerSeconds: 120,
  isTimerRunning: false,
  isOnline: navigator.onLine,
  blueFighter: { name: "Ahmad Rayhan", club: "Garuda Taekwondo Club" },
  redFighter: { name: "Budi Santoso", club: "Rajawali Martial Art" }
};

// DOM Elements
const elChongScore = document.getElementById('chong-score');
const elHongScore = document.getElementById('hong-score');
const elChongGamjeomNum = document.getElementById('chong-gamjeom-num');
const elHongGamjeomNum = document.getElementById('hong-gamjeom-num');
const elChongGamjeomDots = document.getElementById('chong-gamjeom-dots');
const elHongGamjeomDots = document.getElementById('hong-gamjeom-dots');
const elDisplayRound = document.getElementById('display-round');
const elDisplayTimer = document.getElementById('display-timer');
const elDisplayTimerState = document.getElementById('display-timer-state');
const elTimerLedCard = document.getElementById('timer-led-card');
const elNetBadge = document.getElementById('net-badge');
const elNetText = document.getElementById('net-text');
const elHitBanner = document.getElementById('hit-banner');
const elHitCornerTag = document.getElementById('hit-corner-tag');
const elHitText = document.getElementById('hit-text');
const elChongCard = document.getElementById('corner-chong-card');
const elHongCard = document.getElementById('corner-hong-card');
const elTickerMessage = document.getElementById('ticker-message');
const elTickerPacket = document.getElementById('ticker-packet');
const elTickerLatency = document.getElementById('ticker-latency');
const elLastStreamTime = document.getElementById('last-stream-time');
const elHeartbeatText = document.getElementById('heartbeat-text');
const elWinnerModal = document.getElementById('winner-modal');
const elStreamInspectorDrawer = document.getElementById('stream-inspector-drawer');
const elInspectorLogs = document.getElementById('inspector-logs');
const elQuickTestBar = document.getElementById('quick-test-bar');

// ============================================================================
// 2. AUDIO SYNTHESIZER
// ============================================================================
function playArenaSound(type = 'point') {
  if (!soundEnabled) return;

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
      osc.frequency.setValueAtTime(340, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.7);
      gain.gain.setValueAtTime(0.9, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.7);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.7);
    } else {
      // Beep Skor Poin
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.18);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.18);
    }
  } catch (err) {
    console.warn('[Audio] Error:', err);
  }
}

// ============================================================================
// 3. RENDER FUNCTIONS
// ============================================================================
function formatTimer(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function renderGamjeomDots(container, count, max = 5) {
  if (!container) return;
  const dots = container.querySelectorAll('.dot');
  dots.forEach((dot, index) => {
    if (index < count) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

function updateDisplayUI() {
  if (elChongScore) elChongScore.textContent = displayState.bluePoints;
  if (elHongScore) elHongScore.textContent = displayState.redPoints;
  
  if (elChongGamjeomNum) elChongGamjeomNum.textContent = `${displayState.blueGamJeom} / 5`;
  if (elHongGamjeomNum) elHongGamjeomNum.textContent = `${displayState.redGamJeom} / 5`;
  
  renderGamjeomDots(elChongGamjeomDots, displayState.blueGamJeom);
  renderGamjeomDots(elHongGamjeomDots, displayState.redGamJeom);
  
  if (elDisplayRound) elDisplayRound.textContent = displayState.round;
  if (elDisplayTimer) elDisplayTimer.textContent = formatTimer(displayState.timerSeconds);

  // Timer critical indicator (< 10 detik)
  if (elTimerLedCard) {
    if (displayState.timerSeconds <= 10 && displayState.timerSeconds > 0 && displayState.isTimerRunning) {
      elTimerLedCard.classList.add('timer-critical');
    } else {
      elTimerLedCard.classList.remove('timer-critical');
    }
  }

  // Timer State Pill
  if (elDisplayTimerState) {
    if (displayState.timerSeconds === 0) {
      elDisplayTimerState.textContent = 'RONDE SELESAI';
      elDisplayTimerState.className = 'timer-state-pill finished';
    } else if (displayState.isTimerRunning) {
      elDisplayTimerState.textContent = 'BERTANDING (LIVE)';
      elDisplayTimerState.className = 'timer-state-pill running';
    } else {
      elDisplayTimerState.textContent = 'JEDA / STANDBY';
      elDisplayTimerState.className = 'timer-state-pill paused';
    }
  }

  // Network badge
  if (elNetBadge && elNetText) {
    if (displayState.isOnline) {
      elNetBadge.className = 'badge-status status-online';
      elNetText.textContent = 'ONLINE (CLOUD LINK)';
    } else {
      elNetBadge.className = 'badge-status status-offline';
      elNetText.textContent = 'OFFLINE (GELANGGANG LOCAL)';
    }
  }
}

// Flash Hit Notification Banner
let hitBannerTimeout = null;
function showHitAlert(corner, actionText) {
  if (!elHitBanner) return;

  const isBlue = corner === 'BLUE' || corner === 'CHONG';
  elHitCornerTag.textContent = isBlue ? 'CHONG (BIRU)' : 'HONG (MERAH)';
  elHitCornerTag.className = `hit-corner-tag ${isBlue ? 'blue' : 'red'}`;
  elHitText.textContent = actionText;

  elHitBanner.classList.remove('hidden');

  // Flash card
  const card = isBlue ? elChongCard : elHongCard;
  if (card) {
    card.classList.remove('hit-flash');
    void card.offsetWidth; // trigger reflow
    card.classList.add('hit-flash');
  }

  clearTimeout(hitBannerTimeout);
  hitBannerTimeout = setTimeout(() => {
    elHitBanner.classList.add('hidden');
  }, 1800);
}

// Winner Announcement Modal
function showWinnerAnnouncement(winnerCorner) {
  const isBlue = winnerCorner === 'BLUE' || winnerCorner === 'CHONG';
  const cornerText = document.getElementById('winner-corner-text');
  const nameText = document.getElementById('winner-name-text');
  const clubText = document.getElementById('winner-club-text');
  const scoreText = document.getElementById('winner-score-text');

  if (cornerText) {
    cornerText.textContent = isBlue ? 'CHONG (BIRU)' : 'HONG (MERAH)';
    cornerText.className = `winner-corner ${isBlue ? 'blue' : 'red'}`;
  }
  if (nameText) {
    nameText.textContent = isBlue ? displayState.blueFighter.name : displayState.redFighter.name;
  }
  if (clubText) {
    clubText.textContent = isBlue ? displayState.blueFighter.club : displayState.redFighter.club;
  }
  if (scoreText) {
    scoreText.textContent = `SKOR AKHIR: ${displayState.bluePoints} - ${displayState.redPoints}`;
  }

  playArenaSound('buzzer');
  elWinnerModal?.classList.remove('hidden');
}

// Update Stream Ticker & Inspector Logs
function recordStreamPacket(actionTitle, tag = 'STREAM_HIT', packetPayload = null) {
  totalPacketsReceived++;
  const now = new Date();
  const timeStr = now.toLocaleTimeString();

  if (elTickerMessage) {
    elTickerMessage.textContent = `[${timeStr}] ${actionTitle}`;
  }
  if (elTickerPacket) {
    elTickerPacket.textContent = `${totalPacketsReceived} PACKETS RCVD`;
  }
  if (elLastStreamTime) {
    elLastStreamTime.textContent = `Sync: ${timeStr} (0ms)`;
  }

  // Append to inspector drawer
  if (elInspectorLogs) {
    const row = document.createElement('div');
    row.className = 'inspector-row';
    row.innerHTML = `
      <span class="insp-time">[${timeStr}]</span>
      <span class="insp-tag tag-p2p">${tag}</span>
      <span class="insp-text">${actionTitle}</span>
    `;
    elInspectorLogs.appendChild(row);
    elInspectorLogs.scrollTop = elInspectorLogs.scrollHeight;
  }
}

// ============================================================================
// 4. REALTIME P2P SYNC ENGINE (BroadcastChannel & LocalStorage)
// ============================================================================
function handleInboundMessage(data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'STATE_SYNC':
      Object.assign(displayState, data.payload);
      updateDisplayUI();
      recordStreamPacket(`STATE_SYNC: Ronde ${displayState.round} | Skor ${displayState.bluePoints}-${displayState.redPoints}`, 'STATE_SYNC', data);
      break;

    case 'SCORE_HIT':
      Object.assign(displayState, data.state);
      updateDisplayUI();
      playArenaSound('point');
      showHitAlert(data.targetCorner, `${data.actionLabel} (${data.pointsDelta > 0 ? '+' : ''}${data.pointsDelta} Poin)`);
      recordStreamPacket(`HIT_STREAM: ${data.targetCorner} ${data.actionLabel} (${data.pointsDelta > 0 ? '+' : ''}${data.pointsDelta})`, 'SCORE_HIT', data);
      break;

    case 'TIMER_TICK':
      displayState.timerSeconds = data.timerSeconds;
      displayState.isTimerRunning = data.isTimerRunning;
      if (elDisplayTimer) elDisplayTimer.textContent = formatTimer(data.timerSeconds);
      if (data.timerSeconds <= 10 && data.timerSeconds > 0 && data.isTimerRunning) {
        elTimerLedCard?.classList.add('timer-critical');
      } else {
        elTimerLedCard?.classList.remove('timer-critical');
      }
      break;

    case 'TIMER_TOGGLE':
      displayState.isTimerRunning = data.isTimerRunning;
      displayState.timerSeconds = data.timerSeconds;
      updateDisplayUI();
      recordStreamPacket(`TIMER_TOGGLE: ${data.isTimerRunning ? 'RUNNING' : 'PAUSED'} (${formatTimer(data.timerSeconds)})`, 'TIMER_STATE', data);
      break;

    case 'ROUND_OVER':
      displayState.timerSeconds = 0;
      displayState.isTimerRunning = false;
      updateDisplayUI();
      playArenaSound('buzzer');
      showHitAlert('CHONG', 'WAKTU RONDE SELESAI!');
      recordStreamPacket(`ROUND_OVER: Ronde ${displayState.round} Selesai (Buzzer Sounded)`, 'ROUND_OVER', data);
      break;

    case 'DECLARE_WINNER':
      showWinnerAnnouncement(data.winnerCorner || (displayState.bluePoints >= displayState.redPoints ? 'BLUE' : 'RED'));
      recordStreamPacket(`WINNER_DECLARED: Juara ${data.winnerCorner}`, 'DECLARE_WINNER', data);
      break;

    case 'NETWORK_STATE':
      displayState.isOnline = data.isOnline;
      updateDisplayUI();
      recordStreamPacket(`NETWORK_SWITCH: ${data.isOnline ? 'ONLINE CLOUD' : 'OFFLINE GELANGGANG'}`, 'NET_STATE', data);
      break;

    case 'HEARTBEAT':
      lastHeartbeatTime = Date.now();
      const ping = Math.max(0, Date.now() - (data.timestamp || Date.now()));
      if (elHeartbeatText) {
        elHeartbeatText.textContent = `● Operator Link: Aktif (Ping ${ping}ms)`;
        elHeartbeatText.classList.remove('stale');
      }
      break;
  }
}

function initChannelCommunication() {
  // 1. BroadcastChannel API
  if ('BroadcastChannel' in window) {
    arenaChannel = new BroadcastChannel(CHANNEL_NAME);
    arenaChannel.onmessage = (event) => {
      handleInboundMessage(event.data);
    };
    console.log('[Display Monitor] BroadcastChannel aktif: dojang_arena_channel');

    // Minta initial state dari operator saat pertama kali dibuka
    arenaChannel.postMessage({ type: 'REQUEST_INITIAL_STATE' });
  }

  // 2. LocalStorage Event Fallback
  window.addEventListener('storage', (e) => {
    if (e.key === 'dojang_arena_broadcast_event' && e.newValue) {
      try {
        const payload = JSON.parse(e.newValue);
        handleInboundMessage(payload);
      } catch (err) {
        console.warn('Storage event parse error:', err);
      }
    }
  });

  // Muat state terakhir jika tersimpan di localStorage
  try {
    const saved = localStorage.getItem('dojang_arena_current_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(displayState, parsed);
      updateDisplayUI();
    }
  } catch (err) {}

  // Liveness Heartbeat Watchdog
  setInterval(() => {
    const diff = Date.now() - lastHeartbeatTime;
    if (diff > 7000 && elHeartbeatText) {
      elHeartbeatText.textContent = '⚠️ Operator Link: Standby / Menunggu Sinyal';
      elHeartbeatText.classList.add('stale');
    }
  }, 2000);
}

// Broadcast balik jika aksi dipicu dari display langsung (bidirectional support)
function broadcastToOperator(type, data = {}) {
  const payload = { type, ...data, timestamp: Date.now() };
  if (arenaChannel) arenaChannel.postMessage(payload);
  try {
    localStorage.setItem('dojang_arena_broadcast_event', JSON.stringify(payload));
  } catch (e) {}
}

// ============================================================================
// 5. EVENT LISTENERS & STANDALONE DEMO CONTROLS
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initChannelCommunication();
  updateDisplayUI();

  // Fullscreen button
  const btnFullscreen = document.getElementById('btn-fullscreen');
  btnFullscreen?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Gagal fullscreen:', err);
      });
      btnFullscreen.textContent = '🗗';
    } else {
      document.exitFullscreen();
      btnFullscreen.textContent = '⛶';
    }
  });

  // Sound toggle
  const btnSound = document.getElementById('btn-sound-toggle');
  btnSound?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    btnSound.textContent = soundEnabled ? '🔊' : '🔇';
    btnSound.title = soundEnabled ? 'Suara Aktif' : 'Suara Dimatikan';
  });

  // Quick Test Bar Toggle
  const btnToggleTest = document.getElementById('btn-toggle-test');
  btnToggleTest?.addEventListener('click', () => {
    elQuickTestBar?.classList.toggle('hidden');
  });
  document.getElementById('btn-close-test-bar')?.addEventListener('click', () => {
    elQuickTestBar?.classList.add('hidden');
  });

  // Stream Inspector Drawer Toggle
  const btnToggleInspector = document.getElementById('btn-toggle-inspector');
  btnToggleInspector?.addEventListener('click', () => {
    elStreamInspectorDrawer?.classList.toggle('hidden');
  });
  document.getElementById('btn-close-inspector')?.addEventListener('click', () => {
    elStreamInspectorDrawer?.classList.add('hidden');
  });
  document.getElementById('btn-clear-inspector')?.addEventListener('click', () => {
    if (elInspectorLogs) elInspectorLogs.innerHTML = '';
  });

  // Winner Modal Close
  document.getElementById('btn-close-winner')?.addEventListener('click', () => {
    elWinnerModal?.classList.add('hidden');
  });

  // Standalone Quick Test Handlers
  document.getElementById('test-blue-point')?.addEventListener('click', () => {
    displayState.bluePoints += 2;
    updateDisplayUI();
    playArenaSound('point');
    showHitAlert('CHONG', '+2 TENDANGAN BADAN');
    recordStreamPacket('LOCAL_TEST: +2 Tendangan Chong', 'LOCAL_ACTION');
    broadcastToOperator('STATE_SYNC', { payload: displayState });
  });

  document.getElementById('test-blue-gamjeom')?.addEventListener('click', () => {
    displayState.blueGamJeom = Math.min(5, displayState.blueGamJeom + 1);
    displayState.redPoints += 1;
    updateDisplayUI();
    playArenaSound('point');
    showHitAlert('CHONG', '+1 GAM-JEOM (PELANGGARAN)');
    recordStreamPacket('LOCAL_TEST: +1 Gam-jeom Chong', 'LOCAL_ACTION');
    broadcastToOperator('STATE_SYNC', { payload: displayState });
  });

  document.getElementById('test-red-point')?.addEventListener('click', () => {
    displayState.redPoints += 2;
    updateDisplayUI();
    playArenaSound('point');
    showHitAlert('HONG', '+2 TENDANGAN BADAN');
    recordStreamPacket('LOCAL_TEST: +2 Tendangan Hong', 'LOCAL_ACTION');
    broadcastToOperator('STATE_SYNC', { payload: displayState });
  });

  document.getElementById('test-red-gamjeom')?.addEventListener('click', () => {
    displayState.redGamJeom = Math.min(5, displayState.redGamJeom + 1);
    displayState.bluePoints += 1;
    updateDisplayUI();
    playArenaSound('point');
    showHitAlert('HONG', '+1 GAM-JEOM (PELANGGARAN)');
    recordStreamPacket('LOCAL_TEST: +1 Gam-jeom Hong', 'LOCAL_ACTION');
    broadcastToOperator('STATE_SYNC', { payload: displayState });
  });

  document.getElementById('test-timer-toggle')?.addEventListener('click', () => {
    displayState.isTimerRunning = !displayState.isTimerRunning;
    if (displayState.isTimerRunning) {
      localTimerInterval = setInterval(() => {
        if (displayState.timerSeconds > 0) {
          displayState.timerSeconds--;
          updateDisplayUI();
        } else {
          clearInterval(localTimerInterval);
          displayState.isTimerRunning = false;
          updateDisplayUI();
          playArenaSound('buzzer');
        }
      }, 1000);
    } else {
      clearInterval(localTimerInterval);
    }
    updateDisplayUI();
    recordStreamPacket(`LOCAL_TEST: Timer ${displayState.isTimerRunning ? 'RUNNING' : 'PAUSED'}`, 'TIMER_STATE');
    broadcastToOperator('TIMER_TOGGLE', { isTimerRunning: displayState.isTimerRunning, timerSeconds: displayState.timerSeconds });
  });

  document.getElementById('test-declare-winner')?.addEventListener('click', () => {
    const winner = displayState.bluePoints >= displayState.redPoints ? 'BLUE' : 'RED';
    showWinnerAnnouncement(winner);
    recordStreamPacket(`LOCAL_TEST: Deklarasi Juara ${winner}`, 'WINNER');
  });

  document.getElementById('test-reset-match')?.addEventListener('click', () => {
    displayState.bluePoints = 0;
    displayState.redPoints = 0;
    displayState.blueGamJeom = 0;
    displayState.redGamJeom = 0;
    displayState.round = 1;
    displayState.timerSeconds = 120;
    displayState.isTimerRunning = false;
    clearInterval(localTimerInterval);
    updateDisplayUI();
    recordStreamPacket('LOCAL_TEST: Skor Reset ke 0-0', 'RESET');
    broadcastToOperator('STATE_SYNC', { payload: displayState });
  });

  // Network listeners
  window.addEventListener('online', () => {
    displayState.isOnline = true;
    updateDisplayUI();
  });
  window.addEventListener('offline', () => {
    displayState.isOnline = false;
    updateDisplayUI();
  });
});
