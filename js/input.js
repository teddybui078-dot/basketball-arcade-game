// Feature: Input Controls (branch: feature/input-controls)
// Owns flick/drag gesture detection and converts it into a launch velocity
// vector, handed to game.js via the onLaunch callback.

const Input = {
  attach(canvas, state, { onLaunch }) {
    const FLICK_POWER = 0.8;
    let dragStart = null;

    const pointFromEvent = (e) => {
      const rect = canvas.getBoundingClientRect();
      const source = e.changedTouches ? e.changedTouches[0] : e;
      return { x: source.clientX - rect.left, y: source.clientY - rect.top };
    };

    const handleStart = (e) => {
      if (state.ball.inFlight) return;
      dragStart = pointFromEvent(e);
    };

    const handleEnd = (e) => {
      if (!dragStart) return;
      const dragEnd = pointFromEvent(e);
      const dx = dragEnd.x - dragStart.x;
      const dy = dragEnd.y - dragStart.y;
      dragStart = null;

      // TODO: incorporate gesture duration/speed, not just displacement
      onLaunch(dx * FLICK_POWER, dy * FLICK_POWER);
    };

    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('touchstart', handleStart, { passive: true });
    canvas.addEventListener('touchend', handleEnd);
  },
};
