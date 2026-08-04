// Feature: Difficulty Progression (branch: feature/difficulty-progression)
// Owns hoop movement and wind variance, ramping up as the 60s round
// progresses (drive off state.timeRemaining).

const Difficulty = {
  reset(state) {
    state.wind = 0;
    state.hoopDirection = 1;
    state.hoopSpeed = 0;
  },

  update(state, dt) {
    // TODO: ramp state.hoopSpeed and state.wind as state.timeRemaining decreases
    if (state.hoopSpeed > 0 && state.bounds.width) {
      state.hoop.x += state.hoopDirection * state.hoopSpeed * dt;
      const margin = state.hoop.width / 2 + 20;
      if (state.hoop.x < margin || state.hoop.x > state.bounds.width - margin) {
        state.hoopDirection *= -1;
      }
    }
  },
};
