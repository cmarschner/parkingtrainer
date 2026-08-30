window.Sim = window.Sim || {};

Sim.Input = (function () {
  // `keys` is the single source physics reads from each frame. Keyboard and touch
  // controls each report into their own set, and every change recomputes `keys` as
  // the OR of both — so a touch release can never clobber a keyboard hold or vice versa.
  const keys = { up: false, down: false, left: false, right: false };
  const keyboardKeys = { up: false, down: false, left: false, right: false };
  const touchKeys = { up: false, down: false, left: false, right: false };
  const HELD_KEYS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };

  function recompute() {
    keys.up = keyboardKeys.up || touchKeys.up;
    keys.down = keyboardKeys.down || touchKeys.down;
    keys.left = keyboardKeys.left || touchKeys.left;
    keys.right = keyboardKeys.right || touchKeys.right;
  }

  function setTouchKey(name, value) {
    touchKeys[name] = value;
    recompute();
  }

  function init({ onEnter, onReset, onToggleView } = {}) {
    window.addEventListener('keydown', (e) => {
      if (HELD_KEYS[e.code]) {
        keyboardKeys[HELD_KEYS[e.code]] = true;
        recompute();
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
        keyboardKeys[HELD_KEYS[e.code]] = false;
        recompute();
        e.preventDefault();
      }
    });
  }

  function reset() {
    keyboardKeys.up = keyboardKeys.down = keyboardKeys.left = keyboardKeys.right = false;
    touchKeys.up = touchKeys.down = touchKeys.left = touchKeys.right = false;
    recompute();
  }

  return { keys, init, reset, setTouchKey };
})();
