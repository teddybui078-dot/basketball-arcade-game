// Feature: Difficulty Progression (branch: feature/difficulty-progression)
// Owns hoop movement and wind variance, ramping up as the 60s round
// progresses (drive off state.timeRemaining).

const EASY_WINDOW_SECONDS = 15; // first chunk of the round: hoop stationary, no wind
const ROUND_DURATION_SECONDS = 60; // matches GAME_DURATION_SECONDS in game.js
const HOOP_SPEED_MAX = 130; // px/s, hoop's side-to-side speed at full difficulty
const WIND_MAX = 160; // px/s^2, max wind gust magnitude at full difficulty
const WIND_LERP_RATE = 2; // per second: how fast state.wind eases toward its gust target
const WIND_GUST_INTERVAL_MIN = 1.5; // seconds between picking a new gust target
const WIND_GUST_INTERVAL_MAX = 3.5;

const Difficulty = {
  reset(state) {
    state.wind = 0;
    state.hoopDirection = 1;
    state.hoopSpeed = 0;
    this._windTimer = 0;
    this._windTarget = 0;
  },

  update(state, dt) {
    const elapsed = ROUND_DURATION_SECONDS - state.timeRemaining;
    const rampElapsed = elapsed - EASY_WINDOW_SECONDS;
    const rampDuration = ROUND_DURATION_SECONDS - EASY_WINDOW_SECONDS;
    const linear = Math.min(1, Math.max(0, rampElapsed / rampDuration));
    const progress = linear * linear; // ease-in: gentle at first, steep in the closing seconds

    state.hoopSpeed = HOOP_SPEED_MAX * progress;

    // Wind "gusts": pick a new random target every couple seconds, scaled by
    // progress, and ease state.wind toward it so direction changes feel like
    // gusts rather than instant flips.
    this._windTimer -= dt;
    if (this._windTimer <= 0) {
      this._windTimer = WIND_GUST_INTERVAL_MIN + Math.random() * (WIND_GUST_INTERVAL_MAX - WIND_GUST_INTERVAL_MIN);
      this._windTarget = (Math.random() * 2 - 1) * WIND_MAX * progress;
    }
    state.wind += (this._windTarget - state.wind) * Math.min(1, WIND_LERP_RATE * dt);

    if (state.hoopSpeed > 0 && state.bounds.width) {
      state.hoop.x += state.hoopDirection * state.hoopSpeed * dt;
      const margin = state.hoop.width / 2 + 20;
      if (state.hoop.x < margin || state.hoop.x > state.bounds.width - margin) {
        state.hoopDirection *= -1;
      }
    }
  },
};
