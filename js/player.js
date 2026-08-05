// Feature: Player Character (branch: feature/player-character)
// Owns a rough, low-res pixel-art character performing the throw: idle
// stance, a charging wind-up while state.charging is true, a release snap
// timed to state.ball.inFlight becoming true, and a follow-through.
// Positions itself from state.currentZone.x/y, falling back to
// state.ball.x/y if zones.js isn't present yet. Reads state.charging as a
// plain falsy check so it degrades gracefully before input.js's
// hold-to-release rework lands. Read-only over state except its own
// internal animation bookkeeping (module-scoped, not stored on state).

const Player = (() => {
  const RELEASE_DURATION = 0.14; // seconds the release-snap pose holds
  const FOLLOW_DURATION = 0.32; // seconds the follow-through pose holds
  const MAX_CHARGE_VISUAL = 1.1; // seconds of holding before wind-up maxes out

  // Arm angle, in radians, measured so 0 = straight up (toward the hoop)
  // and PI = straight down (resting).
  const IDLE_ANGLE = 2.35;
  const CHARGE_ANGLE = 2.75;
  const RELEASE_ANGLE = 0.3;
  const FOLLOW_ANGLE = 0.55;

  const STAND_OFFSET_X = 30; // character stands beside the ball, not on it
  const GROUND_OFFSET = 34; // feet sit this far below the ball/anchor point

  let anchorX = 0;
  let anchorY = 0;
  let phase = 'idle'; // 'idle' | 'charging' | 'release' | 'follow'
  let phaseTimer = 0;
  let chargeTimer = 0;
  let idleTimer = 0;
  let displayAngle = IDLE_ANGLE;
  let displayCrouch = 0;
  let wasInFlight = false;

  function resolveAnchor(state) {
    if (state.currentZone) return { x: state.currentZone.x, y: state.currentZone.y };
    return { x: state.ball.x, y: state.ball.y };
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function approach(current, target, rate, dt) {
    return lerp(current, target, Math.min(1, rate * dt));
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  return {
    reset(state) {
      const p = resolveAnchor(state);
      anchorX = p.x;
      anchorY = p.y;
      phase = 'idle';
      phaseTimer = 0;
      chargeTimer = 0;
      idleTimer = 0;
      displayAngle = IDLE_ANGLE;
      displayCrouch = 0;
      wasInFlight = state.ball.inFlight;
    },

    update(state, dt) {
      const inFlight = state.ball.inFlight;
      const charging = state.charging === true;

      // Freeze the stand position once a shot is airborne, otherwise the
      // fallback-to-ball.x/y case would drag the character across the
      // court as the ball flies toward the hoop.
      if (!inFlight) {
        const p = resolveAnchor(state);
        anchorX = p.x;
        anchorY = p.y;
      }

      const justLaunched = inFlight && !wasInFlight;
      wasInFlight = inFlight;

      if (charging) {
        phase = 'charging';
        phaseTimer = 0;
        chargeTimer = Math.min(MAX_CHARGE_VISUAL, chargeTimer + dt);
      } else if (justLaunched) {
        phase = 'release';
        phaseTimer = 0;
        chargeTimer = 0;
      } else if (phase === 'release') {
        phaseTimer += dt;
        if (phaseTimer >= RELEASE_DURATION) {
          phase = 'follow';
          phaseTimer = 0;
        }
      } else if (phase === 'follow') {
        phaseTimer += dt;
        if (phaseTimer >= FOLLOW_DURATION) {
          phase = 'idle';
          phaseTimer = 0;
          idleTimer = 0;
        }
      } else {
        phase = 'idle';
        chargeTimer = 0;
        idleTimer += dt;
      }

      let targetAngle = IDLE_ANGLE;
      let targetCrouch = 0;
      let angleRate = 8;
      let crouchRate = 8;

      if (phase === 'charging') {
        const t = chargeTimer / MAX_CHARGE_VISUAL;
        targetAngle = lerp(IDLE_ANGLE, CHARGE_ANGLE, t);
        targetCrouch = lerp(0, 8, t);
      } else if (phase === 'release') {
        targetAngle = RELEASE_ANGLE;
        targetCrouch = -4;
        angleRate = 26;
        crouchRate = 22;
      } else if (phase === 'follow') {
        targetAngle = FOLLOW_ANGLE;
        targetCrouch = -1;
        angleRate = 10;
      } else {
        targetAngle = IDLE_ANGLE + Math.sin(idleTimer * 2.1) * 0.05;
        targetCrouch = Math.sin(idleTimer * 2.1) * 1.2;
      }

      displayAngle = approach(displayAngle, targetAngle, angleRate, dt);
      displayCrouch = approach(displayCrouch, targetCrouch, crouchRate, dt);
    },

    draw(ctx, canvas, state) {
      const scale = state.ball && typeof state.ball.radius === 'number' ? state.ball.radius / 20 : 1;
      const hipX = anchorX - STAND_OFFSET_X * scale;
      const groundY = anchorY + GROUND_OFFSET * scale;

      const HIP_W = 22 * scale;
      const HIP_H = 10 * scale;
      const TORSO_W = 24 * scale;
      const TORSO_H = 26 * scale;
      const HEAD = 16 * scale;
      const LEG_W = 9 * scale;
      const LEG_H_BASE = 20 * scale;
      const LEG_GAP = 4 * scale;
      const ARM_LEN = 24 * scale;
      const ARM_W = 8 * scale;
      const HAND = 9 * scale;
      const OFF_ARM_LEN = 15 * scale;
      const SHOE_H = 6 * scale;

      const legH = Math.max(6 * scale, LEG_H_BASE - displayCrouch * scale);
      const hipY = groundY - legH;
      const torsoTop = hipY - HIP_H / 2 - TORSO_H;
      const headCenterY = torsoTop - HEAD / 2 - 2 * scale;
      const shoulderY = torsoTop + 4 * scale;

      const SKIN = '#f2c191';
      const JERSEY = '#e63946';
      const SHORTS = '#1d3557';
      const SHOE = '#22223b';

      // Off-arm: static, hangs at the character's side.
      const offShoulderX = hipX - TORSO_W / 2 + 2 * scale;
      ctx.save();
      ctx.translate(offShoulderX, shoulderY);
      ctx.rotate(0.35);
      rect(ctx, -ARM_W / 2, 0, ARM_W, OFF_ARM_LEN, JERSEY);
      ctx.restore();

      // Legs + shoes
      rect(ctx, hipX - LEG_GAP / 2 - LEG_W, hipY + HIP_H / 2 - 2 * scale, LEG_W, legH, SHORTS);
      rect(ctx, hipX + LEG_GAP / 2, hipY + HIP_H / 2 - 2 * scale, LEG_W, legH, SHORTS);
      rect(ctx, hipX - LEG_GAP / 2 - LEG_W - 1 * scale, groundY - SHOE_H, LEG_W + 2 * scale, SHOE_H, SHOE);
      rect(ctx, hipX + LEG_GAP / 2 - 1 * scale, groundY - SHOE_H, LEG_W + 2 * scale, SHOE_H, SHOE);

      // Hip + torso
      rect(ctx, hipX - HIP_W / 2, hipY - HIP_H / 2, HIP_W, HIP_H, SHORTS);
      rect(ctx, hipX - TORSO_W / 2, torsoTop, TORSO_W, TORSO_H, JERSEY);

      // Head + eyes
      rect(ctx, hipX - HEAD / 2, headCenterY - HEAD / 2, HEAD, HEAD, SKIN);
      ctx.fillStyle = '#1a1a1a';
      const eyeY = headCenterY - HEAD / 2 + HEAD * 0.4;
      ctx.fillRect(Math.round(hipX - HEAD * 0.22), Math.round(eyeY), Math.round(2 * scale) || 1, Math.round(2 * scale) || 1);
      ctx.fillRect(Math.round(hipX + HEAD * 0.08), Math.round(eyeY), Math.round(2 * scale) || 1, Math.round(2 * scale) || 1);

      // Throwing arm — single rigid segment rotated around the shoulder.
      // displayAngle: 0 = straight up (toward the hoop), PI = straight
      // down (resting); the rectangle is authored hanging down, so it's
      // rotated by (displayAngle - PI) to land on the intended direction.
      const throwShoulderX = hipX + TORSO_W / 2 - 2 * scale;
      ctx.save();
      ctx.translate(throwShoulderX, shoulderY);
      ctx.rotate(displayAngle - Math.PI);
      rect(ctx, -ARM_W / 2, -ARM_W / 2, ARM_W, ARM_LEN, JERSEY);
      rect(ctx, -HAND / 2, ARM_LEN - HAND / 2, HAND, HAND, SKIN);
      ctx.restore();
    },
  };
})();
