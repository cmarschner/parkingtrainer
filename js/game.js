window.Sim = window.Sim || {};

Sim.Game = (function () {
  const C = Sim.Constants;

  let ctx, menuScreen, gameScreen, canvas, viewToggleBtn, gameToolbarEl;
  let outcomeModalEl, outcomeBackdropEl, outcomeMessageEl, outcomeActionsEl;
  let screen = 'menu'; // 'menu' | 'game'
  let currentLevel = null;
  let carState = null;
  let gameState = 'DRIVING'; // 'DRIVING' | 'PARKED_SUCCESS' | 'COLLIDED_FAIL'
  let lastTimestamp = null;
  let viewMode = 'driver'; // 'topdown' | 'driver' — persists across level loads within the session
  let celebrationPhotoIndex = 0;
  const MOBILE_QUERY = window.matchMedia('(pointer: coarse)');

  // On touch devices the canvas fills the actual viewport (see the CSS
  // position:fixed layout under @media (pointer: coarse)); on desktop it
  // keeps its fixed 1000x700 native resolution, scaled down by CSS as before.
  function resizeCanvas() {
    if (!MOBILE_QUERY.matches) {
      if (C.CANVAS_WIDTH !== 1000 || C.CANVAS_HEIGHT !== 700) {
        canvas.width = 1000;
        canvas.height = 700;
        canvas.style.width = '';
        canvas.style.height = '';
        C.CANVAS_WIDTH = 1000;
        C.CANVAS_HEIGHT = 700;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    C.CANVAS_WIDTH = w;
    C.CANVAS_HEIGHT = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

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
    hideOutcomeModal();
    showGame();
  }

  function resetLevel() {
    if (!currentLevel) return;
    loadLevel(currentLevel.id);
  }

  function makeOutcomeButton(label, onClick, secondary) {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (secondary) btn.classList.add('secondary');
    btn.addEventListener('click', onClick);
    return btn;
  }

  function showOutcomeModal(kind) {
    outcomeActionsEl.innerHTML = '';
    // Success keeps the confetti/celebration photo visible behind the modal
    // instead of dimming them along with everything else like collision does.
    outcomeBackdropEl.classList.toggle('celebrate', kind === 'success');
    if (kind === 'collision') {
      outcomeMessageEl.textContent = '💥 Collision!';
      outcomeActionsEl.appendChild(makeOutcomeButton('Retry', resetLevel));
      outcomeActionsEl.appendChild(makeOutcomeButton('Back to Menu', showMenu, true));
    } else {
      const hasNext = currentLevel.id < Sim.Levels.LEVELS.length;
      outcomeMessageEl.textContent = hasNext ? '🎉 Parked!' : "🎉 Parked! You've completed every level!";
      if (hasNext) {
        outcomeActionsEl.appendChild(makeOutcomeButton('Next Level →', () => loadLevel(currentLevel.id + 1)));
      }
      outcomeActionsEl.appendChild(makeOutcomeButton('Replay', resetLevel, hasNext));
      outcomeActionsEl.appendChild(makeOutcomeButton('Back to Menu', showMenu, true));
    }
    outcomeModalEl.classList.remove('hidden');
  }

  function hideOutcomeModal() {
    outcomeModalEl.classList.add('hidden');
  }

  function handleEnter() {
    if (screen !== 'game' || gameState !== 'DRIVING') return;
    if (isStopped(carState) && isAligned(carState, currentLevel)) {
      gameState = 'PARKED_SUCCESS';
      Sim.Menu.markCompleted(currentLevel.id);
      celebrationPhotoIndex = Math.floor(Math.random() * Sim.Render.getCelebrationPhotoCount());
      Sim.Confetti.spawn();
      showOutcomeModal('success');
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
      showOutcomeModal('collision');
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
      lines.push('Aligned — confirm to park');
    }

    // On the mobile fullscreen layout the toolbar floats over the canvas, so
    // HUD text needs to start below it. Measure the real height rather than
    // guessing a constant — stays correct regardless of text-size settings.
    const topInset = MOBILE_QUERY.matches ? gameToolbarEl.getBoundingClientRect().height + 8 : 12;

    return { lines, celebrate: gameState === 'PARKED_SUCCESS', photoIndex: celebrationPhotoIndex, topInset };
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
    gameToolbarEl = document.getElementById('game-toolbar');
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    outcomeModalEl = document.getElementById('outcome-modal');
    outcomeBackdropEl = document.getElementById('outcome-backdrop');
    outcomeMessageEl = document.getElementById('outcome-message');
    outcomeActionsEl = document.getElementById('outcome-actions');

    document.getElementById('back-to-menu').addEventListener('click', showMenu);
    document.getElementById('btn-park').addEventListener('click', handleEnter);
    document.getElementById('btn-reset').addEventListener('click', handleReset);

    viewToggleBtn = document.getElementById('toggle-view');
    viewToggleBtn.addEventListener('click', toggleViewMode);

    Sim.Input.init({ onEnter: handleEnter, onReset: handleReset, onToggleView: toggleViewMode });
    Sim.TouchControls.init();

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    MOBILE_QUERY.addEventListener('change', resizeCanvas);

    showMenu();
    requestAnimationFrame(loop);
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', Sim.Game.init);
