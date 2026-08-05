// Feature: Input Controls (branch: feature/input-controls)
// Owns the press-and-hold-then-release "charge meter" shot mechanic: hold
// to charge, release to shoot. A pointer sweeps back and forth across a
// colored meter; wherever it lands when you release grades the shot into a
// quality tier (perfect/good/fair/poor) that determines how close the
// launch vector comes to a hand-solved perfect arc into the hoop. The
// exported shape is unchanged — onLaunch(vx, vy) still fires exactly once
// per shot, on release — so game.js/physics.js don't need to know the
// mechanic changed.

const Input = {
  attach(canvas, state, { onLaunch }) {
    state.charging = false;

    // Must match GRAVITY in js/physics.js — this is what lets us solve the
    // exact arc that threads the hoop for a 'perfect' release.
    const GRAVITY = 900;
    // Candidate arc heights (px the ball clears above the hoop at its
    // peak), largest/nicest-looking first. physics.js only registers a
    // make while descending through the rim plane, so the ball must rise
    // above hoop.y and come back down — a bigger clearance widens the time
    // gap between that rising and falling crossing, letting the ball's x
    // drift toward a rim post the further the hoop sits from center. So
    // solvePerfectArc tries these tallest-first and falls back to a
    // flatter arc only when a taller one can't clear iron.
    const ARC_CLEARANCE_CANDIDATES = [20, 12, 7, 4, 2, 1, 0.5, 0.2];
    // Rim-post geometry mirrored from js/physics.js's collision model — just
    // enough to verify a candidate arc clears iron before launch, not a full
    // reimplementation of the bounce/backboard response.
    const RIM_POST_RADIUS = 7;
    const RIM_THICKNESS = 8;

    const METER_PERIOD_MS = 1000; // one full left -> right -> left sweep

    // Zone half-widths around the meter's center (0.5 = dead center, the
    // best timing); narrowest wins. Together these taper green -> red.
    const ZONES = [
      { quality: 'perfect', halfWidth: 0.04, color: '#4cd964' },
      { quality: 'good', halfWidth: 0.16, color: '#ffd700' },
      { quality: 'fair', halfWidth: 0.32, color: '#ff9500' },
      { quality: 'poor', halfWidth: 0.5, color: '#ff3b30' },
    ];
    // How far a tier's release vector is allowed to drift off the perfect
    // arc, as a fraction of the max jitter constants below. 0 = no drift.
    const ERROR_FRACTION = { perfect: 0, good: 0.22, fair: 0.38, poor: 1 };
    const MAX_ANGLE_JITTER = 0.09; // radians (~5°) at full error fraction
    const MAX_SPEED_JITTER = 0.14; // fraction of speed, at full error fraction

    let chargeStart = null;
    let rafId = null;

    const meter = buildMeterUI();

    function triangleWave(elapsedMs) {
      const t = (elapsedMs % METER_PERIOD_MS) / METER_PERIOD_MS;
      return t < 0.5 ? t * 2 : 2 - t * 2;
    }

    function zoneForPosition(position) {
      const dist = Math.abs(position - 0.5);
      for (const zone of ZONES) {
        if (dist <= zone.halfWidth) return zone;
      }
      return ZONES[ZONES.length - 1];
    }

    // Dry-run a candidate launch through the same gravity/wind integration
    // *and* the same adaptive substep chunking physics.js uses (per-frame,
    // substep count derived from current speed) — matching its exact
    // discretization, not just the physical rules, is what makes this
    // check trustworthy at the tight margins a rim post leaves. Confirms
    // the ball never comes within a rim post's collision radius before
    // crossing the rim plane center-gap while descending (physics.js only
    // ever registers a make on that descending crossing, so the ball is
    // guaranteed to rise above hoop.y first). Returns the landing x if the
    // arc cleanly crosses within the gap, else null.
    function simulateLanding(vx, vy) {
      const { ball, hoop } = state;
      const wind = state.wind || 0;
      const leftPostX = hoop.x - hoop.width / 2;
      const rightPostX = hoop.x + hoop.width / 2;
      // Small margin on top of the real collision radius, to absorb any
      // residual mismatch from this being a dry run rather than the real
      // frame-by-frame timing.
      const clearDist = ball.radius + RIM_POST_RADIUS + 4;
      const rimPlaneY = hoop.y + RIM_THICKNESS / 2;
      const frameDt = 1 / 60;
      const MAX_SUBSTEP_DISTANCE = 6;
      const MAX_SUBSTEPS = 16;
      let bx = ball.x;
      let by = ball.y;
      let bvx = vx;
      let bvy = vy;
      for (let frame = 0; frame < 200; frame++) {
        const speed = Math.hypot(bvx, bvy);
        const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil((speed * frameDt) / MAX_SUBSTEP_DISTANCE)));
        const subDt = frameDt / substeps;
        for (let i = 0; i < substeps; i++) {
          const prevY = by;
          bvy += GRAVITY * subDt;
          bvx += wind * subDt;
          bx += bvx * subDt;
          by += bvy * subDt;
          if (Math.hypot(bx - leftPostX, by - hoop.y) < clearDist) return null;
          if (Math.hypot(bx - rightPostX, by - hoop.y) < clearDist) return null;
          if (prevY <= rimPlaneY && by > rimPlaneY && bvy > 0) {
            return bx > leftPostX && bx < rightPostX ? bx : null;
          }
          if (by - ball.radius > state.bounds.height) return null;
        }
      }
      return null;
    }

    // Exact projectile solve: given the ball's current spot and the hoop's
    // current spot, pick a launch vector that clears the hoop at its peak
    // and lands dead center, compensating for the current ambient wind so
    // the arc actually holds that line. Under a big hoop offset and/or
    // strong wind, full compensation can demand enough of a horizontal
    // swing that the ball's mandatory rise above the rim drifts into a
    // post — so for each candidate arc height (tallest/nicest first),
    // sweep a band of nearby launch speeds and keep whichever verifiably
    // clears iron and lands closest to dead center; fall back to a flatter
    // arc (smaller time gap between the rise and fall, so less drift) only
    // if nothing at the current height clears.
    function solvePerfectArc() {
      const { ball, hoop } = state;
      const wind = state.wind || 0;

      for (const arcClearance of ARC_CLEARANCE_CANDIDATES) {
        const rise = Math.max(1, ball.y - hoop.y) + arcClearance;
        const vy = -Math.sqrt(2 * GRAVITY * rise);
        const clearanceTerm = Math.sqrt(2 * GRAVITY * arcClearance);
        const t = (-vy + clearanceTerm) / GRAVITY;
        const compensatedVx = (hoop.x - ball.x - 0.5 * wind * t * t) / t;

        const SEARCH_RADIUS = 300;
        const STEP = 5;
        let best = null;
        let bestMiss = Infinity;
        for (let dv = -SEARCH_RADIUS; dv <= SEARCH_RADIUS; dv += STEP) {
          const vx = compensatedVx + dv;
          const landingX = simulateLanding(vx, vy);
          if (landingX === null) continue;
          const miss = Math.abs(landingX - hoop.x);
          if (miss < bestMiss) {
            bestMiss = miss;
            best = vx;
          }
        }
        if (best !== null) return { vx: best, vy };
      }

      // Every candidate arc failed to clear iron. This only happens when
      // the hoop is near the edge of its patrol range *and* wind is strong
      // enough, in the direction that demands a wide compensating swing,
      // that no straight-line arc can pass through the ~36px-wide safe gap
      // between the rim posts without also grazing one at some point along
      // its curve (verified empirically: |hoop offset| under ~60px reliably
      // clears regardless of wind; failures cluster only at the extremes of
      // both at once). Rather than leave the ball stuck mid-charge, fall
      // back to the flattest arc's direct aim — an honest best effort, not
      // a verified swish, for a case the current rim-collision model can't
      // actually satisfy.
      const arcClearance = ARC_CLEARANCE_CANDIDATES[ARC_CLEARANCE_CANDIDATES.length - 1];
      const rise = Math.max(1, ball.y - hoop.y) + arcClearance;
      const vy = -Math.sqrt(2 * GRAVITY * rise);
      const t = (-vy + Math.sqrt(2 * GRAVITY * arcClearance)) / GRAVITY;
      return { vx: (hoop.x - ball.x - 0.5 * wind * t * t) / t, vy };
    }

    function applyError(vx, vy, errorFraction) {
      if (errorFraction <= 0) return { vx, vy };
      const speed = Math.hypot(vx, vy);
      const angle = Math.atan2(vy, vx) + (Math.random() * 2 - 1) * errorFraction * MAX_ANGLE_JITTER;
      const jitteredSpeed = speed * (1 + (Math.random() * 2 - 1) * errorFraction * MAX_SPEED_JITTER);
      return { vx: Math.cos(angle) * jitteredSpeed, vy: Math.sin(angle) * jitteredSpeed };
    }

    function updateMeter() {
      const position = triangleWave(performance.now() - chargeStart);
      const zone = zoneForPosition(position);
      meter.pointer.style.left = `${position * 100}%`;
      meter.label.textContent = zone.quality.toUpperCase();
      meter.label.style.color = zone.color;
      rafId = requestAnimationFrame(updateMeter);
    }

    function startCharging(e) {
      if (state.ball.inFlight || chargeStart !== null) return;
      chargeStart = performance.now();
      state.charging = true;
      meter.root.classList.add('show');
      updateMeter();
    }

    function stopMeterVisuals() {
      meter.root.classList.remove('show');
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    }

    function release(e) {
      if (chargeStart === null) return;
      const elapsed = performance.now() - chargeStart;
      chargeStart = null;
      state.charging = false;
      stopMeterVisuals();

      const zone = zoneForPosition(triangleWave(elapsed));
      state.shotQuality = zone.quality;

      const perfect = solvePerfectArc();
      const { vx, vy } = applyError(perfect.vx, perfect.vy, ERROR_FRACTION[zone.quality]);
      onLaunch(vx, vy);
    }

    function cancelCharging() {
      if (chargeStart === null) return;
      chargeStart = null;
      state.charging = false;
      stopMeterVisuals();
    }

    canvas.addEventListener('mousedown', startCharging);
    // A quick release routinely lands the cursor outside the canvas, so
    // track mouseup on the window rather than the canvas.
    window.addEventListener('mouseup', release);
    canvas.addEventListener('touchstart', startCharging, { passive: true });
    canvas.addEventListener('touchend', release);
    canvas.addEventListener('touchcancel', cancelCharging);

    function buildMeterUI() {
      if (!document.getElementById('charge-meter-style')) {
        const style = document.createElement('style');
        style.id = 'charge-meter-style';
        style.textContent = `
          #charge-meter {
            position: absolute; left: 50%; bottom: 110px; transform: translateX(-50%);
            width: 200px; z-index: 8; opacity: 0; pointer-events: none;
            transition: opacity 0.12s ease-out; text-align: center;
          }
          #charge-meter.show { opacity: 1; }
          #charge-meter-track {
            position: relative; height: 14px; border-radius: 7px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
            background: linear-gradient(to right,
              #ff3b30 0%, #ff3b30 18%,
              #ff9500 18%, #ff9500 34%,
              #ffd700 34%, #ffd700 46%,
              #4cd964 46%, #4cd964 54%,
              #ffd700 54%, #ffd700 66%,
              #ff9500 66%, #ff9500 82%,
              #ff3b30 82%, #ff3b30 100%);
          }
          #charge-meter-pointer {
            position: absolute; top: -4px; width: 4px; height: 22px;
            background: #fff; border-radius: 2px; transform: translateX(-50%);
            box-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
          }
          #charge-meter-label {
            margin-top: 6px; font-weight: 800; font-size: 0.85rem;
            text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
          }
        `;
        document.head.appendChild(style);
      }

      const container = document.getElementById('game-container') || document.body;

      const root = document.createElement('div');
      root.id = 'charge-meter';

      const track = document.createElement('div');
      track.id = 'charge-meter-track';

      const pointer = document.createElement('div');
      pointer.id = 'charge-meter-pointer';
      track.appendChild(pointer);

      const label = document.createElement('div');
      label.id = 'charge-meter-label';

      root.appendChild(track);
      root.appendChild(label);
      container.appendChild(root);

      return { root, pointer, label };
    }
  },
};
