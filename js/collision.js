window.Sim = window.Sim || {};

Sim.Collision = (function () {
  // rect: {cx, cy, angle, length, width} — length along local x (rotated by angle), width along local y.
  function corners(rect) {
    const cos = Math.cos(rect.angle), sin = Math.sin(rect.angle);
    const hl = rect.length / 2, hw = rect.width / 2;
    const local = [
      [hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw],
    ];
    return local.map(([lx, ly]) => ({
      x: rect.cx + lx * cos - ly * sin,
      y: rect.cy + lx * sin + ly * cos,
    }));
  }

  function projectOntoAxis(pts, axis) {
    let min = Infinity, max = -Infinity;
    for (const p of pts) {
      const d = p.x * axis.x + p.y * axis.y;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return [min, max];
  }

  function axesOf(rect) {
    const cos = Math.cos(rect.angle), sin = Math.sin(rect.angle);
    return [{ x: cos, y: sin }, { x: -sin, y: cos }];
  }

  // Separating Axis Theorem for two oriented rectangles.
  function intersects(rectA, rectB) {
    const cornersA = corners(rectA);
    const cornersB = corners(rectB);
    const axes = axesOf(rectA).concat(axesOf(rectB));

    for (const axis of axes) {
      const [minA, maxA] = projectOntoAxis(cornersA, axis);
      const [minB, maxB] = projectOntoAxis(cornersB, axis);
      if (maxA < minB || maxB < minA) return false; // separating axis found
    }
    return true;
  }

  return { corners, intersects };
})();
