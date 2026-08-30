window.Sim = window.Sim || {};

// Two thumb-draggable widgets for touch devices: a steering wheel (left, horizontal
// drag -> left/right) and a forward/backward pedal (right, vertical drag -> up/down).
// Both just report into Sim.Input's touch key state — physics doesn't know or care
// whether a key came from a keyboard or a finger.
Sim.TouchControls = (function () {
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function setupDragWidget(el, thumb, { axis, radius, deadzone, onChange, onRelease }) {
    let pointerId = null;

    function valueFromEvent(e) {
      const rect = el.getBoundingClientRect();
      if (axis === 'x') {
        const center = rect.left + rect.width / 2;
        return clamp(e.clientX - center, -radius, radius);
      }
      const center = rect.top + rect.height / 2;
      return clamp(e.clientY - center, -radius, radius);
    }

    el.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      el.setPointerCapture(pointerId);
      onChange(valueFromEvent(e));
      e.preventDefault();
    });

    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      onChange(valueFromEvent(e));
      e.preventDefault();
    });

    function end(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      onRelease();
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // Analog: the wheel's drag position maps directly to the front-wheel angle
  // (Sim.Input.setSteerRatio), not to a left/right ramp — turning the wheel
  // further turns the actual wheels further, immediately. Releasing snaps
  // back to center (ratio 0), matching the widget's own spring-back visual.
  function setupWheel(el, thumb) {
    const RADIUS = 50, DEADZONE = 4, MAX_VISUAL_DEG = 75;
    setupDragWidget(el, thumb, {
      axis: 'x',
      radius: RADIUS,
      deadzone: DEADZONE,
      onChange(dx) {
        thumb.style.transform = `rotate(${(dx / RADIUS) * MAX_VISUAL_DEG}deg)`;
        const clamped = Math.abs(dx) < DEADZONE ? 0 : dx;
        Sim.Input.setSteerRatio(clamp(-clamped / RADIUS, -1, 1));
      },
      onRelease() {
        thumb.style.transform = 'rotate(0deg)';
        Sim.Input.setSteerRatio(0);
      },
    });
  }

  function setupPedal(el, thumb) {
    const RADIUS = 55, DEADZONE = 10;
    setupDragWidget(el, thumb, {
      axis: 'y',
      radius: RADIUS,
      deadzone: DEADZONE,
      onChange(dy) {
        thumb.style.transform = `translateY(${dy}px)`;
        Sim.Input.setTouchKey('up', dy < -DEADZONE);
        Sim.Input.setTouchKey('down', dy > DEADZONE);
      },
      onRelease() {
        thumb.style.transform = 'translateY(0px)';
        Sim.Input.setTouchKey('up', false);
        Sim.Input.setTouchKey('down', false);
      },
    });
  }

  function init() {
    const wheelEl = document.getElementById('wheel-widget');
    const wheelThumb = document.getElementById('wheel-thumb');
    const pedalEl = document.getElementById('pedal-widget');
    const pedalThumb = document.getElementById('pedal-thumb');
    if (wheelEl && wheelThumb) setupWheel(wheelEl, wheelThumb);
    if (pedalEl && pedalThumb) setupPedal(pedalEl, pedalThumb);
  }

  return { init };
})();
