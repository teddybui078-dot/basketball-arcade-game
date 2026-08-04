// Feature: Scoring & UI (branch: feature/scoring-ui)
// Owns the DOM overlay — HUD (score/timer), start screen, game-over screen,
// and per-shot feedback (flash/popup/streak badge + synthesized audio).
//
// This module is confined to js/scoring.js + js/ui.js, so it can't add
// markup to index.html or rules to css/style.css. The feedback layer below
// is built entirely at runtime: elements are created and appended into
// #game-container, and their styling is injected as a single <style> tag.

const UI = {
  elements: {},
  audioCtx: null,

  init() {
    this.elements.score = document.getElementById('score');
    this.elements.timer = document.getElementById('timer');
    this.elements.startScreen = document.getElementById('start-screen');
    this.elements.gameOverScreen = document.getElementById('game-over-screen');
    this.elements.finalScore = document.getElementById('final-score');
    this._buildFeedbackLayer();
  },

  attachStartButton(onStart) {
    this.init();
    document.getElementById('start-button').addEventListener('click', () => {
      this._ensureAudio(); // resume/create AudioContext on a direct user gesture
      this.elements.startScreen.classList.add('hidden');
      this.elements.gameOverScreen.classList.add('hidden');
      onStart();
    });
    document.getElementById('restart-button').addEventListener('click', () => {
      this._ensureAudio();
      this.elements.gameOverScreen.classList.add('hidden');
      onStart();
    });
  },

  showHUD(state) {
    state.streak = 0;
    state.bestStreak = 0;
    this.update(state);
  },

  update(state) {
    if (this.elements.score) this.elements.score.textContent = `Score: ${state.score}`;
    if (this.elements.timer) this.elements.timer.textContent = `Time: ${Math.ceil(state.timeRemaining)}`;

    if (this.elements.streakBadge) {
      const streak = state.streak || 0;
      if (streak >= Scoring.COMBO_THRESHOLD) {
        this.elements.streakBadge.textContent = `🔥 ${streak}x STREAK`;
        this.elements.streakBadge.classList.add('show');
      } else {
        this.elements.streakBadge.classList.remove('show');
      }
    }
  },

  showGameOver(state) {
    if (this.elements.finalScore) {
      const best = state.bestStreak || 0;
      this.elements.finalScore.innerHTML = `Final Score: ${state.score}` +
        (best >= Scoring.COMBO_THRESHOLD ? `<br><span class="best-streak">Best Streak: ${best}x</span>` : '');
    }
    if (this.elements.gameOverScreen) this.elements.gameOverScreen.classList.remove('hidden');
  },

  // meta is optional and only ever populated by our own Scoring module:
  // { points, streak, bonus }
  flashResult(made, swish, meta = {}) {
    if (!this.elements.flash) this._buildFeedbackLayer();
    const { points = 0, streak = 0, bonus = 0 } = meta;
    const kind = !made ? 'miss' : swish ? 'swish' : 'make';

    this._playSound(kind, streak);
    this._triggerFlash(kind);
    this._triggerPopup(kind, points, streak, bonus);
  },

  _buildFeedbackLayer() {
    if (document.getElementById('result-flash')) {
      this.elements.flash = document.getElementById('result-flash');
      this.elements.popup = document.getElementById('result-popup');
      this.elements.streakBadge = document.getElementById('streak-badge');
      return;
    }

    const style = document.createElement('style');
    style.textContent = `
      #result-flash {
        position: absolute; inset: 0; pointer-events: none; opacity: 0;
        z-index: 5; transition: opacity 0.18s ease-out;
      }
      #result-flash.show { opacity: 1; }
      #result-flash.make { background: radial-gradient(circle, rgba(76,217,100,0.35), transparent 70%); }
      #result-flash.miss { background: radial-gradient(circle, rgba(217,76,76,0.30), transparent 70%); }
      #result-flash.swish { background: radial-gradient(circle, rgba(255,215,0,0.45), transparent 70%); }

      #result-popup {
        position: absolute; left: 50%; top: 40%; z-index: 6;
        pointer-events: none; font-weight: 800; text-align: center;
        text-shadow: 0 2px 6px rgba(0,0,0,0.7); opacity: 0; white-space: nowrap;
      }
      #result-popup.pop { animation: result-popup-float 0.9s ease-out forwards; }
      @keyframes result-popup-float {
        0%   { opacity: 0; transform: translate(-50%, -40%) scale(0.6); }
        15%  { opacity: 1; transform: translate(-50%, -55%) scale(1.15); }
        30%  { opacity: 1; transform: translate(-50%, -55%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -90%) scale(1); }
      }

      #streak-badge {
        position: absolute; top: 44px; left: 50%; transform: translateX(-50%);
        z-index: 6; pointer-events: none; font-weight: 700; font-size: 0.95rem;
        padding: 4px 12px; border-radius: 999px; background: rgba(255,102,0,0.85);
        color: #fff; opacity: 0; transition: opacity 0.15s ease-out, transform 0.15s ease-out;
        text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      }
      #streak-badge.show { opacity: 1; }

      .best-streak { font-size: 0.85em; opacity: 0.85; }
    `;
    document.head.appendChild(style);

    const container = document.getElementById('game-container') || document.body;

    const flash = document.createElement('div');
    flash.id = 'result-flash';
    container.appendChild(flash);

    const popup = document.createElement('div');
    popup.id = 'result-popup';
    container.appendChild(popup);

    const streakBadge = document.createElement('div');
    streakBadge.id = 'streak-badge';
    container.appendChild(streakBadge);

    this.elements.flash = flash;
    this.elements.popup = popup;
    this.elements.streakBadge = streakBadge;
  },

  _triggerFlash(kind) {
    const flash = this.elements.flash;
    flash.classList.remove('make', 'miss', 'swish', 'show');
    void flash.offsetWidth; // restart the CSS transition
    flash.classList.add(kind, 'show');
    setTimeout(() => flash.classList.remove('show'), 220);
  },

  _triggerPopup(kind, points, streak, bonus) {
    const popup = this.elements.popup;
    popup.classList.remove('pop');
    void popup.offsetWidth; // restart the CSS animation

    let text;
    if (kind === 'miss') {
      text = 'MISS';
      popup.style.color = '#ff5c5c';
      popup.style.fontSize = '1.8rem';
    } else if (kind === 'swish') {
      text = `SWISH! +${points}`;
      popup.style.color = '#ffd700';
      popup.style.fontSize = '2.4rem';
    } else {
      text = `+${points}`;
      popup.style.color = '#4cd964';
      popup.style.fontSize = '2.2rem';
    }
    if (kind !== 'miss' && streak >= Scoring.COMBO_THRESHOLD) {
      text += ` · ${streak}x COMBO`;
      if (bonus > 0) text += ` (+${bonus})`;
    }

    popup.textContent = text;
    popup.classList.add('pop');
  },

  _ensureAudio() {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.audioCtx = new Ctx();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  },

  _playSound(kind, streak) {
    const ctx = this._ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (kind === 'miss') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
      return;
    }

    const pitchBump = Math.min(streak, 8) * 30;
    const notes = kind === 'swish' ? [880, 1108, 1318] : [660, 880];
    notes.forEach((freq, i) => {
      const start = now + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'swish' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq + pitchBump, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  },
};
