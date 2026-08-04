// Feature: Physics & Collision (branch: feature/physics-collision)
// Owns ball trajectory (gravity, wind drift), rim/backboard collision, and
// make/miss/swish detection. Reports shot results to Scoring.

const GRAVITY = 900; // px/s^2, placeholder tuning value

const Physics = {
  update(state, dt) {
    const { ball, hoop, bounds } = state;
    if (!ball.inFlight) return;

    ball.vy += GRAVITY * dt;
    ball.vx += (state.wind || 0) * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // TODO: real rim/backboard collision + swish-vs-rim-in detection
    const throughHoop = Math.abs(ball.x - hoop.x) < hoop.width / 2 && Math.abs(ball.y - hoop.y) < 12;
    if (throughHoop) {
      if (typeof Scoring !== 'undefined') {
        Scoring.onShotResult(state, { made: true, swish: Math.abs(ball.vx) < 50 });
      }
      return;
    }

    const outOfBounds = ball.y - ball.radius > bounds.height || ball.x + ball.radius < 0 || ball.x - ball.radius > bounds.width;
    if (outOfBounds) {
      if (typeof Scoring !== 'undefined') {
        Scoring.onShotResult(state, { made: false, swish: false });
      } else {
        resetBall();
      }
    }
  },
};
