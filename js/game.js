window.Sim = window.Sim || {};

Sim.Game = (function () {
  const C = Sim.Constants;

  let ctx, menuScreen, gameScreen, canvas, viewToggleBtn;
  let screen = 'menu'; // 'menu' | 'game'
  let currentLevel = null;
  let carState = null;
  let gameState = 'DRIVING'; // 'DRIVING' | 'PARKED_SUCCESS' | 'COLLIDED_FAIL'
  let lastTimestamp = null;
  let viewMode = 'driver'; // 'topdown' | 'driver' — persists across level loads within the session
  let celebrationPhotoIndex = 0;

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

  function isStopped(state) {
    return Math.abs(state.v) <= C.MOVING_EPS;
  }

  function showMenu() {
    screen = 'menu';
    gameScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    Sim.Menu.renderMenu(menuScreen, loadLevel);
  }

  function showGame() {
    screen = 'game';
    menuScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
  }

  function loadLevel(id) {
    currentLevel = Sim.Levels.buildLevel(id);
    carState = Sim.Physics.createCarState(currentLevel.startPose);
    gameState = 'DRIVING';
    lastTimestamp = null;
    Sim.Input.reset();
    Sim.Confetti.clear();
    showGame();
  }

  function resetLevel() {
    if (!currentLevel) return;
    loadLevel(currentLevel.id);
  }

  function handleEnter() {
    if (screen !== 'game' || gameState !== 'DRIVING') return;
    if (isStopped(carState) && isAligned(carState, currentLevel)) {
      gameState = 'PARKED_SUCCESS';
      Sim.Menu.markCompleted(currentLevel.id);
      celebrationPhotoIndex = Math.floor(Math.random() * Sim.Render.getCelebrationPhotoCount());
      Sim.Confetti.spawn();
    }
  }

  function handleReset() {
    if (screen !== 'game') return;
    resetLevel();
  }

  function toggleViewMode() {
    if (screen !== 'game') return;
    viewMode = viewMode === 'topdown' ? 'driver' : 'topdown';
    viewToggleBtn.textContent = viewMode === 'topdown' ? 'Top-down' : 'Driver';
  }

  function stepPhysicsAndCollision(dt) {
    Sim.Physics.stepSteering(carState, Sim.Input.keys, dt);
    Sim.Physics.stepSpeed(carState, Sim.Input.keys, dt);
    Sim.Physics.integrate(carState, dt);

    const playerRect = Sim.Physics.getCarRect(carState);
    const obstacles = currentLevel.obstacleCars.concat(currentLevel.walls);
    const hit = obstacles.some((o) => Sim.Collision.intersects(playerRect, o));
    if (hit) {
      gameState = 'COLLIDED_FAIL';
      carState.v = 0;
    }
  }

  function buildHud() {
    const speedKmh = Math.abs(carState.v) * 3.6;
    const steerDeg = (carState.delta / C.DEG).toFixed(0);
    const lines = [
      `Level ${currentLevel.id} — ${currentLevel.title}`,
      `Speed: ${speedKmh.toFixed(1)} km/h${carState.v < 0 ? ' (reverse)' : ''}`,
      `Steering: ${steerDeg}°`,
    ];
    if (gameState === 'DRIVING' && isStopped(carState) && isAligned(carState, currentLevel)) {
      lines.push('Aligned — press Enter to park');
    }

    let message = null, messageColor = null, celebrate = false;
    if (gameState === 'COLLIDED_FAIL') {
      message = 'Collision! Press R to retry';
      messageColor = '#ff5c5c';
    } else if (gameState === 'PARKED_SUCCESS') {
      message = 'Parked! Press R to replay, or Back to Menu';
      messageColor = '#4ade80';
      celebrate = true;
    }

    return { lines, message, messageColor, celebrate, photoIndex: celebrationPhotoIndex };
  }

  function render() {
    Sim.Render.renderFrame(ctx, currentLevel, carState, buildHud(), viewMode);
    Sim.Confetti.draw(ctx);
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    if (screen !== 'game') return;

    if (lastTimestamp === null) lastTimestamp = ts;
    let dt = (ts - lastTimestamp) / 1000;
    lastTimestamp = ts;
    dt = Math.min(dt, C.MAX_DT);

    if (gameState === 'DRIVING') {
      stepPhysicsAndCollision(dt);
    }
    Sim.Confetti.update(dt);

    render();
  }

  function init() {
    menuScreen = document.getElementById('menu-screen');
    gameScreen = document.getElementById('game-screen');
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    document.getElementById('back-to-menu').addEventListener('click', showMenu);
    document.getElementById('btn-park').addEventListener('click', handleEnter);
    document.getElementById('btn-reset').addEventListener('click', handleReset);

    viewToggleBtn = document.getElementById('toggle-view');
    viewToggleBtn.addEventListener('click', toggleViewMode);

    Sim.Input.init({ onEnter: handleEnter, onReset: handleReset, onToggleView: toggleViewMode });
    Sim.TouchControls.init();

    showMenu();
    requestAnimationFrame(loop);
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', Sim.Game.init);
