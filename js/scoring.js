// Feature: Scoring & UI (branch: feature/scoring-ui)
// Owns point values and shot-result handling. UI (below) owns on-screen
// display of score/timer/start/game-over screens.

const Scoring = {
  onShotResult(state, { made, swish }) {
    if (made) {
      state.score += swish ? 3 : 2;
    }
    if (typeof UI !== 'undefined') UI.flashResult(made, swish);
    resetBall();
  },
};
