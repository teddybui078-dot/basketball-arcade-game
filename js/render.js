// Feature: Rendering Core (branch: feature/rendering-core)
// Owns all canvas drawing — court, hoop, ball, and any visual polish
// (nets, shadows, trail effects). Reads state, never mutates it.

const Render = (() => {
  const TRAIL_LENGTH = 16;
  let trail = [];
  let spin = 0;

  function rimGeometry(state) {
    const rx = state.hoop.width / 2;
    return { cx: state.hoop.x, cy: state.hoop.y, rx, ry: rx * 0.28 };
  }

  function updateAnimationState(state) {
    if (state.ball.inFlight) {
      trail.push({ x: state.ball.x, y: state.ball.y });
      if (trail.length > TRAIL_LENGTH) trail.shift();
      const speed = Math.hypot(state.ball.vx, state.ball.vy);
      spin += 0.05 + speed * 0.0025;
    } else {
      trail.length = 0;
      spin = 0;
    }
  }

  function drawBackground(ctx, canvas, state) {
    const w = canvas.width;
    const h = canvas.height;
    const floorTop = state.hoop.y + state.hoop.width * 0.75;

    // Arena backdrop behind the court
    const sky = ctx.createLinearGradient(0, 0, 0, floorTop);
    sky.addColorStop(0, '#1b1035');
    sky.addColorStop(1, '#3a1f4d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, floorTop);

    // Court floor
    const floor = ctx.createLinearGradient(0, floorTop, 0, h);
    floor.addColorStop(0, '#d9a066');
    floor.addColorStop(1, '#a8672f');
    ctx.fillStyle = floor;
    ctx.fillRect(0, floorTop, w, h - floorTop);

    // Wood plank lines, denser near the bottom for a perspective feel
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1;
    const plankCount = 16;
    for (let i = 1; i < plankCount; i++) {
      const t = i / plankCount;
      const y = floorTop + (h - floorTop) * (t * t);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Baseline where the backdrop meets the floor
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, floorTop);
    ctx.lineTo(w, floorTop);
    ctx.stroke();

    return floorTop;
  }

  function drawCourtMarkings(ctx, canvas, floorTop) {
    const courtX = canvas.width / 2;
    const laneWidth = Math.min(canvas.width * 0.55, 170);
    const laneHeight = Math.max(60, (canvas.height - floorTop) * 0.5);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2;

    // Free-throw lane
    ctx.strokeRect(courtX - laneWidth / 2, floorTop, laneWidth, laneHeight);

    // Free-throw circle
    ctx.beginPath();
    ctx.arc(courtX, floorTop + laneHeight, laneWidth / 2, Math.PI, Math.PI * 2);
    ctx.stroke();

    // Restricted-area arc under the basket
    ctx.beginPath();
    ctx.arc(courtX, floorTop, laneWidth * 0.32, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  function drawBackboard(ctx, state) {
    const { cx: hoopX, cy: hoopY, rx, ry } = rimGeometry(state);
    const boardW = rx * 3.4;
    const boardH = rx * 1.7;
    const boardBottomY = hoopY - ry - rx * 0.24;
    const boardY = boardBottomY - boardH;
    const boardX = hoopX - boardW / 2;

    // Support pole running off the top of the screen
    ctx.fillStyle = '#333340';
    ctx.fillRect(hoopX - rx * 0.08, 0, rx * 0.16, boardY + boardH * 0.5);

    // Backboard drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(boardX + 3, boardY + 3, boardW, boardH);

    // Backboard glass
    const glass = ctx.createLinearGradient(boardX, boardY, boardX, boardY + boardH);
    glass.addColorStop(0, '#f7f7f7');
    glass.addColorStop(1, '#dcdce0');
    ctx.fillStyle = glass;
    ctx.fillRect(boardX, boardY, boardW, boardH);

    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = Math.max(2, rx * 0.06);
    ctx.strokeRect(boardX, boardY, boardW, boardH);

    // Shooter's square
    const innerW = boardW * 0.4;
    const innerH = boardH * 0.45;
    ctx.strokeRect(hoopX - innerW / 2, boardBottomY - innerH - boardH * 0.08, innerW, innerH);
  }

  function drawNet(ctx, state) {
    const { cx, cy, rx, ry } = rimGeometry(state);
    const strands = 10;
    const netDepth = rx * 1.3;
    const bottomRx = rx * 0.32;
    const bottomRy = ry * 0.55;
    const bottomCy = cy + netDepth;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.2;

    const tops = [];
    const bottoms = [];
    for (let i = 0; i < strands; i++) {
      const a = (Math.PI * 2 * i) / strands;
      tops.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
      bottoms.push({ x: cx + Math.cos(a) * bottomRx, y: bottomCy + Math.sin(a) * bottomRy });
    }

    for (let i = 0; i < strands; i++) {
      const a = (Math.PI * 2 * i) / strands;
      const top = tops[i];
      const bottom = bottoms[i];
      const midX = (top.x + bottom.x) / 2 + Math.cos(a) * rx * 0.22;
      const midY = (top.y + bottom.y) / 2;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.quadraticCurveTo(midX, midY, bottom.x, bottom.y);
      ctx.stroke();
    }

    // Cross threads for a diamond weave
    [0.4, 0.75].forEach((t) => {
      ctx.beginPath();
      for (let i = 0; i <= strands; i++) {
        const a = (Math.PI * 2 * (i % strands)) / strands;
        const rxT = (rx + (bottomRx - rx) * t) * 1.05;
        const ryT = (ry + (bottomRy - ry) * t) * 1.05;
        const cyT = cy + (bottomCy - cy) * t;
        const x = cx + Math.cos(a) * rxT;
        const y = cyT + Math.sin(a) * ryT;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }

  function drawRimBack(ctx, state) {
    const { cx, cy, rx, ry } = rimGeometry(state);
    ctx.strokeStyle = '#c9500f';
    ctx.lineWidth = Math.max(3, rx * 0.14);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  function drawRimFront(ctx, state) {
    const { cx, cy, rx, ry } = rimGeometry(state);
    ctx.strokeStyle = '#ff7b1a';
    ctx.lineWidth = Math.max(3, rx * 0.17);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.88, ry * 0.7, 0, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }

  function drawBallShadow(ctx, canvas, state) {
    const ball = state.ball;
    const groundY = canvas.height - ball.radius * 1.5;
    const totalRise = Math.max(1, groundY - state.hoop.y);
    const progress = Math.min(1, Math.max(0, (groundY - ball.y) / totalRise));
    const scale = 1 - progress * 0.75;
    const opacity = 0.32 * (1 - progress * 0.75);

    if (opacity <= 0.02) return;

    ctx.beginPath();
    ctx.ellipse(ball.x, groundY, ball.radius * 1.15 * scale, ball.radius * 0.4 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
    ctx.fill();
  }

  function drawTrail(ctx, state) {
    const radius = state.ball.radius;
    for (let i = 0; i < trail.length; i++) {
      const t = (i + 1) / trail.length;
      const p = trail[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 0.55 * t, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(230, 81, 0, ${0.22 * t})`;
      ctx.fill();
    }
  }

  function drawBall(ctx, state) {
    const { x, y, radius } = state.ball;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);

    const grad = ctx.createRadialGradient(-radius * 0.35, -radius * 0.35, radius * 0.15, 0, 0, radius);
    grad.addColorStop(0, '#ff9d52');
    grad.addColorStop(0.55, '#e8590c');
    grad.addColorStop(1, '#a8420a');
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(35, 18, 6, 0.8)';
    ctx.lineWidth = Math.max(1, radius * 0.07);

    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(0, radius);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.quadraticCurveTo(-radius * 0.55, 0, 0, radius);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.quadraticCurveTo(radius * 0.55, 0, 0, radius);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-radius * 0.32, -radius * 0.32, radius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fill();

    ctx.restore();
  }

  function drawVignette(ctx, canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const grad = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.2, w / 2, h * 0.55, h * 0.75);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  return {
    draw(ctx, canvas, state) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      updateAnimationState(state);

      const floorTop = drawBackground(ctx, canvas, state);
      drawCourtMarkings(ctx, canvas, floorTop);
      drawBackboard(ctx, state);
      drawNet(ctx, state);
      drawRimBack(ctx, state);
      drawBallShadow(ctx, canvas, state);
      drawTrail(ctx, state);
      drawBall(ctx, state);
      drawRimFront(ctx, state);
      drawVignette(ctx, canvas);
    },
  };
})();
