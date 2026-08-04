// Feature: Scoring & UI (branch: feature/scoring-ui)
// Owns point values and shot-result handling. UI (below) owns on-screen
// display of score/timer/start/game-over screens.
//
// Adds two fields to the shared `state` object, both owned by this module:
// `state.streak` (current consecutive-makes count, reset on a miss) and
// `state.bestStreak` (max streak this round). Nothing else reads/writes
// them, and `UI.flashResult` gains an optional third `meta` argument —
// only this module calls it, so the contract's two-arg call from Physics'
// perspective (via Scoring) is unaffected.

const Scoring = {
  COMBO_THRESHOLD: 3, // streak length at which bonus points kick in
  MAX_COMBO_BONUS: 5,

  onShotResult(state, { made, swish }) {
    let points = 0;
    let bonus = 0;

    if (made) {
      state.streak = (state.streak || 0) + 1;
      state.bestStreak = Math.max(state.bestStreak || 0, state.streak);

      points = swish ? 3 : 2;
      if (state.streak >= this.COMBO_THRESHOLD) {
        bonus = Math.min(state.streak - (this.COMBO_THRESHOLD - 1), this.MAX_COMBO_BONUS);
        points += bonus;
      }
      state.score += points;
    } else {
      state.streak = 0;
    }

    if (typeof UI !== 'undefined') {
      UI.flashResult(made, swish, { points, streak: state.streak, bonus });
    }
    resetBall();
  },
};
