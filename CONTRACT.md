# Project Contract

This is the single reference for how the 5 feature branches fit together.
Each branch owns its own file(s) and is free to rewrite its internals
however it wants — but everyone must keep the shapes described here stable,
since that's what lets 5 branches developed in isolation merge back into
`main` without needing to renegotiate how they talk to each other.

If a change here is genuinely necessary (e.g. a new `state` field, a changed
function signature), update this file in the same commit and call it out
loudly in the PR description — every other branch is relying on what's
written here being accurate.

## Architecture

`js/game.js` is the only orchestrator. It owns the canvas/DOM bootstrap,
the single `state` object, and the frame loop. It calls out to each
feature module by name, guarded with `typeof X !== 'undefined'`, which is
why the game already runs (with placeholder behavior) even before every
module is filled in. No feature branch should modify `game.js` — if the
loop itself needs to change, that's a cross-cutting decision, not a single
feature's call.

Every module below is a plain global object (`Render`, `Input`, `Physics`,
`Scoring`, `UI`, `Difficulty`) — there's no bundler or module system, so
these are just `const X = {...}` declarations loaded via `<script>` tags in
`index.html`. They're visible to each other and to `game.js` regardless of
script order, since all calls happen at runtime (inside event handlers /
the loop), well after every script has parsed.

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
| `ball` | `{ x, y, vx, vy, radius, inFlight }` | `physics.js` moves it; `game.js`'s `resetBall()`/`launchBall()` reset/set it | `render.js` reads it to draw; `input.js` reads `inFlight` to ignore input mid-flight |
| `hoop` | `{ x, y, width }` | `difficulty.js` moves `x`; `game.js`'s `resetHoop()` sets initial position | `render.js` and `physics.js` read it |
| `wind` | `number` (horizontal accel) | `difficulty.js` | `physics.js` reads it |
| `hoopDirection`, `hoopSpeed` | `number` | `difficulty.js` (added to `state` in `Difficulty.reset`) | internal to difficulty.js; nobody else should need these |
| `lastTimestamp` | `number` (ms) | `game.js` | not used elsewhere |

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
Called once at startup. Wires up drag/flick gesture listeners on `canvas`
and calls `onLaunch(vx, vy)` when a gesture completes. Should check
`state.ball.inFlight` and ignore new gestures while a shot is in the air.

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
`swish: true` should only ever be reported alongside `made: true`.

### `Scoring` (`js/scoring.js`)
```
Scoring.onShotResult(state, { made, swish })
```
The single place point values are decided (currently: 2 for a make, 3 for
a swish). Also responsible for calling `resetBall()` after a shot resolves
and notifying the UI via `UI.flashResult(made, swish)`.

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

## Call order (per frame, from `game.js`'s `loop()`)

```
Difficulty.update → Physics.update → Render.draw → UI.update
```

Difficulty runs first so physics reacts to this frame's wind/hoop position;
render runs after physics so it draws the post-update state; UI runs last
since it only reflects state, never changes it.

## Merging back to `main`

Each branch touches a disjoint set of files (see the ownership table in
`README.md`), so merges back into `main` should be conflict-free as long
as nobody edits `game.js` or another branch's files. Merge in any order;
if two branches both need to change something in this contract (e.g. add
a new `state` field), whoever merges second should resolve it here rather
than silently diverging.
