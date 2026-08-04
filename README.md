# Basketball Arcade Game

A 60-second arcade shooting game: flick or drag to launch a basketball at a
hoop. Score points for makes and bonus points for swishes, while a moving
hoop and wind variance ramp up the difficulty as the clock runs down.

## Running it

No build step — plain HTML/CSS/JS. Either open `index.html` directly in a
browser, or serve it locally:

```bash
npx serve .
# or
python3 -m http.server
```

## Architecture

`js/game.js` is the only shared file: it owns the game loop, the shared
`state` object, and the canvas/DOM bootstrap, and calls out to each feature
module through a small, stable interface. Every other module is a self
contained placeholder that a single feature branch fleshes out, which keeps
the five workstreams below conflict-free.

| Module | Interface | Owner |
|---|---|---|
| `js/render.js` | `Render.draw(ctx, canvas, state)` | rendering-core |
| `js/input.js` | `Input.attach(canvas, state, { onLaunch })` | input-controls |
| `js/physics.js` | `Physics.update(state, dt)` | physics-collision |
| `js/scoring.js`, `js/ui.js` | `Scoring.onShotResult(state, result)`, `UI.*` | scoring-ui |
| `js/difficulty.js` | `Difficulty.reset(state)`, `Difficulty.update(state, dt)` | difficulty-progression |

## Parallel feature branches

This skeleton is split into 5 features, each developed in its own git
worktree/branch off `main`:

1. **`feature/rendering-core`** — canvas rendering: court, hoop, ball,
   animations/visual polish (replace the placeholder shapes in `render.js`).
2. **`feature/input-controls`** — flick/drag gesture detection and
   translating gesture into an accurate launch velocity (`input.js`).
3. **`feature/physics-collision`** — gravity/trajectory, rim & backboard
   collision, and swish-vs-rim-in detection (`physics.js`).
4. **`feature/scoring-ui`** — score tallying, the 60s countdown, swish
   bonus points, and start/game-over screens (`scoring.js`, `ui.js`).
5. **`feature/difficulty-progression`** — moving hoop and wind variance
   that ramp up as `state.timeRemaining` decreases (`difficulty.js`).

Worktrees for these branches live under the gitignored `.worktrees/`
directory at the project root, e.g. `.worktrees/rendering-core` checked out
on `feature/rendering-core`.
