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

// Safety ceiling on ball speed right after a bounce. Belt-and-suspenders
// alongside resolving only the deepest collision below — bounds how far any
// remaining edge case (or a future tuning change) could fling the ball.
const MAX_BALL_SPEED = 2200; // px/s

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

// Checks the ball against every part of the hoop — both rim posts and the
// backboard — and resolves only the single deepest overlap, instead of
// resolving each overlapping shape independently.
//
// The backboard's collision volume is anchored at the same x as the back
// rim post and its y-range includes the post's location, so a graze near
// that post routinely overlaps both at once. Resolving both meant a single
// physical contact got applied as two stacked bounce impulses — the actual
// cause of the occasional "flies up unnaturally fast" trajectory. Picking
// only the deepest overlap treats coincident/overlapping shapes as the one
// real contact they represent.
function resolveHoopCollision(ball, hoop) {
  const leftPostX = hoop.x - hoop.width / 2;
  const rightPostX = hoop.x + hoop.width / 2;
  const backboardYTop = hoop.y - BACKBOARD_HEIGHT;
  const backboardYBottom = hoop.y + RIM_THICKNESS;
  const backboardClosestY = Math.min(Math.max(ball.y, backboardYTop), backboardYBottom);

  const candidates = [
    { x: leftPostX, y: hoop.y, radius: RIM_POST_RADIUS, restitution: RIM_RESTITUTION },
    { x: rightPostX, y: hoop.y, radius: RIM_POST_RADIUS, restitution: RIM_RESTITUTION },
    { x: rightPostX, y: backboardClosestY, radius: BACKBOARD_THICKNESS / 2, restitution: BACKBOARD_RESTITUTION },
  ];

  let deepest = null;
  for (const c of candidates) {
    const dx = ball.x - c.x;
    const dy = ball.y - c.y;
    const dist = Math.hypot(dx, dy);
    const minDist = ball.radius + c.radius;
    if (dist === 0 || dist >= minDist) continue;
    const overlap = minDist - dist;
    if (!deepest || overlap > deepest.overlap) {
      deepest = { nx: dx / dist, ny: dy / dist, overlap, restitution: c.restitution };
    }
  }
  if (!deepest) return false;

  ball.x += deepest.nx * deepest.overlap;
  ball.y += deepest.ny * deepest.overlap;
  reflectOffNormal(ball, deepest.nx, deepest.ny, deepest.restitution);

  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > MAX_BALL_SPEED) {
    const scale = MAX_BALL_SPEED / speed;
    ball.vx *= scale;
    ball.vy *= scale;
  }
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

    // Estimate this frame's peak speed (current speed plus a full frame's
    // worth of gravity) rather than just its speed at the top of the frame,
    // so the substep count stays sufficient even as the ball accelerates
    // over the course of the frame — keeps motion smooth and predictable
    // instead of coarsening right when the ball is falling fastest.
    const estimatedPeakSpeed = Math.hypot(ball.vx, ball.vy) + GRAVITY * dt;
    const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil((estimatedPeakSpeed * dt) / MAX_SUBSTEP_DISTANCE)));
    const subDt = dt / substeps;

    for (let i = 0; i < substeps; i++) {
      const prevY = ball.y;
      const prevVy = ball.vy;

      ball.vy += GRAVITY * subDt;
      ball.vx += (state.wind || 0) * subDt;
      ball.x += ball.vx * subDt;
      ball.y += ball.vy * subDt;

      if (resolveHoopCollision(ball, hoop)) touchedIronThisShot = true;

      // A make is the ball's center crossing the rim's plane heading down
      // while still between the posts — post collisions above already keep
      // the ball out of range of this check unless it genuinely fits through.
      const crossedRimPlane = prevY <= rimPlaneY && ball.y > rimPlaneY && ball.vy > 0;
      const withinGap = ball.x > leftPostX && ball.x < rightPostX;

      if (crossedRimPlane) {
        if (withinGap) {
          if (typeof Scoring !== 'undefined') {
            Scoring.onShotResult(state, { made: true, swish: !touchedIronThisShot });
          }
          return;
        }
        // Sailed past the rim's plane outside the opening. Only call this a
        // miss right away when the ball never touched iron this shot — a
        // clean airball that's clearly wide is decided the moment it passes
        // the rim instead of waiting for it to travel the rest of the way
        // off-canvas. A shot that's still bouncing around the rim might yet
        // rattle in, so that keeps playing out instead of being cut short.
        if (!touchedIronThisShot) {
          if (typeof Scoring !== 'undefined') {
            Scoring.onShotResult(state, { made: false, swish: false });
          } else {
            resetBall();
          }
          return;
        }
      }

      // Passed the top of its arc without ever climbing as high as the rim —
      // gravity only pulls it down harder from here, so it cannot possibly
      // still go in. Resolve the miss now instead of tracking it the rest of
      // the way off-canvas.
      const passedApexBelowRim = prevVy < 0 && ball.vy >= 0 && ball.y > rimPlaneY;
      if (passedApexBelowRim) {
        if (typeof Scoring !== 'undefined') {
          Scoring.onShotResult(state, { made: false, swish: false });
        } else {
          resetBall();
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
