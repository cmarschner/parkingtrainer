window.Sim = window.Sim || {};

Sim.Game = (function () {
  const C = Sim.Constants;

  let ctx, menuScreen, gameScreen, canvas, viewToggleBtn, gameToolbarEl;
  let outcomeModalEl, outcomeBackdropEl, outcomeBubbleEl, outcomePhotoEl, outcomeMessageEl, outcomeStatsEl, outcomeActionsEl;
  let screen = 'menu'; // 'menu' | 'game'
  let currentLevel = null;
  let carState = null;
  let gameState = 'DRIVING'; // 'DRIVING' | 'PARKED_SUCCESS' | 'COLLIDED_FAIL'
  let lastTimestamp = null;
  let viewMode = 'driver'; // 'topdown' | 'driver' — persists across level loads within the session
  let celebrationPhotoIndex = 0;
  let gameMode = 'practice'; // 'practice' | 'challenge' — chosen in the menu, applies to the next level loaded
  let challengeStats = null; // { collisions, startTime } while a challenge attempt is running, else null
  let collisionFlashUntil = 0; // performance.now() timestamp; HUD shows a brief collision notice until then
  // Cumulative totals across an unbroken Challenge run from level 1 through
  // the last level, via "Next Level" only — null whenever that chain isn't
  // (or isn't yet) intact, which is what gates the final share offer.
  let runStats = null; // { totalTimeMs, totalCollisions }
  const MOBILE_QUERY = window.matchMedia('(pointer: coarse)');
  const SHARE_URL = 'https://cmarschner.github.io/parking-practice/';

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
    Sim.Menu.renderMenu(menuScreen, { mode: gameMode, onSelectLevel: loadLevel, onModeChange: handleModeChange });
  }

  function handleModeChange(newMode) {
    gameMode = newMode;
    showMenu();
  }

  function showGame() {
    screen = 'game';
    menuScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
  }

  function loadLevel(id, { continuing } = {}) {
    currentLevel = Sim.Levels.buildLevel(id);
    carState = Sim.Physics.createCarState(currentLevel.startPose);
    gameState = 'DRIVING';
    lastTimestamp = null;
    Sim.Input.reset();
    Sim.Confetti.clear();
    hideOutcomeModal();
    challengeStats = gameMode === 'challenge' ? { collisions: 0, startTime: performance.now() } : null;
    collisionFlashUntil = 0;

    if (gameMode !== 'challenge') {
      runStats = null;
    } else if (id === 1) {
      runStats = { totalTimeMs: 0, totalCollisions: 0 }; // starting level 1 always begins a fresh run
    } else if (!continuing) {
      runStats = null; // jumped in mid-sequence — no complete 1..N record to report
    } // else: continuing===true from "Next Level" — runStats (already updated in handleEnter) carries over

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

  function buildShareText(stats) {
    const seconds = (stats.totalTimeMs / 1000).toFixed(1);
    const n = stats.totalCollisions;
    return `I parked my way through all 8 levels of Parking Practice in ${seconds}s with ${n} collision${n === 1 ? '' : 's'}! 🚗 Can you beat that?`;
  }

  // Web Share API opens the OS's native share sheet (X/Facebook/WhatsApp/etc.
  // appear there if installed) — the best UX, and what most mobile browsers
  // support. Desktop browsers mostly don't implement it, so there we fall
  // back to direct share-intent links for the three platforms asked for.
  function buildShareControls(stats) {
    const text = buildShareText(stats);
    const container = document.createElement('div');
    container.id = 'outcome-share';

    if (navigator.share) {
      const btn = makeOutcomeButton('Share Results', () => {
        navigator.share({ text, url: SHARE_URL }).catch(() => {}); // user cancelling the share sheet throws — ignore
      });
      container.appendChild(btn);
      return container;
    }

    const label = document.createElement('div');
    label.className = 'share-label';
    label.textContent = 'Share your result:';
    container.appendChild(label);

    const row = document.createElement('div');
    row.className = 'share-links';
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(SHARE_URL);
    [
      ['X', `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`],
      ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`],
      ['WhatsApp', `https://wa.me/?text=${encodedText}%20${encodedUrl}`],
    ].forEach(([label, href]) => {
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = label;
      a.className = 'share-link';
      row.appendChild(a);
    });
    container.appendChild(row);
    return container;
  }

  function showOutcomeModal(kind, challengeResult) {
    outcomeActionsEl.innerHTML = '';
    // Success keeps the confetti visible behind the modal instead of dimming
    // it along with everything else like collision does.
    outcomeBackdropEl.classList.toggle('celebrate', kind === 'success');
    if (kind === 'collision') {
      outcomeBubbleEl.classList.add('hidden');
      outcomePhotoEl.classList.add('hidden');
      outcomeStatsEl.classList.add('hidden');
      outcomeMessageEl.textContent = '💥 Collision!';
      outcomeActionsEl.appendChild(makeOutcomeButton('Retry', resetLevel));
      outcomeActionsEl.appendChild(makeOutcomeButton('Back to Menu', showMenu, true));
    } else {
      outcomeBubbleEl.classList.remove('hidden');
      outcomePhotoEl.src = Sim.Render.getCelebrationPhotoSrc(celebrationPhotoIndex);
      outcomePhotoEl.classList.remove('hidden');
      const hasNext = currentLevel.id < Sim.Levels.LEVELS.length;
      outcomeMessageEl.textContent = hasNext ? '🎉 Parked!' : "🎉 Parked! You've completed every level!";

      if (challengeResult) {
        const seconds = (challengeResult.timeMs / 1000).toFixed(1);
        outcomeStatsEl.textContent = `⏱ ${seconds}s   💥 ${challengeResult.collisions}` +
          (challengeResult.isNewBest ? '  🏆 New Best!' : '');
        outcomeStatsEl.classList.toggle('new-best', challengeResult.isNewBest);
        outcomeStatsEl.classList.remove('hidden');
      } else {
        outcomeStatsEl.classList.add('hidden');
      }

      if (hasNext) {
        outcomeActionsEl.appendChild(makeOutcomeButton('Next Level →', () => loadLevel(currentLevel.id + 1, { continuing: true })));
      } else if (runStats) {
        outcomeActionsEl.appendChild(buildShareControls(runStats));
      }
      outcomeActionsEl.appendChild(makeOutcomeButton('Replay', resetLevel, hasNext || !!runStats));
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

      let challengeResult = null;
      if (challengeStats) {
        const timeMs = performance.now() - challengeStats.startTime;
        const { isNewBest, best } = Sim.Menu.recordChallengeResult(currentLevel.id, challengeStats.collisions, timeMs);
        challengeResult = { timeMs, collisions: challengeStats.collisions, isNewBest, best };
        if (runStats) {
          runStats.totalTimeMs += timeMs;
          runStats.totalCollisions += challengeStats.collisions;
        }
      }
      showOutcomeModal('success', challengeResult);
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
      if (challengeStats) {
        // Same hard-stop physics — the car still fully stops on contact —
        // but instead of a blocking modal, challenge mode counts the hit and
        // puts the car back at the start pose immediately, clock still
        // running. Input state is deliberately left alone: if the player is
        // still holding the pedal through the crash, the car should just
        // keep going on the next attempt without them having to re-press it.
        challengeStats.collisions++;
        collisionFlashUntil = performance.now() + 1200;
        carState = Sim.Physics.createCarState(currentLevel.startPose);
      } else {
        gameState = 'COLLIDED_FAIL';
        carState.v = 0;
        showOutcomeModal('collision');
      }
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

    if (challengeStats) {
      const elapsedS = (performance.now() - challengeStats.startTime) / 1000;
      lines.push(`⏱ ${elapsedS.toFixed(1)}s   💥 ${challengeStats.collisions}`);
      if (performance.now() < collisionFlashUntil) {
        lines.push('💥 Collision! Back to the start...');
      }
    }

    if (gameState === 'DRIVING' && isStopped(carState) && isAligned(carState, currentLevel)) {
      lines.push('Aligned — confirm to park');
    }

    // On the mobile fullscreen layout the toolbar floats over the canvas, so
    // HUD text needs to start below it. Measure the real height rather than
    // guessing a constant — stays correct regardless of text-size settings.
    const topInset = MOBILE_QUERY.matches ? gameToolbarEl.getBoundingClientRect().height + 8 : 12;

    return { lines, topInset };
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
    outcomeBubbleEl = document.getElementById('outcome-bubble');
    outcomePhotoEl = document.getElementById('outcome-photo');
    outcomeMessageEl = document.getElementById('outcome-message');
    outcomeStatsEl = document.getElementById('outcome-stats');
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
