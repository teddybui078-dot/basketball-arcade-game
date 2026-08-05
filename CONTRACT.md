# Project Contract

This is the single reference for how the feature branches fit together.
Each branch owns its own file(s) and is free to rewrite its internals
however it wants — but everyone must keep the shapes described here stable,
since that's what lets branches developed in isolation merge back into
`main` without needing to renegotiate how they talk to each other.

**Round 2 additions** (`zones.js`, `player.js`, and the hold-to-release
rework of `input.js`) are noted inline below and gathered in "Round 2
cross-cutting touches" at the end — unlike round 1, these aren't perfectly
file-disjoint, and that section explains why and what to expect.

If a change here is genuinely necessary (e.g. a new `state` field, a changed
function signature), update this file in the same commit and call it out
loudly in the PR description — every other branch is relying on what's
written here being accurate.

## Architecture

`js/game.js` is the only orchestrator. It owns the canvas/DOM bootstrap,
the single `state` object, and the frame loop. It calls out to each
feature module by name, guarded with `typeof X !== 'undefined'`, which is
why the game already runs (with placeholder behavior) even before every
module is filled in. Ordinarily no feature branch modifies `game.js` — the
one sanctioned exception is adding a brand-new module's hook call (see
"Round 2 cross-cutting touches"), which is a one-line, additive change,
not a rewrite of existing loop logic.

Every module below is a plain global object (`Render`, `Input`, `Physics`,
`Scoring`, `UI`, `Difficulty`, and now `Zones`, `Player`) — there's no
bundler or module system, so these are just `const X = {...}` declarations
loaded via `<script>` tags in `index.html`. They're visible to each other
and to `game.js` regardless of script order, since all calls happen at
runtime (inside event handlers / the loop), well after every script has
parsed.

## The `state` object

Defined once in `js/game.js`, mutated by whichever module is responsible
for a given field. Nobody should read/write a field they don't own without
going through the owning module's function.

| Field | Shape | Owner (writes) | Everyone else |
|---|---|---|---|
| `running` | `boolean` | `game.js` | read-only |
| `timeRemaining` | `number` (seconds) | `game.js` | read-only — this is what `difficulty.js` should ramp against |
| `score` | `number` | `scoring.js` | read-only |
| `bounds` | `{ width, height }` | `game.js` (on resize) | read-only — use this for boundary checks, not `canvas.width/height` directly |
| `ball` | `{ x, y, vx, vy, radius, inFlight }` | `physics.js` moves it; `game.js`'s `resetBall()`/`launchBall()` reset/set it; `zones.js` repositions `x`/`y` (only) right after a reset, to move the ball to the current zone's spot | `render.js` reads it to draw; `input.js` reads `inFlight` to ignore input mid-flight; `player.js` reads `x`/`y` to place the character |
| `hoop` | `{ x, y, width }` | `difficulty.js` moves `x`; `game.js`'s `resetHoop()` sets initial position | `render.js` and `physics.js` read it |
| `wind` | `number` (horizontal accel) | `difficulty.js` | `physics.js` reads it |
| `hoopDirection`, `hoopSpeed` | `number` | `difficulty.js` (added to `state` in `Difficulty.reset`) | internal to difficulty.js; nobody else should need these |
| `lastTimestamp` | `number` (ms) | `game.js` | not used elsewhere |
| `charging` | `boolean` | `input.js` — **new**, part of the hold-to-release rework | `player.js` reads it to drive a wind-up/charging animation |
| `shotQuality` | `string`, one of `'perfect' \| 'good' \| 'fair' \| 'poor'` (or your own graduated scale — document whatever you land on here) | `input.js` — set once per release | informational only; the actual accuracy is expressed through the `vx`/`vy` passed to `onLaunch`, this field is for animation/feedback flavor |
| `currentZone` | `{ name: string, x, y }` — `x`/`y` is where the ball (and player) should be positioned for this zone | `zones.js` — **new** | `player.js` reads `x`/`y`; `render.js`/`zones.js` may use `name` for a label |
| `shotValue` | `number` (`2` or `3`) | `zones.js` — **new** | `scoring.js` uses this as the shot's base point value, in place of the current hardcoded `swish ? 3 : 2` |

## Shared helpers (defined in `game.js`, callable by any module)

- `resetBall()` — recenters the ball at the free-throw line, zeroes velocity, clears `inFlight`. Call this after a shot resolves (make or miss).
- `resetHoop()` — recenters the hoop at its default position.
- `launchBall(vx, vy)` — sets ball velocity and `inFlight = true`. This is also passed to `Input.attach` as `onLaunch`.

## Module interfaces

### `Render` (`js/render.js`)
```
Render.draw(ctx, canvas, state)
```
Called once per frame, after physics/difficulty have updated `state`.
**Read-only** — must never mutate `state`. Purely draws court, hoop, ball.

### `Input` (`js/input.js`)
```
Input.attach(canvas, state, { onLaunch })
```
Called once at startup. **Being reworked** from drag/flick to a
press-and-hold-then-release mechanic: hold to charge, release to shoot,
where release timing lands in a graded zone (e.g. green = perfect swish,
yellow = high chance, tapering down from there). The call signature is
unchanged — still calls `onLaunch(vx, vy)` once, on release — so nothing
downstream (`game.js`, `physics.js`) needs to know the mechanic changed.
Owns its own charge-meter visuals (build it at runtime and append into
`#game-container`, the same pattern `ui.js`'s feedback layer already uses,
so this stays confined to `input.js` and doesn't need markup added to
`index.html`). Should check `state.ball.inFlight` and ignore new gestures
while a shot is in the air, and should set `state.charging` / write
`state.shotQuality` as described in the state table above.

### `Physics` (`js/physics.js`)
```
Physics.update(state, dt)
```
Called once per frame while `state.ball.inFlight` is true. Integrates
gravity/wind into ball position, detects rim/backboard collision and
out-of-bounds, and reports the outcome via:
```
Scoring.onShotResult(state, { made: boolean, swish: boolean })
```
`swish: true` should only ever be reported alongside `made: true`, and
**only** when the ball genuinely never touched iron this shot — there's a
known bug where a wild post-bounce trajectory can still resolve as a
swish; see the fix prompt for this branch. Also in scope for this round:
tightening how long a miss takes to resolve (a ball that's clearly missed
shouldn't have to travel all the way off-canvas before `onShotResult`
fires) and generally smoother position integration.

### `Scoring` (`js/scoring.js`)
```
Scoring.onShotResult(state, { made, swish })
```
The single place point values are decided. **Changing this round:** the
base point value was a hardcoded `swish ? 3 : 2`; it becomes `made ?
state.shotValue : 0` (falling back to `2` if `state.shotValue` is unset,
so this still works standalone before `zones.js` exists), with the swish
bonus and streak/combo bonus layered on top exactly as before. This edit
is made by the `court-zones` branch, not `scoring-ui` — flagged per the
merge rule below since it's a small, additive change to a file
`court-zones` doesn't otherwise own. Also still responsible for calling
`resetBall()` after a shot resolves and notifying the UI via
`UI.flashResult(made, swish)`.

### `UI` (`js/ui.js`)
```
UI.attachStartButton(onStart)   // wires #start-button / #restart-button, calls onStart()
UI.showHUD(state)               // called once when a round starts
UI.update(state)                // called every frame — refresh score/timer text
UI.showGameOver(state)          // called once when the round ends
UI.flashResult(made, swish)     // called by Scoring after each shot
```
Owns all DOM elements defined in `index.html` (`#hud`, `#start-screen`,
`#game-over-screen`, etc.) — canvas drawing is `render.js`'s job, not this
module's.

### `Difficulty` (`js/difficulty.js`)
```
Difficulty.reset(state)   // called once when a round starts
Difficulty.update(state, dt)  // called once per frame
```
Owns `state.wind` and horizontal movement of `state.hoop.x`, driven off
`state.timeRemaining` (lower time remaining → harder). Should not touch
`state.ball` or `state.score`.

### `Zones` (`js/zones.js`) — new this round

```
Zones.reset(state)          // called once when a round starts
Zones.update(state, dt)     // called once per frame
Zones.draw(ctx, canvas, state)  // called once per frame, after Render.draw
```
Owns court zones (3-point line, mid-range, paint/layup-dunk area) and
rotation between them, following real basketball shot values — beyond the
arc is a 3, everything inside (mid-range jumper, layup, dunk) is a 2.
`Zones.update` should watch for `state.ball.inFlight` transitioning from
`true` to `false` (the same self-tracked-transition pattern `physics.js`
already uses for `wasInFlight`) — that's the signal a shot just resolved
and `resetBall()` already ran, so it's safe to advance to the next zone in
the rotation and reposition the ball there. `Zones.draw` renders the
3-point arc and any zone markers/labels directly (it does not touch
`render.js` — think of it as a second, independent drawing pass over the
same canvas, the same way `ui.js` builds its own DOM layer instead of
editing `index.html`).

### `Player` (`js/player.js`) — new this round

```
Player.reset(state)             // called once when a round starts
Player.update(state, dt)        // called once per frame
Player.draw(ctx, canvas, state) // called once per frame
```
Owns a rough pixel-art character performing the throw — idle stance while
waiting, a charging/wind-up pose while `state.charging` is true, a release
motion synced to the ball leaving on `onLaunch`, follow-through after.
Positions itself from `state.currentZone.x/y` (falls back to
`state.ball.x/y` if `zones.js` isn't present yet, keeping this module
independently useful). Read-only over everything except its own internal
animation-state bookkeeping.

## Call order (per frame, from `game.js`'s `loop()`)

```
Difficulty.update → Physics.update → Zones.update → Render.draw → Zones.draw → Player.draw → UI.update
```

Difficulty runs first so physics reacts to this frame's wind/hoop position.
Physics runs before Zones so that if this frame's shot just resolved,
`resetBall()` has already fired before Zones repositions the ball for the
next attempt. Render draws the court/hoop/ball first; Zones' arc/markers
and Player's character layer on top of that; UI runs last since it only
reflects state, never changes it.

Startup order (in `startGame()`): `resetHoop()` → `resetBall()` →
`Difficulty.reset` → `Zones.reset` (repositions the ball to the first
zone, overriding `resetBall()`'s generic center position) → `Player.reset`
→ `UI.showHUD`.

## Round 2 cross-cutting touches

Round 1 was perfectly file-disjoint. Round 2 isn't, by necessity — two
brand-new modules both need a hook into the loop, and one needs a small
edit to another branch's file. This is expected, not a sign anyone's
doing it wrong:

- **`game.js` gets new hook lines**, added by both `court-zones` (`Zones.reset`/`update`/`draw`) and `player-character` (`Player.reset`/`update`/`draw`). Each addition should be a single guarded line (`if (typeof X !== 'undefined') X.update(state, dt);`), never a change to existing lines. Whichever of the two merges second will likely hit a trivial conflict on adjacent lines in `game.js` — that's just two additive edits landing near each other, resolve by keeping both lines.
- **`scoring.js` gets a one-line edit** from `court-zones` (the `shotValue` change described above) — call this out clearly in that branch's PR description since `scoring-ui` owns this file otherwise.

## Merging back to `main`

Each branch touches a disjoint set of files (see the ownership table in
`README.md`), so merges back into `main` should be conflict-free as long
as nobody edits `game.js` or another branch's files — with the round-2
exceptions called out immediately above. Merge in any order; if two
branches both need to change something in this contract (e.g. add a new
`state` field), whoever merges second should resolve it here rather than
silently diverging.
