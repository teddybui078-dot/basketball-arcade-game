// Feature: Rendering Core (branch: feature/rendering-core)
// Owns all canvas drawing — court, hoop, ball, and any visual polish
// (nets, shadows, trail effects). Reads state, never mutates it.

const Render = {
  draw(ctx, canvas, state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Court background (placeholder flat fill)
    ctx.fillStyle = '#c68642';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Hoop (placeholder rim rectangle)
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 6;
    ctx.strokeRect(state.hoop.x - state.hoop.width / 2, state.hoop.y, state.hoop.width, 8);

    // Ball (placeholder circle)
    ctx.beginPath();
    ctx.fillStyle = '#e65100';
    ctx.arc(state.ball.x, state.ball.y, state.ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // TODO: replace placeholder shapes with sprites/animations, add net + backboard art
  },
};
