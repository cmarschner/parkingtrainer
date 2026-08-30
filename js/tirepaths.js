window.Sim = window.Sim || {};

Sim.TirePaths = (function () {
  const C = Sim.Constants;
  const ARC_SAMPLES = 24;

  // Returns one polyline of world points per tire, predicting where it will
  // travel over the next C.T_PREVIEW seconds if v/delta are held constant.
  function computePaths(state) {
    if (Math.abs(state.v) < C.MOVING_EPS) return [];

    // Rear-axle midpoint is the physics reference point itself (local 0,0) —
    // added alongside the 4 wheels so it gets the same straight/arc prediction.
    const points = Sim.Physics.wheelLocalPositions().concat([{ name: 'REAR_MID', lx: 0, ly: 0 }]);

    const tires = points.map((t) => {
      const p = Sim.Geom.localToWorld(state.x, state.y, state.theta, t.lx, t.ly);
      return { name: t.name, x: p.x, y: p.y };
    });

    const straight = Math.abs(state.delta) < C.STRAIGHT_STEER_EPS;

    if (straight) {
      const dist = state.v * C.T_PREVIEW; // signed: negative for reverse
      const dx = Math.cos(state.theta) * dist;
      const dy = Math.sin(state.theta) * dist;
      return tires.map((t) => ({
        name: t.name,
        points: [{ x: t.x, y: t.y }, { x: t.x + dx, y: t.y + dy }],
      }));
    }

    const L = C.WHEELBASE;
    const R = L / Math.tan(state.delta); // signed rear-axle turning radius
    const icrX = state.x + R * -Math.sin(state.theta);
    const icrY = state.y + R * Math.cos(state.theta);
    const omega = (state.v * Math.tan(state.delta)) / L; // signed angular rate
    const sweep = omega * C.T_PREVIEW;

    return tires.map((t) => {
      const radius = Math.hypot(t.x - icrX, t.y - icrY);
      const startAngle = Math.atan2(t.y - icrY, t.x - icrX);
      const points = [];
      for (let i = 0; i <= ARC_SAMPLES; i++) {
        const a = startAngle + (sweep * i) / ARC_SAMPLES;
        points.push({ x: icrX + radius * Math.cos(a), y: icrY + radius * Math.sin(a) });
      }
      return { name: t.name, points };
    });
  }

  return { computePaths };
})();
