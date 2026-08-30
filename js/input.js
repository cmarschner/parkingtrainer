window.Sim = window.Sim || {};

Sim.Input = (function () {
  const keys = { up: false, down: false, left: false, right: false };
  const HELD_KEYS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };

  function init({ onEnter, onReset, onToggleView } = {}) {
    window.addEventListener('keydown', (e) => {
      if (HELD_KEYS[e.code]) {
        keys[HELD_KEYS[e.code]] = true;
        e.preventDefault();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        if (onEnter) onEnter();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        if (onReset) onReset();
      } else if (e.code === 'KeyV') {
        e.preventDefault();
        if (onToggleView) onToggleView();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (HELD_KEYS[e.code]) {
        keys[HELD_KEYS[e.code]] = false;
        e.preventDefault();
      }
    });
  }

  function reset() {
    keys.up = keys.down = keys.left = keys.right = false;
  }

  return { keys, init, reset };
})();
