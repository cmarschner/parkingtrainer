// Headless regression tests for the simulation core (physics, collision, levels,
// tire-path prediction). No browser/DOM required — plain Node, no dependencies,
// matching the project's no-build-step philosophy.
//
// Covers: physics/collision/levels/tirepaths.js. Does NOT cover rendering, DOM
// wiring, input handling, or touch controls — those need a real or headless
// browser (verified manually during development; not part of this suite).
//
// Run: node tests/sim.test.js   (or: npm test)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
const CORE_FILES = ['constants.js', 'levels.js', 'physics.js', 'collision.js', 'tirepaths.js'];

const sandbox = { console };
sandbox.window = sandbox; // classic <script> globals attach to `window`, which must be the vm's global object
vm.createContext(sandbox);

for (const f of CORE_FILES) {
  vm.runInContext(fs.readFileSync(path.join(JS_DIR, f), 'utf8'), sandbox, { filename: f });
}

const Sim = sandbox.Sim;
const C = Sim.Constants;

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function isAligned(state, level) {
  const carRect = Sim.Physics.getCarRect(state);
  const target = level.targetSpace;
  const dist = Math.hypot(carRect.cx - target.rect.cx, carRect.cy - target.rect.cy);
  const headingDiff = Math.abs(normalizeAngle(state.theta - target.targetHeading));
  return dist <= C.POSITION_TOLERANCE && headingDiff <= C.HEADING_TOLERANCE;
}

function checkCollision(state, level) {
  const rect = Sim.Physics.getCarRect(state);
  const obstacles = level.obstacleCars.concat(level.walls);
  return obstacles.some((o) => Sim.Collision.intersects(rect, o));
}

let passCount = 0;
function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  passCount++;
}

// --- Every level builds without error and starts in a collision-free position ---
for (const spec of Sim.Levels.LEVELS) {
  const level = Sim.Levels.buildLevel(spec.id);
  assert(Number.isFinite(level.startPose.x) && Number.isFinite(level.startPose.y), `level ${spec.id} start pose is finite`);
  assert(!checkCollision(Sim.Physics.createCarState(level.startPose), level), `level ${spec.id} start pose is collision-free`);
  assert(level.showExtrapolation === true || level.showExtrapolation === false, `level ${spec.id} declares showExtrapolation`);
}

// Design rule: every new scenario (lot kind or difficulty) is introduced with guide
// lines, then immediately again without — i.e. pairs of (true, false) in sequence.
{
  const flags = Sim.Levels.LEVELS.map((l) => l.showExtrapolation);
  for (let i = 0; i < flags.length; i += 2) {
    assert(flags[i] === true && flags[i + 1] === false,
      `levels ${i + 1}/${i + 2} form a (guides, no-guides) pair, got (${flags[i]}, ${flags[i + 1]})`);
  }
}

// --- Tolerance sanity: a car placed exactly at the target pose reads as aligned ---
{
  const level = Sim.Levels.buildLevel(1);
  const state = Sim.Physics.createCarState({ x: 0, y: 0, theta: 0 });
  const forwardOffset = C.CAR_LENGTH / 2 - C.REAR_OVERHANG;
  const target = level.targetSpace;
  state.theta = target.targetHeading;
  state.x = target.rect.cx - forwardOffset * Math.cos(state.theta);
  state.y = target.rect.cy - forwardOffset * Math.sin(state.theta);
  assert(isAligned(state, level), 'car placed exactly at target pose reads as aligned');
  assert(!checkCollision(state, level), 'car placed exactly at target pose does not collide with its own stall');
}

// --- Wall collision fires promptly, not after driving through the wall ---
{
  const level = Sim.Levels.buildLevel(1);
  const state = Sim.Physics.createCarState({ x: level.targetSpace.rect.cx, y: 4.0, theta: -Math.PI / 2 });
  state.v = C.MAX_SPEED_FWD;
  const dt = 1 / 60;
  let collided = false, t = 0;
  while (t < 5 && !collided) {
    Sim.Physics.integrate(state, dt);
    if (checkCollision(state, level)) collided = true;
    t += dt;
  }
  assert(collided, 'driving straight at the back wall triggers a collision');
  assert(state.y > -2.0, 'collision is caught near the wall, not long after passing through it');
}

// --- Reverse gear works in every level (removed the old per-level allowReverse flag) ---
for (const spec of Sim.Levels.LEVELS) {
  const level = Sim.Levels.buildLevel(spec.id);
  const state = Sim.Physics.createCarState(level.startPose);
  const dt = 1 / 60;
  for (let i = 0; i < 120; i++) {
    Sim.Physics.stepSpeed(state, { up: false, down: true }, dt);
    Sim.Physics.integrate(state, dt);
  }
  assert(state.v < 0, `level ${spec.id} allows reverse (v=${state.v.toFixed(2)} after holding Down)`);
}

// --- Driving straight down the lane in a "tight squeeze" level must not clip the neighbors ---
{
  const level = Sim.Levels.buildLevel(3); // perpendicular, occupied neighbors, guides on
  const state = Sim.Physics.createCarState(level.startPose);
  const dt = 1 / 60;
  let t = 0;
  while (t < 15) {
    Sim.Physics.stepSpeed(state, { up: true, down: false }, dt);
    Sim.Physics.integrate(state, dt);
    t += dt;
    if (checkCollision(state, level)) throw new Error('FAIL: straight lane driving past occupied stalls collided unexpectedly at t=' + t.toFixed(2));
  }
  passCount++;
}

// --- Collision sanity: deliberately overlapping a parked neighbor registers as a hit ---
{
  const level = Sim.Levels.buildLevel(3);
  const state = Sim.Physics.createCarState(level.startPose);
  state.x = level.obstacleCars[0].cx;
  state.y = level.obstacleCars[0].cy;
  state.theta = -Math.PI / 2;
  assert(checkCollision(state, level), 'deliberately overlapping a parked neighbor car registers as a collision');
}

// --- Tire path prediction: straight and arc cases both include the rear-axle midpoint ---
{
  const level = Sim.Levels.buildLevel(1);
  const state = Sim.Physics.createCarState(level.startPose);
  state.v = 1.0;
  state.delta = 0;
  let paths = Sim.TirePaths.computePaths(state);
  assert(paths.length === 5, 'straight case returns 4 wheel paths + rear-axle midpoint');
  assert(paths.some((p) => p.name === 'REAR_MID'), 'straight case includes a REAR_MID path');
  paths.forEach((p) => p.points.forEach((pt) => assert(Number.isFinite(pt.x) && Number.isFinite(pt.y), 'straight path point is finite')));

  state.delta = C.MAX_STEER;
  paths = Sim.TirePaths.computePaths(state);
  assert(paths.length === 5, 'arc case returns 4 wheel paths + rear-axle midpoint');
  paths.forEach((p) => p.points.forEach((pt) => assert(Number.isFinite(pt.x) && Number.isFinite(pt.y), 'arc path point is finite')));
}

// --- Wheel geometry: front wheels pick up the steering angle, rear wheels stay body-aligned ---
{
  const state = Sim.Physics.createCarState({ x: 0, y: 0, theta: 0 });
  state.delta = 20 * C.DEG;
  const wheels = Sim.Physics.getWheelPoses(state);
  const rl = wheels.find((w) => w.name === 'RL');
  const fl = wheels.find((w) => w.name === 'FL');
  assert(rl.angle === 0, 'rear wheel angle is body-aligned, unaffected by steering');
  assert(Math.abs(fl.angle - state.delta) < 1e-9, 'front wheel angle picks up the steering angle');
}

console.log(`sim.test.js: ${passCount} assertions passed.`);
