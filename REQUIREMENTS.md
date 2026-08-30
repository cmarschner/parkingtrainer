# Parking Practice — Requirements & Design Reference

Reference doc for future sessions. Captures decisions made across the project's
history that aren't otherwise obvious from reading the code cold. Keep this in
sync when behavior changes — a stale doc is worse than no doc.

## What this is

A static top-down car-parking learning simulator. Plain HTML/CSS/JS, **no build
step, no external dependencies**. Classic `<script src>` tags only — no ES
modules, because `import`/`export` is blocked by CORS when the page is opened
via `file://`, and "open `index.html` by double-click, no server" is a hard
requirement.

## File layout & load order

```
index.html          canvas + DOM menu/HUD/touch-control overlay
style.css            layout, menu, HUD, touch-widget visuals, responsive rules
package.json          just `npm test` → tests/sim.test.js (no dependencies)
tests/sim.test.js    headless Node regression suite (physics/collision/levels/tirepaths)
js/
  constants.js       every tunable number, named + grouped (see below)
  levels.js           buildPerpendicularLot()/buildParallelLot() + declarative LEVELS table
  physics.js           bicycle-model state/update + wheel geometry
  collision.js         SAT oriented-rect collision (one function: cars, walls, everything)
  tirepaths.js          4 wheel + rear-axle-midpoint extrapolation paths
  render.js             canvas drawing; also owns the camera (top-down vs driver view)
  confetti.js            screen-space particle system, shown on park success
  input.js                keyboard state; merges in touch state from touchcontrols.js
  touchcontrols.js         steering-wheel + pedal widgets (Pointer Events)
  menu.js                   level-select screen + localStorage progress
  game.js                    state machine + rAF loop, wires everything together
pics/*.png                    celebration photos (list lives in render.js)
```

Script tags in `index.html` must stay in this dependency order (each file
attaches to the shared `window.Sim` namespace; later files call earlier ones).

## Car & physics

Kinematic bicycle model, **rear-axle center as the reference point** (`state.x,
state.y, state.theta` in `physics.js` — this point's velocity is always along
the heading, which is what makes the equations simple). `state.delta` is the
front-wheel steering angle.

```
x     += v * cos(theta) * dt
y     += v * sin(theta) * dt
theta += (v * tan(delta) / L) * dt        // L = wheelbase
```

Steering has two distinct input modes, both handled in `stepSteering`:
**keyboard** ramps toward ±MAX_STEER at STEER_RATE while a key is held and
**holds** its angle when released (like a real wheel you turn incrementally
and let go of). **Touch** (the steering wheel widget) is analog and bypasses
the ramp entirely: `keys.steerRatio` (-1..1, set by
`Sim.Input.setSteerRatio`) maps straight to `delta = steerRatio * MAX_STEER`
every frame, instantly — turning the wheel widget directly turns the wheels,
matching drag position 1:1. Releasing the widget snaps `steerRatio` to `0`
(not `null`), which centers the actual steering too — this intentionally
differs from keyboard's hold-angle behavior, matching the widget's own
visual spring-back to center. `steerRatio` stays `null` until the wheel is
first touched, which is what lets keyboard's ramp logic apply on desktop
(`stepSteering` only takes the analog path when `steerRatio` isn't
null/undefined). Reverse is allowed in **every**
level (there used to be a per-level `allowReverse` flag limiting it to parallel
levels only — removed when the requirement changed to "reverse everywhere";
don't reintroduce it without checking `tests/sim.test.js`'s reverse-works-in-every-level assertion).

All constants live in `constants.js`, grouped and commented with rationale
(target speed profile is a slow "parking-lot creep", not arcade speed; car
dimensions are the given 4.70m × 1.85m; wheelbase/overhangs/track width are
derived to plausible values for a car that size). Don't hardcode a tunable
number anywhere else — add it there.

## Lot geometry & collision

Two declarative lot builders in `levels.js`: `buildPerpendicularLot` and
`buildParallelLot`. Everything collidable (player car, parked obstacle cars,
boundary walls) is normalized to `{cx, cy, angle, length, width}` and tested
with one SAT (separating axis theorem) function in `collision.js` — no
special-casing between car-vs-car and car-vs-wall.

Side walls only guard the **stall/bay depth**, not the through-lane above it —
the lane stays open on both ends so the car can approach from either side.
(Earlier bug: walls spanning the full lane depth trapped the lane and made
level 1's own start pose collide before the player touched a key. If you touch
wall geometry, run `tests/sim.test.js` — it asserts every level's start pose is
collision-free.)

## Levels

8 levels, declared as one table in `levels.js`. **Design rule: every new
scenario (a new lot kind, or a new difficulty within a kind) is introduced
twice in a row — once with tire-path extrapolation guide lines, then
immediately again without them.** `tests/sim.test.js` asserts this pairing
holds; if you add a 9th level, add its "no guides" partner right after it (or
update the test if the pairing rule itself changes).

| id | title | kind | occupied neighbors | guide lines |
|----|-------|------|---------------------|-------------|
| 1 | Perpendicular parking | perp | none | yes |
| 2 | Perpendicular parking, no guides | perp | none | no |
| 3 | Perpendicular, tight squeeze | perp | both sides | yes |
| 4 | Perpendicular, tight squeeze, no guides | perp | both sides | no |
| 5 | Parallel parking | parallel | none | yes |
| 6 | Parallel parking, no guides | parallel | none | no |
| 7 | Parallel, tight squeeze | parallel | front + rear | yes |
| 8 | Parallel, tight squeeze, no guides | parallel | front + rear | no |

Progress: `localStorage["fahrsim_progress"] = {version, completed: [bool×N]}`.
Level `i` (0-indexed) is unlocked iff `i===0 || completed[i-1]` — derived
purely from `completed`, no separate "highest unlocked" field to desync. A
saved-progress array whose length doesn't match the current level count is
treated as absent (safe reset to "only level 1 unlocked"), not a crash — this
is why adding/removing levels silently resets everyone's progress, which is
expected, not a bug to fix.

## Success / collision rules

- Position tolerance: **0.35 m** (car center vs target space center).
- Heading tolerance: **8°**.
- "Stopped": `|v| ≤ 0.05 m/s`.
- A collision is a **hard stop + fail** (`COLLIDED_FAIL` state) — velocity
  zeroed, further input ignored until reset. Not a soft bump, not silent.
- Parking only counts on an explicit confirm (Enter key, or the on-screen
  "Park" button) while stopped **and** aligned — never auto-completes just by
  being in tolerance.
- `R` key / on-screen "Reset" button retries from the level's start pose at
  any time.
- Both outcomes (collision, success) open `#outcome-modal` (see `game.js`'s
  `showOutcomeModal(kind)`), a DOM dialog, not canvas-drawn text — it must work
  identically on desktop and mobile without platform-specific wording (no
  "press R"/"press Enter" — phones have neither key). Collision: message +
  "Retry" (calls `resetLevel()`) + "Back to Menu". Success: message + "Next
  Level →" (`loadLevel(currentLevel.id + 1)`, only shown when
  `currentLevel.id < Sim.Levels.LEVELS.length`) + "Replay" + "Back to Menu".
  `loadLevel()` always calls `hideOutcomeModal()` first, so every path back
  into `DRIVING` closes it. `#outcome-modal` is `position: fixed`, which is
  what lets one implementation center correctly over both the mobile
  fullscreen layout and the desktop card layout with no separate CSS.

## Views: top-down vs driver (ego)

Two camera modes in `render.js`, both going through **one** transform
(`camera = {x, y, rotation}` anchor+rotation about which the world is drawn):
- **Top-down**: `rotation: 0`, anchored on the lot's fixed `viewCenter`.
- **Driver**: anchored on the car's geometric center, `rotation: 90° - heading`
  — so the car's current heading always points up on screen and the
  environment rotates/translates around a screen-fixed car.

**Default is `driver`** (changed from `topdown` after initial launch). Toggle
via `V` key or the toolbar button; persists across level loads within a
session (not saved to localStorage).

## Tire-path extrapolation

Shown only when the current level's `showExtrapolation` is true. Predicts each
of the 4 wheel contact points **plus the rear-axle midpoint** (5 paths total)
over `T_PREVIEW = 3.0s` if current speed/steering are held constant — straight
segments when `|delta|` is near zero, otherwise arcs about the instantaneous
center of rotation (shared by all 5 points, since it's one rigid body). The
rear-axle path is drawn in red to match the rear-axle dot; the 4 wheel paths
stay yellow. **Drawn on top of the car**, not underneath (was underneath
originally; moved per explicit request).

## Celebration on success

Confetti (screen-space particle system, `confetti.js`, canvas-drawn since it's
animated) + a random photo from `pics/` and a "Well done!" speech bubble
(`#outcome-bubble` — a plain rounded box with a CSS `::after` triangle
pointer, not a canvas path) shown inside the outcome modal itself
(`<img id="outcome-photo">`, set via `Sim.Render.getCelebrationPhotoSrc(index)`
in `showOutcomeModal('success')`) — **not** drawn on the canvas. Both used to
be canvas-drawn in a fixed corner (`drawCelebration()`/`drawSpeechBubble()`),
but that overlay competed for screen space with the separate DOM modal
overlay and lost on small screens (the modal's panel is tall enough on
mobile to cover a fixed-position canvas photo). Moving the photo into the
modal panel itself removes that conflict by construction — there's no fixed
pixel position to defend, it just flows in the panel like any other DOM
content. The photo pool is `CELEBRATION_PHOTO_SOURCES` in `render.js` —
**update this array (with the `pics/` prefix) whenever photos are added or
reorganized**; `Sim.Render.getCelebrationPhotoCount()` is the single source
of truth `game.js` reads from to pick a random index, so nothing else needs
to know the count. `render.js` still preloads every photo into an `Image()`
at load time purely to warm the browser cache, so the modal's `<img>`
displays instantly instead of flashing empty on first show.

## Controls

**Keyboard**: Arrow keys (steer/accelerate/brake, hold-to-ramp steering,
Down-past-standstill reverses), `Enter` (confirm park), `R` (reset), `V`
(toggle view).

**Touch** (phones/tablets — shown via `@media (pointer: coarse)`, so a
mouse-driven desktop never sees them): a steering wheel widget (left,
horizontal drag, **analog** — see the steering section above) and a
forward/backward pedal (right, vertical drag, digital up/down) via Pointer
Events with independent pointer capture so both can be dragged simultaneously
with two thumbs. Touch and keyboard key-state (`up`/`down`/`left`/`right`) are
OR'd together in `input.js` (`Sim.Input.setTouchKey`) — releasing one can
never clobber the other; `steerRatio` is separate from that OR'd set (see
above). "Park"/"Reset" are also on-screen buttons (usable by mouse click too,
since phones have no Enter/R keys) — but the meaningful post-outcome actions
(Retry, Next Level, Replay) live in the outcome modal, not the toolbar.

**Mobile requirements** (validated against an emulated iPhone SE, 375×667
CSS px, DPR 2, portrait): viewport meta tag with `user-scalable=no`, ≥44px tap
targets, `touch-action: manipulation` on buttons to kill the 300ms tap delay,
`text-size-adjust: 100%` globally (stops mobile browsers auto-inflating text,
which was silently growing the toolbar and dragging the touch controls out of
position), no horizontal overflow anywhere (menu grid included — watch for
`min-width: auto` on grid items with long text forcing overflow; fixed once
already via `min-width: 0` on `.level-tile` + a 2-column layout under 480px).

**The mobile game screen is a fullscreen app shell, not a scaled-down box.**
Under `@media (pointer: coarse)`, `#game-screen`/`#canvas-wrap`/`#game-toolbar`
all switch to `position: fixed`. `resizeCanvas()` in `game.js` sets the
canvas's actual resolution to `window.innerWidth/innerHeight * devicePixelRatio`
(with a matching `ctx.setTransform` for crisp high-DPI rendering) so the
canvas genuinely fills the device screen — desktop keeps the fixed 1000×700
native resolution untouched, scaled by CSS as before. The toolbar floats as a
translucent bar over the top of the canvas; `buildHud()` measures the
toolbar's real height (`getBoundingClientRect()`) and passes it as
`hud.topInset` so the in-canvas speed/steering HUD text never renders
underneath it (the celebration photo doesn't need this — it lives in the
DOM outcome modal now, not the canvas; see "Celebration on success" above). The
touch widgets are pinned to the fixed canvas wrapper, not flow-positioned —
this was a real bug once (toolbar height changes, from any cause, could push
the wheel/pedal off-screen or out of the viewport) and is now structurally
impossible since nothing here depends on document flow or text metrics.
If you touch this layout, the regression check that matters: force the
toolbar's height way up (e.g. inject a huge `font-size` on its buttons) and
confirm the touch widgets don't move — if they do, something regressed back
to flow-dependent positioning.

## Testing

`tests/sim.test.js` (`npm test`): headless, dependency-free Node regression
suite covering `physics.js`, `collision.js`, `levels.js`, `tirepaths.js` — runs
each core JS file in a `vm` context (no DOM) and asserts on the simulation
math directly (every level's start pose, wall-collision timing, reverse gear,
tire-path shape, wheel steering geometry, the guide-lines-pairing design rule,
analog steerRatio behavior including release-centers-to-zero).

**Not covered**: rendering, DOM wiring, `input.js`'s keyboard listeners,
`touchcontrols.js`, `menu.js`, `game.js`'s state machine. These were verified
manually during development, including once via a headless Chrome-for-Testing
instance driven directly over the DevTools protocol (mobile-viewport emulation
+ synthetic pointer-event drags) — that script wasn't checked into the repo.
If DOM/browser coverage becomes worth the weight, that's the gap to fill.

## Non-goals / constraints

- No backend, no build tooling, no npm dependencies (the `test` script is
  plain `node`, not a test framework).
- No analytics, no sound.
- Repo: `github.com/cmarschner/parkingtrainer`, `main` branch. GitHub Pages (if
  enabled) serves this directory's `index.html` at its root — don't rename it
  or move it into a subdirectory.
