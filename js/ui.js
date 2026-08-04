// Feature: Scoring & UI (branch: feature/scoring-ui)
// Owns the DOM overlay — HUD (score/timer), start screen, game-over screen.

const UI = {
  elements: {},

  init() {
    this.elements.score = document.getElementById('score');
    this.elements.timer = document.getElementById('timer');
    this.elements.startScreen = document.getElementById('start-screen');
    this.elements.gameOverScreen = document.getElementById('game-over-screen');
    this.elements.finalScore = document.getElementById('final-score');
  },

  attachStartButton(onStart) {
    this.init();
    document.getElementById('start-button').addEventListener('click', () => {
      this.elements.startScreen.classList.add('hidden');
      this.elements.gameOverScreen.classList.add('hidden');
      onStart();
    });
    document.getElementById('restart-button').addEventListener('click', () => {
      this.elements.gameOverScreen.classList.add('hidden');
      onStart();
    });
  },

  showHUD(state) {
    this.update(state);
  },

  update(state) {
    if (this.elements.score) this.elements.score.textContent = `Score: ${state.score}`;
    if (this.elements.timer) this.elements.timer.textContent = `Time: ${Math.ceil(state.timeRemaining)}`;
  },

  showGameOver(state) {
    if (this.elements.finalScore) this.elements.finalScore.textContent = `Final Score: ${state.score}`;
    if (this.elements.gameOverScreen) this.elements.gameOverScreen.classList.remove('hidden');
  },

  flashResult(made, swish) {
    // TODO: swish/miss visual + audio feedback
  },
};
