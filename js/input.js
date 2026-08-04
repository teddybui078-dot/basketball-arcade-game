// Feature: Input Controls (branch: feature/input-controls)
// Owns flick/drag gesture detection and converts it into a launch velocity
// vector, handed to game.js via the onLaunch callback.

const Input = {
  attach(canvas, state, { onLaunch }) {
    // Launch speed tracks real gesture speed (px/s) almost 1:1, since that
    // unit already matches Physics' GRAVITY (px/s^2) — a flick that moves
    // the pointer at ~1000px/s launches the ball at ~1000px/s.
    const FLICK_SCALE = 1.15;
    // Floor under the gesture duration so a near-instant tap/flick can't
    // divide by ~0 and produce a spurious, absurd velocity.
    const MIN_GESTURE_SECONDS = 0.03;
    // Ceiling on launch speed so a freak sample can't send the ball off at
    // an unplayable speed.
    const MAX_LAUNCH_SPEED = 2200;

    let dragStart = null;

    const pointFromEvent = (e) => {
      const rect = canvas.getBoundingClientRect();
      const source = e.changedTouches ? e.changedTouches[0] : e;
      return { x: source.clientX - rect.left, y: source.clientY - rect.top };
    };

    const handleStart = (e) => {
      if (state.ball.inFlight) return;
      const point = pointFromEvent(e);
      dragStart = { x: point.x, y: point.y, t: performance.now() };
    };

    const handleEnd = (e) => {
      if (!dragStart) return;
      const dragEnd = pointFromEvent(e);
      const dt = Math.max((performance.now() - dragStart.t) / 1000, MIN_GESTURE_SECONDS);
      const dx = dragEnd.x - dragStart.x;
      const dy = dragEnd.y - dragStart.y;
      dragStart = null;

      let vx = (dx / dt) * FLICK_SCALE;
      let vy = (dy / dt) * FLICK_SCALE;

      const speed = Math.hypot(vx, vy);
      if (speed > MAX_LAUNCH_SPEED) {
        const clamp = MAX_LAUNCH_SPEED / speed;
        vx *= clamp;
        vy *= clamp;
      }

      onLaunch(vx, vy);
    };

    canvas.addEventListener('mousedown', handleStart);
    // Mouse drags routinely leave the canvas before releasing on a fast
    // flick, so track release on the window rather than the canvas.
    window.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('touchstart', handleStart, { passive: true });
    canvas.addEventListener('touchend', handleEnd);
  },
};
