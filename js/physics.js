window.Sim = window.Sim || {};

// Generic 2D geometry helpers shared by physics, tire-path prediction and rendering.
Sim.Geom = (function () {
  function localToWorld(originX, originY, theta, lx, ly) {
    const cos = Math.cos(theta), sin = Math.sin(theta);
    return {
      x: originX + lx * cos - ly * sin,
      y: originY + lx * sin + ly * cos,
    };
  }

  return { localToWorld };
})();

Sim.Physics = (function () {
  const C = Sim.Constants;

  function createCarState(pose) {
    return {
      x: pose.x,
      y: pose.y,
      theta: pose.theta,
      v: 0,
      delta: 0,
    };
  }

  // keys.steerRatio (-1..1, or null when not in use) is an analog override from
  // the touch steering wheel: the wheel's drag position maps directly to the
  // actual front-wheel angle, no ramping — turning the wheel IS turning the
  // wheels. Keyboard input (steerRatio left null) keeps the ramped hold-angle
  // behavior of a real wheel you turn incrementally and let go of.
  function stepSteering(state, keys, dt) {
    if (keys.steerRatio !== null && keys.steerRatio !== undefined) {
      state.delta = keys.steerRatio * C.MAX_STEER;
      return;
    }
    if (keys.left && !keys.right) {
      state.delta = Math.min(C.MAX_STEER, state.delta + C.STEER_RATE * dt);
    } else if (keys.right && !keys.left) {
      state.delta = Math.max(-C.MAX_STEER, state.delta - C.STEER_RATE * dt);
    }
  }

  function stepSpeed(state, keys, dt) {
    const minSpeed = -C.MAX_SPEED_REV;

    if (keys.up && !keys.down) {
      if (state.v >= 0) {
        state.v = Math.min(C.MAX_SPEED_FWD, state.v + C.ACCEL * dt);
      } else {
        state.v = Math.min(0, state.v + C.BRAKE_DECEL * dt);
      }
    } else if (keys.down && !keys.up) {
      if (state.v > 0) {
        state.v = Math.max(0, state.v - C.BRAKE_DECEL * dt);
      } else {
        state.v = Math.max(minSpeed, state.v - C.REVERSE_ACCEL * dt);
      }
    } else {
      // Coast to a stop, sign-aware so it never overshoots past zero.
      if (state.v > 0) {
        state.v = Math.max(0, state.v - C.COAST_DECEL * dt);
      } else if (state.v < 0) {
        state.v = Math.min(0, state.v + C.COAST_DECEL * dt);
      }
    }

    if (state.v < minSpeed) state.v = minSpeed;
  }

  function integrate(state, dt) {
    const L = C.WHEELBASE;
    state.x += state.v * Math.cos(state.theta) * dt;
    state.y += state.v * Math.sin(state.theta) * dt;
    if (Math.abs(state.delta) >= C.STRAIGHT_STEER_EPS) {
      state.theta += (state.v * Math.tan(state.delta) / L) * dt;
    }
  }

  // The player car's box is defined by its geometric center, not the rear axle.
  function getCarRect(state) {
    const forwardOffset = C.CAR_LENGTH / 2 - C.REAR_OVERHANG;
    const center = Sim.Geom.localToWorld(state.x, state.y, state.theta, forwardOffset, 0);
    return {
      cx: center.x,
      cy: center.y,
      angle: state.theta,
      length: C.CAR_LENGTH,
      width: C.CAR_WIDTH,
    };
  }

  // Wheel positions in the car-local frame (rear axle origin, x forward). Front
  // wheels are marked `steered` so callers know to add the steering angle.
  function wheelLocalPositions() {
    const th = C.TRACK_WIDTH / 2;
    return [
      { name: 'RL', lx: 0, ly: th, steered: false },
      { name: 'RR', lx: 0, ly: -th, steered: false },
      { name: 'FL', lx: C.WHEELBASE, ly: th, steered: true },
      { name: 'FR', lx: C.WHEELBASE, ly: -th, steered: true },
    ];
  }

  // World-space pose (position + heading) of each of the 4 wheels — front wheels
  // are rotated by the current steering angle, rear wheels stay body-aligned.
  function getWheelPoses(state) {
    return wheelLocalPositions().map((w) => {
      const p = Sim.Geom.localToWorld(state.x, state.y, state.theta, w.lx, w.ly);
      return { name: w.name, x: p.x, y: p.y, angle: state.theta + (w.steered ? state.delta : 0) };
    });
  }

  // The physics reference point (state.x, state.y) *is* the rear-axle midpoint.
  function getRearAxleMidpoint(state) {
    return { x: state.x, y: state.y };
  }

  return {
    createCarState, stepSteering, stepSpeed, integrate, getCarRect,
    wheelLocalPositions, getWheelPoses, getRearAxleMidpoint,
  };
})();
