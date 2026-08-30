window.Sim = window.Sim || {};

// A screen-space (canvas-pixel) particle overlay, independent of the world
// camera/view mode — it celebrates on top of whatever's being rendered.
Sim.Confetti = (function () {
  const C = Sim.Constants;
  const COLORS = ['#ff5c5c', '#ffd23f', '#4ade80', '#2f6fed', '#c084fc', '#fb923c'];
  const GRAVITY = 40; // px/s^2
  const MAX_FALL_SPEED = 260; // px/s

  let particles = [];

  function spawn(count = 160) {
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * C.CANVAS_WIDTH,
        y: -20 - Math.random() * C.CANVAS_HEIGHT * 0.6,
        vx: (Math.random() - 0.5) * 60,
        vy: 80 + Math.random() * 90,
        size: 5 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 6,
        swaySeed: Math.random() * Math.PI * 2,
      });
    }
  }

  function clear() {
    particles = [];
  }

  function update(dt) {
    if (particles.length === 0) return;
    particles.forEach((p) => {
      p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL_SPEED);
      p.x += (p.vx + Math.sin(p.y * 0.02 + p.swaySeed) * 30) * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
    });
    particles = particles.filter((p) => p.y < C.CANVAS_HEIGHT + 30);
  }

  function draw(ctx) {
    if (particles.length === 0) return;
    ctx.save();
    particles.forEach((p) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    ctx.restore();
  }

  return { spawn, clear, update, draw };
})();
