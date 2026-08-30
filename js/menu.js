window.Sim = window.Sim || {};

Sim.Menu = (function () {
  const STORAGE_KEY = 'fahrsim_progress';
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

  function renderMenu(container, onSelect) {
    const progress = loadProgress();
    container.innerHTML = '';

    const heading = document.createElement('h1');
    heading.textContent = 'Parking Practice';
    container.appendChild(heading);

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
      status.textContent = !unlocked ? 'Locked' : completed ? 'Completed ✓' : 'Ready';

      tile.appendChild(num);
      tile.appendChild(title);
      tile.appendChild(status);

      if (unlocked) {
        tile.addEventListener('click', () => onSelect(level.id));
      }

      grid.appendChild(tile);
    });

    container.appendChild(grid);
  }

  return { loadProgress, saveProgress, isUnlocked, markCompleted, renderMenu };
})();
