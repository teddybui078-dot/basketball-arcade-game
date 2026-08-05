// Core game state and main loop. Orchestrates the feature modules below —
// each `typeof X !== 'undefined'` guard lets this loop run standalone before
// a given module has been implemented in its own worktree/branch.

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const GAME_DURATION_SECONDS = 60;

const state = {
  running: false,
  timeRemaining: GAME_DURATION_SECONDS,
  score: 0,
  bounds: { width: 0, height: 0 },
  ball: { x: 0, y: 0, vx: 0, vy: 0, radius: 20, inFlight: false },
  hoop: { x: 0, y: 80, width: 90 },
  wind: 0,
  lastTimestamp: 0,
};

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  state.bounds.width = canvas.width;
  state.bounds.height = canvas.height;
}

function resetBall() {
  state.ball.x = canvas.width / 2;
  state.ball.y = canvas.height - 80;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.inFlight = false;
}

function resetHoop() {
  state.hoop.x = canvas.width / 2;
  state.hoop.y = 80;
}

function launchBall(vx, vy) {
  if (state.ball.inFlight) return;
  state.ball.vx = vx;
  state.ball.vy = vy;
  state.ball.inFlight = true;
}

function startGame() {
  state.running = true;
  state.timeRemaining = GAME_DURATION_SECONDS;
  state.score = 0;
  resetHoop();
  resetBall();
  if (typeof Difficulty !== 'undefined') Difficulty.reset(state);
  if (typeof Player !== 'undefined') Player.reset(state);
  if (typeof UI !== 'undefined') UI.showHUD(state);
  state.lastTimestamp = performance.now();
  requestAnimationFrame(loop);
}

function endGame() {
  state.running = false;
  if (typeof UI !== 'undefined') UI.showGameOver(state);
}

function loop(timestamp) {
  if (!state.running) return;
  const dt = Math.min((timestamp - state.lastTimestamp) / 1000, 0.05);
  state.lastTimestamp = timestamp;

  state.timeRemaining -= dt;
  if (state.timeRemaining <= 0) {
    state.timeRemaining = 0;
    if (typeof Render !== 'undefined') Render.draw(ctx, canvas, state);
    endGame();
    return;
  }

  if (typeof Difficulty !== 'undefined') Difficulty.update(state, dt);
  if (typeof Physics !== 'undefined') Physics.update(state, dt);
  if (typeof Player !== 'undefined') Player.update(state, dt);
  if (typeof Render !== 'undefined') Render.draw(ctx, canvas, state);
  if (typeof Player !== 'undefined') Player.draw(ctx, canvas, state);
  if (typeof UI !== 'undefined') UI.update(state);

  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  resizeCanvas();
  resetHoop();
});

window.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  resetHoop();
  resetBall();
  if (typeof Render !== 'undefined') Render.draw(ctx, canvas, state);
  if (typeof Input !== 'undefined') Input.attach(canvas, state, { onLaunch: launchBall });
  if (typeof UI !== 'undefined') UI.attachStartButton(startGame);
});
