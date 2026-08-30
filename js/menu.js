window.Sim = window.Sim || {};

Sim.Menu = (function () {
  const STORAGE_KEY = 'fahrsim_progress';
  const CHALLENGE_KEY = 'fahrsim_challenge_best';
  const NUM_LEVELS = Sim.Levels.LEVELS.length;

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error('no data');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.completed) || parsed.completed.length !== NUM_LEVELS) {
        throw new Error('bad shape');
      }
      return parsed;
    } catch (e) {
      return { version: 1, completed: new Array(NUM_LEVELS).fill(false) };
    }
  }

  function saveProgress(progress) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }

  function isUnlocked(progress, levelIndex) {
    return levelIndex === 0 || progress.completed[levelIndex - 1];
  }

  function markCompleted(levelId) {
    const progress = loadProgress();
    progress.completed[levelId - 1] = true;
    saveProgress(progress);
    return progress;
  }

  function loadChallengeBests() {
    try {
      const raw = localStorage.getItem(CHALLENGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function getChallengeBest(levelId) {
    return loadChallengeBests()[levelId] || null;
  }

  // A result is "better" with fewer collisions; ties broken by faster time.
  function isBetterResult(candidate, best) {
    if (!best) return true;
    if (candidate.collisions !== best.collisions) return candidate.collisions < best.collisions;
    return candidate.timeMs < best.timeMs;
  }

  // Returns { isNewBest, best } — best is the stored result after this call.
  function recordChallengeResult(levelId, collisions, timeMs) {
    const bests = loadChallengeBests();
    const candidate = { collisions, timeMs };
    const current = bests[levelId] || null;
    const isNewBest = isBetterResult(candidate, current);
    if (isNewBest) {
      bests[levelId] = candidate;
      localStorage.setItem(CHALLENGE_KEY, JSON.stringify(bests));
    }
    return { isNewBest, best: bests[levelId] };
  }

  function formatChallengeBest(best) {
    return `Best: ${(best.timeMs / 1000).toFixed(1)}s · ${best.collisions} 💥`;
  }

  function renderMenu(container, { mode, onSelectLevel, onModeChange }) {
    const progress = loadProgress();
    container.innerHTML = '';

    const heading = document.createElement('h1');
    heading.textContent = 'Parking Practice';
    container.appendChild(heading);

    const modeToggle = document.createElement('div');
    modeToggle.className = 'mode-toggle';
    [['practice', 'Practice'], ['challenge', 'Challenge']].forEach(([value, label]) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.className = 'mode-toggle-btn' + (mode === value ? ' active' : '');
      btn.addEventListener('click', () => onModeChange(value));
      modeToggle.appendChild(btn);
    });
    container.appendChild(modeToggle);

    const hint = document.createElement('p');
    hint.className = 'mode-hint';
    hint.textContent = mode === 'challenge'
      ? 'Beat your best time with the fewest collisions — a collision resets you in place and keeps the clock running.'
      : 'Learn each maneuver at your own pace.';
    container.appendChild(hint);

    const grid = document.createElement('div');
    grid.className = 'level-grid';

    Sim.Levels.LEVELS.forEach((level, idx) => {
      const unlocked = isUnlocked(progress, idx);
      const completed = progress.completed[idx];

      const tile = document.createElement('button');
      tile.className = 'level-tile' + (unlocked ? '' : ' locked') + (completed ? ' completed' : '');
      tile.disabled = !unlocked;

      const num = document.createElement('div');
      num.className = 'level-num';
      num.textContent = String(level.id);

      const title = document.createElement('div');
      title.className = 'level-title';
      title.textContent = level.title;

      const status = document.createElement('div');
      status.className = 'level-status';
      if (!unlocked) {
        status.textContent = 'Locked';
      } else if (mode === 'challenge') {
        const best = getChallengeBest(level.id);
        status.textContent = best ? formatChallengeBest(best) : 'No time yet';
      } else {
        status.textContent = completed ? 'Completed ✓' : 'Ready';
      }

      tile.appendChild(num);
      tile.appendChild(title);
      tile.appendChild(status);

      if (unlocked) {
        tile.addEventListener('click', () => onSelectLevel(level.id));
      }

      grid.appendChild(tile);
    });

    container.appendChild(grid);
  }

  return {
    loadProgress, saveProgress, isUnlocked, markCompleted, renderMenu,
    getChallengeBest, recordChallengeResult,
  };
})();
