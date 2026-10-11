/**
 * Dojang Turn Pro - Poomsae Stadium Display Engine
 * 
 * Fitur:
 * 1. P2P Realtime Listener (BroadcastChannel: dojang_poomsae_channel)
 * 2. LocalStorage Fallback Listener
 * 3. 5-Judge Trimmed Mean Visualization
 * 4. Stadium Audio Synth (Buzzer, Chime, Fanfare)
 * 5. Standalone Quick Test Controller untuk Pengujian Mandiri Layar TV
 * 6. Fullscreen HDMI Mode
 */

// ============================================================================
// 1. STATE & INITIALIZATION
// ============================================================================
const POOMSAE_CHANNEL_NAME = 'dojang_poomsae_channel';
let poomsaeChannel = null;

let displayState = {
  matchId: "PM-201",
  court: "GELANGGANG 1",
  category: "SENIOR PUTRA INDIVIDUAL RECOGNIZED POOMSAE",
  phase: "FINAL BATTLE",
  poomsaeName: "KORYO",
  activeCorner: "BLUE",
  timerSeconds: 90,
  isTimerRunning: false,
  winner: null,

  blueCorner: {
    name: "Muhammad Fadhil",
    dojang: "Garuda Taekwondo Club",
    danLevel: "Dan 2 Kukkiwon",
    finalCalculated: {
      avgAccuracy: 4.00,
      avgPresentation: 4.53,
      totalPenalties: 0.00,
      finalScore: 8.53,
      trimmedDetails: null
    },
    judges: [
      { judgeId: 1, total: 8.5 },
      { judgeId: 2, total: 8.7 },
      { judgeId: 3, total: 8.3 },
      { judgeId: 4, total: 8.6 },
      { judgeId: 5, total: 8.5 }
    ]
  },

  redCorner: {
    name: "Bagas Wicaksono",
    dojang: "Elang Merah Academy",
    danLevel: "Dan 2 Kukkiwon",
    finalCalculated: {
      avgAccuracy: 4.00,
      avgPresentation: 4.53,
      totalPenalties: 0.00,
      finalScore: 8.53,
      trimmedDetails: null
    },
    judges: [
      { judgeId: 1, total: 8.5 },
      { judgeId: 2, total: 8.7 },
      { judgeId: 3, total: 8.3 },
      { judgeId: 4, total: 8.6 },
      { judgeId: 5, total: 8.5 }
    ]
  }
};

// ============================================================================
// 2. AUDIO SYNTHESIZER
// ============================================================================
let audioCtx = null;
let soundEnabled = true;

function playSound(type) {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'buzzer') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.8);
      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (type === 'fanfare') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, now + i * 0.12);
        g.gain.setValueAtTime(0.4, now + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.45);
        o.start(now + i * 0.12);
        o.stop(now + i * 0.12 + 0.45);
      });
    } else if (type === 'chime') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.1);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (e) {
    console.warn('Display audio error:', e);
  }
}

// ============================================================================
// 3. BROADCAST CHANNEL P2P RECEIVER
// ============================================================================
function initBroadcastListener() {
  if ('BroadcastChannel' in window) {
    poomsaeChannel = new BroadcastChannel(POOMSAE_CHANNEL_NAME);
    poomsaeChannel.onmessage = (event) => {
      handleIncomingMessage(event.data);
    };

    // Minta state terkini dari Console Operator saat layar display pertama kali dibuka
    poomsaeChannel.postMessage({ type: 'DISPLAY_PING' });
  }

  // Fallback LocalStorage
  window.addEventListener('storage', (e) => {
    if (e.key === 'dojang_poomsae_current_state' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        handleIncomingMessage({ type: 'STATE_SYNC', state: parsed });
      } catch (err) {}
    }
  });

  // Baca state awal dari LocalStorage jika ada
  try {
    const saved = localStorage.getItem('dojang_poomsae_current_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      handleIncomingMessage({ type: 'STATE_SYNC', state: parsed });
    }
  } catch (e) {}
}

function handleIncomingMessage(msg) {
  if (!msg) return;

  if (msg.type === 'STATE_SYNC' && msg.state) {
    Object.assign(displayState, msg.state);
    if (msg.timerSeconds !== undefined) displayState.timerSeconds = msg.timerSeconds;
    if (msg.isTimerRunning !== undefined) displayState.isTimerRunning = msg.isTimerRunning;
    renderDisplay();
  } else if (msg.type === 'TIMER_UPDATE') {
    displayState.timerSeconds = msg.timerSeconds;
    displayState.isTimerRunning = msg.isTimerRunning;
    updateDisplayTimer();
  } else if (msg.type === 'TIME_UP') {
    displayState.timerSeconds = 0;
    displayState.isTimerRunning = false;
    updateDisplayTimer();
    playSound('buzzer');
  } else if (msg.type === 'WINNER_DECLARED') {
    showWinnerCelebration(msg);
  }
}

// ============================================================================
// 4. DISPLAY RENDERING
// ============================================================================
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateDisplayTimer() {
  const elDigits = document.getElementById('display-timer-digits');
  const elTag = document.getElementById('display-timer-tag');
  if (!elDigits) return;

  elDigits.textContent = formatTime(displayState.timerSeconds);

  elDigits.classList.remove('critical');
  if (displayState.timerSeconds <= 10 && displayState.timerSeconds > 0) {
    elDigits.classList.add('critical');
  }

  if (elTag) {
    if (displayState.isTimerRunning) {
      elTag.textContent = 'RUNNING';
      elTag.classList.add('running');
    } else if (displayState.timerSeconds === 0) {
      elTag.textContent = 'TIME UP';
      elTag.classList.remove('running');
    } else {
      elTag.textContent = 'PAUSED';
      elTag.classList.remove('running');
    }
  }
}

function renderDisplay() {
  // Jurus Poomsae & Kategori
  const elFormTitle = document.getElementById('display-form-title');
  if (elFormTitle) elFormTitle.textContent = displayState.poomsaeName || 'KORYO';

  const elCategory = document.getElementById('display-match-category');
  if (elCategory) {
    elCategory.innerHTML = `${(displayState.phase || 'FINAL BATTLE').toUpperCase()} • <span>${(displayState.category || 'RECOGNIZED POOMSAE').toUpperCase()}</span>`;
  }

  // Timer
  updateDisplayTimer();

  // Active Performer Highlight
  const blueCard = document.getElementById('disp-blue-card');
  const redCard = document.getElementById('disp-red-card');
  const blueTag = document.getElementById('blue-status-text');
  const redTag = document.getElementById('red-status-text');

  if (displayState.activeCorner === 'BLUE') {
    blueCard?.classList.add('is-active-performer');
    redCard?.classList.remove('is-active-performer');
    if (blueTag) blueTag.textContent = 'SEDANG TAMPIL DI ARENA (LIVE)';
    if (redTag) redTag.textContent = 'MENUNGGU GILIRAN';
  } else {
    redCard?.classList.add('is-active-performer');
    blueCard?.classList.remove('is-active-performer');
    if (redTag) redTag.textContent = 'SEDANG TAMPIL DI ARENA (LIVE)';
    if (blueTag) blueTag.textContent = 'MENUNGGU GILIRAN';
  }

  // Sudut Biru (Chong)
  const b = displayState.blueCorner;
  const elBName = document.getElementById('disp-blue-name');
  const elBClub = document.getElementById('disp-blue-club');
  const elBTotal = document.getElementById('disp-blue-total');
  const elBAcc = document.getElementById('disp-blue-acc');
  const elBPres = document.getElementById('disp-blue-pres');
  const elBDed = document.getElementById('disp-blue-ded');

  if (elBName) elBName.textContent = b.name;
  if (elBClub) elBClub.textContent = `${b.dojang} • ${b.danLevel || 'Dan 2'}`;
  if (elBTotal) elBTotal.textContent = b.finalCalculated.finalScore.toFixed(2);
  if (elBAcc) elBAcc.textContent = b.finalCalculated.avgAccuracy.toFixed(2);
  if (elBPres) elBPres.textContent = b.finalCalculated.avgPresentation.toFixed(2);
  if (elBDed) elBDed.textContent = `-${b.finalCalculated.totalPenalties.toFixed(2)}`;

  renderJudgeChips('disp-blue-judges', b);

  // Sudut Merah (Hong)
  const r = displayState.redCorner;
  const elRName = document.getElementById('disp-red-name');
  const elRClub = document.getElementById('disp-red-club');
  const elRTotal = document.getElementById('disp-red-total');
  const elRAcc = document.getElementById('disp-red-acc');
  const elRPres = document.getElementById('disp-red-pres');
  const elRDed = document.getElementById('disp-red-ded');

  if (elRName) elRName.textContent = r.name;
  if (elRClub) elRClub.textContent = `${r.dojang} • ${r.danLevel || 'Dan 2'}`;
  if (elRTotal) elRTotal.textContent = r.finalCalculated.finalScore.toFixed(2);
  if (elRAcc) elRAcc.textContent = r.finalCalculated.avgAccuracy.toFixed(2);
  if (elRPres) elRPres.textContent = r.finalCalculated.avgPresentation.toFixed(2);
  if (elRDed) elRDed.textContent = `-${r.finalCalculated.totalPenalties.toFixed(2)}`;

  renderJudgeChips('disp-red-judges', r);
}

function renderJudgeChips(containerId, cornerData) {
  const container = document.getElementById(containerId);
  if (!container || !cornerData.judges) return;

  const trimmed = cornerData.finalCalculated?.trimmedDetails;
  let html = '';

  cornerData.judges.forEach((j) => {
    const isTrimmed = trimmed && (
      j.judgeId === trimmed.minAccJudgeId || 
      j.judgeId === trimmed.maxAccJudgeId ||
      j.judgeId === trimmed.minPresJudgeId ||
      j.judgeId === trimmed.maxPresJudgeId
    );

    html += `
      <div class="judge-chip ${isTrimmed ? 'is-trimmed-chip' : ''}">
        <div class="judge-chip-label">JURI ${j.judgeId}</div>
        <div class="judge-chip-score">${Number(j.total).toFixed(2)}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function showWinnerCelebration(data) {
  playSound('fanfare');

  const overlay = document.getElementById('winner-overlay');
  const elTitle = document.getElementById('overlay-winner-name');
  const elDojang = document.getElementById('overlay-winner-dojang');
  const elBlueScore = document.getElementById('overlay-blue-score');
  const elRedScore = document.getElementById('overlay-red-score');
  const elBadge = document.getElementById('overlay-winner-badge');

  if (overlay && elTitle && elDojang && elBlueScore && elRedScore) {
    if (elBadge) elBadge.textContent = `🏆 PEMENANG: ${data.winnerCorner}`;
    elTitle.textContent = data.winnerAthlete;
    elDojang.textContent = data.winnerDojang;
    elBlueScore.textContent = data.blueScore.toFixed(2);
    elRedScore.textContent = data.redScore.toFixed(2);
    overlay.classList.remove('hidden');
  }
}

// ============================================================================
// 5. STANDALONE QUICK TEST BAR & EVENT HANDLERS
// ============================================================================
function setupDisplayControls() {
  const btnToggleTest = document.getElementById('btn-toggle-test');
  const testBar = document.getElementById('quick-test-bar');
  const btnCloseTest = document.getElementById('btn-close-test');

  if (btnToggleTest && testBar) {
    btnToggleTest.addEventListener('click', () => {
      testBar.classList.toggle('hidden');
    });
  }

  if (btnCloseTest && testBar) {
    btnCloseTest.addEventListener('click', () => {
      testBar.classList.add('hidden');
    });
  }

  // Standalone Test Actions
  const btnTestBlueActive = document.getElementById('test-active-blue');
  if (btnTestBlueActive) {
    btnTestBlueActive.addEventListener('click', () => {
      displayState.activeCorner = 'BLUE';
      renderDisplay();
    });
  }

  const btnTestRedActive = document.getElementById('test-active-red');
  if (btnTestRedActive) {
    btnTestRedActive.addEventListener('click', () => {
      displayState.activeCorner = 'RED';
      renderDisplay();
    });
  }

  const btnTestTimer = document.getElementById('test-timer-toggle');
  let testTimerInterval = null;
  if (btnTestTimer) {
    btnTestTimer.addEventListener('click', () => {
      displayState.isTimerRunning = !displayState.isTimerRunning;
      if (displayState.isTimerRunning) {
        playSound('chime');
        testTimerInterval = setInterval(() => {
          if (displayState.timerSeconds > 0) {
            displayState.timerSeconds--;
            updateDisplayTimer();
          } else {
            clearInterval(testTimerInterval);
            displayState.isTimerRunning = false;
            playSound('buzzer');
            updateDisplayTimer();
          }
        }, 1000);
      } else {
        clearInterval(testTimerInterval);
      }
      updateDisplayTimer();
    });
  }

  const btnTestDeclare = document.getElementById('test-declare-winner');
  if (btnTestDeclare) {
    btnTestDeclare.addEventListener('click', () => {
      showWinnerCelebration({
        winnerCorner: 'CHONG (BIRU)',
        winnerAthlete: displayState.blueCorner.name,
        winnerDojang: displayState.blueCorner.dojang,
        blueScore: displayState.blueCorner.finalCalculated.finalScore,
        redScore: displayState.redCorner.finalCalculated.finalScore
      });
    });
  }

  const btnCloseWinner = document.getElementById('btn-close-winner');
  if (btnCloseWinner) {
    btnCloseWinner.addEventListener('click', () => {
      const overlay = document.getElementById('winner-overlay');
      if (overlay) overlay.classList.add('hidden');
    });
  }

  // Fullscreen HDMI Toggle
  const btnFullscreen = document.getElementById('btn-fullscreen');
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  // Sound Toggle
  const btnSound = document.getElementById('btn-sound-toggle');
  if (btnSound) {
    btnSound.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      btnSound.textContent = soundEnabled ? '🔊' : '🔇';
    });
  }
}

// ============================================================================
// 6. BOOTSTRAP
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
  initBroadcastListener();
  setupDisplayControls();
  renderDisplay();
});
