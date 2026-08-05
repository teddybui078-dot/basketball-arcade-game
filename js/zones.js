// Feature: Court Zones (branch: feature/court-zones)
// Owns real basketball shot zones (paint/mid-range worth 2, beyond the arc
// worth 3) and rotates the player through them after every resolved shot,
// like a real shootaround.
//
// Each zone is a polar offset from the hoop: `angle` in degrees (0 = straight
// out from the hoop, negative = left, positive = right) and `r` a 0-1
// distance fraction. Using the same polar formula for every zone AND for the
// drawn three-point arc means the boundary is consistent by construction —
// every zone with `r < THREE_POINT_R` is a 2, every zone at or beyond it is a
// 3, so the line always visually separates the zones correctly.
const THREE_POINT_R = 0.6;

const ZONES = [
  { name: 'Baseline Layup (L)', value: 2, angle: -60, r: 0.22 },
  { name: 'Baseline Layup (R)', value: 2, angle: 60, r: 0.22 },
  { name: 'Elbow Jumper (L)', value: 2, angle: -35, r: 0.5 },
  { name: 'Elbow Jumper (R)', value: 2, angle: 35, r: 0.5 },
  { name: 'Corner 3 (L)', value: 3, angle: -80, r: 0.65 },
  { name: 'Corner 3 (R)', value: 3, angle: 80, r: 0.65 },
  { name: 'Wing 3 (L)', value: 3, angle: -45, r: 0.78 },
  { name: 'Wing 3 (R)', value: 3, angle: 45, r: 0.78 },
  { name: 'Top of the Key 3', value: 3, angle: 0, r: 0.88 },
];

// Private bookkeeping — mirrors the wasInFlight transition-tracking pattern
// physics.js uses, just watching for the opposite (true -> false) edge. Named
// distinctly from physics.js's own `wasInFlight`: classic <script> tags share
// one top-level lexical scope, so two same-named top-level `let`s would throw
// a SyntaxError at parse time.
let zoneIndex = 0;
let zoneWasInFlight = false;
let pulse = 0;

function floorTopY(state) {
  return state.hoop.y + state.hoop.width * 0.75;
}

// Shared by zone placement and the drawn arc so both agree on geometry.
function polarOffset(angleDeg, r, state) {
  const { hoop, bounds } = state;
  const courtBottom = bounds.height - 40;
  const effRx = bounds.width * 0.46;
  const effRy = Math.max(0, courtBottom - hoop.y) * 0.95;
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: hoop.x + Math.sin(rad) * r * effRx,
    y: hoop.y + Math.cos(rad) * r * effRy,
  };
}

function zonePosition(zone, state) {
  const { bounds, ball } = state;
  const floorTop = floorTopY(state);
  const courtBottom = bounds.height - 40;
  const raw = polarOffset(zone.angle, zone.r, state);

  const margin = ball.radius + 16;
  const x = Math.min(bounds.width - margin, Math.max(margin, raw.x));
  const y = Math.min(courtBottom, Math.max(floorTop - state.hoop.width * 0.4, raw.y));
  return { x, y };
}

function applyZone(state) {
  const zone = ZONES[zoneIndex];
  const pos = zonePosition(zone, state);
  state.currentZone = { name: zone.name, x: pos.x, y: pos.y };
  state.shotValue = zone.value;
  state.ball.x = pos.x;
  state.ball.y = pos.y;
}

const Zones = {
  reset(state) {
    zoneIndex = 0;
    zoneWasInFlight = false;
    applyZone(state);
  },

  update(state, dt) {
    pulse += dt;

    if (state.ball.inFlight) {
      zoneWasInFlight = true;
      return;
    }
    if (zoneWasInFlight) {
      zoneWasInFlight = false;
      zoneIndex = (zoneIndex + 1) % ZONES.length;
      applyZone(state);
    }
  },

  draw(ctx, canvas, state) {
    const { hoop, bounds } = state;
    const courtBottom = bounds.height - 40;
    const effRx = bounds.width * 0.46;
    const effRy = Math.max(0, courtBottom - hoop.y) * 0.95;

    ctx.save();

    // Three-point arc, plus straight corner lines running to the baseline —
    // same shape a real court diagram uses for the arc + corner-3 sections.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 7]);

    ctx.beginPath();
    const ARC_STEPS = 40;
    for (let i = 0; i <= ARC_STEPS; i++) {
      const angle = -90 + (180 * i) / ARC_STEPS;
      const p = polarOffset(angle, THREE_POINT_R, state);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    const leftCornerX = hoop.x - THREE_POINT_R * effRx;
    const rightCornerX = hoop.x + THREE_POINT_R * effRx;
    ctx.beginPath();
    ctx.moveTo(leftCornerX, hoop.y);
    ctx.lineTo(leftCornerX, courtBottom);
    ctx.moveTo(rightCornerX, hoop.y);
    ctx.lineTo(rightCornerX, courtBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Zone markers — dim dots for the rotation, a highlighted pulsing ring
    // on whichever zone is currently active.
    const activeName = state.currentZone && state.currentZone.name;
    ZONES.forEach((zone) => {
      const pos = zonePosition(zone, state);
      const isActive = zone.name === activeName;
      const radius = isActive ? 9 + Math.sin(pulse * 4) * 2 : 5;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = zone.value === 3 ? 'rgba(255, 205, 60, 0.85)' : 'rgba(90, 200, 255, 0.7)';
      ctx.fill();

      if (isActive) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.stroke();
      }
    });

    if (state.currentZone) {
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillText(
        `${state.currentZone.name} · ${state.shotValue}PT`,
        state.currentZone.x,
        state.currentZone.y - 16
      );
    }

    ctx.restore();
  },
};
