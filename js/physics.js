// Feature: Physics & Collision (branch: feature/physics-collision)
// Owns ball trajectory (gravity, wind drift), rim/backboard collision, and
// make/miss/swish detection. Reports shot results to Scoring.

const GRAVITY = 900; // px/s^2, placeholder tuning value

// The rim is modeled as two circular posts (left/right ends of hoop.width)
// rather than the flat rectangle render.js draws — that's what lets the ball
// bounce off the iron in any direction instead of just stopping on contact.
const RIM_POST_RADIUS = 7;
const RIM_THICKNESS = 8; // matches the rect height render.js strokes at hoop.y
const RIM_RESTITUTION = 0.55;

// No dedicated `state.backboard` field exists (see CONTRACT.md), so physics
// derives one from the hoop: a vertical wall flush with the rim's back post,
// standing up behind it. Bank shots hit this and reflect back toward court.
const BACKBOARD_HEIGHT = 70;
const BACKBOARD_THICKNESS = 6;
const BACKBOARD_RESTITUTION = 0.6;

// Bounding movement per collision check to roughly the smallest feature size
// (rim post radius) prevents the ball tunneling through the rim/backboard at
// high speed instead of bouncing off it.
const MAX_SUBSTEP_DISTANCE = 6; // px
const MAX_SUBSTEPS = 16;

// Tracks whether the in-flight ball has touched iron, to tell a clean swish
// apart from a shot that rattled in. Module-scoped (not on `state.ball`)
// since it's private bookkeeping physics doesn't need to expose.
let wasInFlight = false;
let touchedIronThisShot = false;

function reflectOffNormal(ball, nx, ny, restitution) {
  const vDotN = ball.vx * nx + ball.vy * ny;
  if (vDotN >= 0) return; // already moving apart, nothing to reflect
  const impulse = (1 + restitution) * vDotN;
  ball.vx -= impulse * nx;
  ball.vy -= impulse * ny;
}

function resolveCircleCollision(ball, cx, cy, radius, restitution) {
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  const dist = Math.hypot(dx, dy);
  const minDist = ball.radius + radius;
  if (dist === 0 || dist >= minDist) return false;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  ball.x += nx * overlap;
  ball.y += ny * overlap;
  reflectOffNormal(ball, nx, ny, restitution);
  return true;
}

function resolveRimCollision(ball, hoop) {
  const leftPostX = hoop.x - hoop.width / 2;
  const rightPostX = hoop.x + hoop.width / 2;
  const hitLeft = resolveCircleCollision(ball, leftPostX, hoop.y, RIM_POST_RADIUS, RIM_RESTITUTION);
  const hitRight = resolveCircleCollision(ball, rightPostX, hoop.y, RIM_POST_RADIUS, RIM_RESTITUTION);
  return hitLeft || hitRight;
}

function resolveBackboardCollision(ball, hoop) {
  const backboardX = hoop.x + hoop.width / 2;
  const yTop = hoop.y - BACKBOARD_HEIGHT;
  const yBottom = hoop.y + RIM_THICKNESS;
  const closestY = Math.min(Math.max(ball.y, yTop), yBottom);

  const dx = ball.x - backboardX;
  const dy = ball.y - closestY;
  const dist = Math.hypot(dx, dy);
  const minDist = ball.radius + BACKBOARD_THICKNESS / 2;
  if (dist === 0 || dist >= minDist) return false;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  ball.x += nx * overlap;
  ball.y += ny * overlap;
  reflectOffNormal(ball, nx, ny, BACKBOARD_RESTITUTION);
  return true;
}

const Physics = {
  update(state, dt) {
    const { ball, hoop, bounds } = state;
    if (!ball.inFlight) {
      wasInFlight = false;
      return;
    }
    if (!wasInFlight) {
      touchedIronThisShot = false;
      wasInFlight = true;
    }

    const leftPostX = hoop.x - hoop.width / 2;
    const rightPostX = hoop.x + hoop.width / 2;
    const rimPlaneY = hoop.y + RIM_THICKNESS / 2;

    const speed = Math.hypot(ball.vx, ball.vy);
    const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP_DISTANCE)));
    const subDt = dt / substeps;

    for (let i = 0; i < substeps; i++) {
      const prevY = ball.y;

      ball.vy += GRAVITY * subDt;
      ball.vx += (state.wind || 0) * subDt;
      ball.x += ball.vx * subDt;
      ball.y += ball.vy * subDt;

      const hitRim = resolveRimCollision(ball, hoop);
      const hitBackboard = resolveBackboardCollision(ball, hoop);
      if (hitRim || hitBackboard) touchedIronThisShot = true;

      // A make is the ball's center crossing the rim's plane heading down
      // while still between the posts — post collisions above already keep
      // the ball out of range of this check unless it genuinely fits through.
      const crossedRimPlane = prevY <= rimPlaneY && ball.y > rimPlaneY && ball.vy > 0;
      const withinGap = ball.x > leftPostX && ball.x < rightPostX;
      if (crossedRimPlane && withinGap) {
        if (typeof Scoring !== 'undefined') {
          Scoring.onShotResult(state, { made: true, swish: !touchedIronThisShot });
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
        return;
      }
    }
  },
};
