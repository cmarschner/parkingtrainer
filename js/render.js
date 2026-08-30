window.Sim = window.Sim || {};

Sim.Render = (function () {
  const C = Sim.Constants;
  const HALF_PI = Math.PI / 2;

  const CELEBRATION_PHOTO_SOURCES = [
    'pics/george-clooney.png', 'pics/quoka.png', 'pics/ryan_gosling.png',
    'pics/delfin.png', 'pics/niedzwiecz.png', 'pics/bangchan.png',
    'pics/bart.png', 'pics/irena.png', 'pics/phile.png', 'pics/sungmin.png',
  ];
  const celebrationPhotos = CELEBRATION_PHOTO_SOURCES.map((src) => {
    const entry = { img: new Image(), loaded: false };
    entry.img.onload = () => { entry.loaded = true; };
    entry.img.src = src;
    return entry;
  });

  function getCelebrationPhotoCount() {
    return celebrationPhotos.length;
  }

  // A camera is an anchor point (world meters) plus a rotation (radians) applied
  // about that anchor before scaling/centering onto the canvas. Fixed top-down
  // view uses rotation 0; driver view rotates so the car's heading always faces
  // canvas "up" and re-centers on the car every frame — same transform, different camera.
  function computeCamera(level, state, mode) {
    if (mode === 'driver') {
      const carRect = Sim.Physics.getCarRect(state);
      return { x: carRect.cx, y: carRect.cy, rotation: HALF_PI - state.theta };
    }
    return { x: level.viewCenter.x, y: level.viewCenter.y, rotation: 0 };
  }

  function worldToCanvas(camera, wx, wy) {
    const dx = wx - camera.x, dy = wy - camera.y;
    const cos = Math.cos(camera.rotation), sin = Math.sin(camera.rotation);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return {
      x: C.CANVAS_WIDTH / 2 + rx * C.PX_PER_METER,
      y: C.CANVAS_HEIGHT / 2 - ry * C.PX_PER_METER,
    };
  }

  function pathPolygon(ctx, camera, worldPoints) {
    ctx.beginPath();
    worldPoints.forEach((p, i) => {
      const c = worldToCanvas(camera, p.x, p.y);
      if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
    });
    ctx.closePath();
  }

  function fillRect(ctx, camera, rect, fillStyle, strokeStyle) {
    const corners = Sim.Collision.corners(rect);
    pathPolygon(ctx, camera, corners);
    if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
    if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  function drawAxisRect(ctx, camera, minX, minY, maxX, maxY, fillStyle) {
    pathPolygon(ctx, camera, [
      { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY },
    ]);
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function drawSegment(ctx, camera, x1, y1, x2, y2, strokeStyle, dashed) {
    const a = worldToCanvas(camera, x1, y1);
    const b = worldToCanvas(camera, x2, y2);
    ctx.save();
    ctx.setLineDash(dashed ? [8, 6] : []);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawTirePaths(ctx, camera, level, state) {
    if (!level.showExtrapolation) return;
    const paths = Sim.TirePaths.computePaths(state);
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    paths.forEach((path) => {
      // Rear-axle midpoint prediction matches its dot's color; the 4 tire paths stay yellow.
      ctx.strokeStyle = path.name === 'REAR_MID' ? '#ff5c5c' : '#ffd23f';
      ctx.beginPath();
      path.points.forEach((p, i) => {
        const c = worldToCanvas(camera, p.x, p.y);
        if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
      });
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawCar(ctx, camera, rect, fillStyle) {
    fillRect(ctx, camera, rect, fillStyle, '#1a1a1a');
    // Front-orientation marker: a short line from center to the front edge.
    const front = Sim.Geom.localToWorld(rect.cx, rect.cy, rect.angle, rect.length / 2, 0);
    drawSegment(ctx, camera, rect.cx, rect.cy, front.x, front.y, '#ffffff', false);
  }

  function drawDot(ctx, camera, wx, wy, radiusPx, fillStyle, strokeStyle) {
    const c = worldToCanvas(camera, wx, wy);
    ctx.beginPath();
    ctx.arc(c.x, c.y, radiusPx, 0, Math.PI * 2);
    if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
    if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  // Wheels (steered front pair rotated by the current steering angle), the
  // rear axle line, and its midpoint — the car's actual physics reference point.
  function drawWheelsAndAxle(ctx, camera, state) {
    const wheels = Sim.Physics.getWheelPoses(state);
    const rl = wheels.find((w) => w.name === 'RL');
    const rr = wheels.find((w) => w.name === 'RR');

    drawSegment(ctx, camera, rl.x, rl.y, rr.x, rr.y, '#111111', false);

    wheels.forEach((w) => {
      fillRect(ctx, camera, {
        cx: w.x, cy: w.y, angle: w.angle,
        length: C.WHEEL_LENGTH, width: C.WHEEL_WIDTH,
      }, '#111111', null);
    });

    const mid = Sim.Physics.getRearAxleMidpoint(state);
    drawDot(ctx, camera, mid.x, mid.y, 4, '#ff5c5c', '#ffffff');
  }

  function renderFrame(ctx, level, state, hud, mode) {
    ctx.clearRect(0, 0, C.CANVAS_WIDTH, C.CANVAS_HEIGHT);

    const camera = computeCamera(level, state, mode);

    // Outside-the-lot background
    ctx.fillStyle = '#3a6b35';
    ctx.fillRect(0, 0, C.CANVAS_WIDTH, C.CANVAS_HEIGHT);

    // Pavement
    const b = level.paveBounds;
    drawAxisRect(ctx, camera, b.minX, b.minY, b.maxX, b.maxY, '#5a5a5a');

    // Stall divider lines
    level.stallLines.forEach((l) => drawSegment(ctx, camera, l.x1, l.y1, l.x2, l.y2, '#e8e8e8', false));

    // Target space highlight
    fillRect(ctx, camera, level.targetSpace.rect, 'rgba(255, 210, 63, 0.18)', '#ffd23f');

    // Parked obstacle cars
    level.obstacleCars.forEach((c) => drawCar(ctx, camera, c, '#8a3b3b'));

    // Walls / curbs
    level.walls.forEach((w) => fillRect(ctx, camera, w, '#262626', null));

    // Player car
    const playerRect = Sim.Physics.getCarRect(state);
    drawCar(ctx, camera, playerRect, '#2f6fed');
    drawWheelsAndAxle(ctx, camera, state);

    // Tire path prediction — drawn on top of the car, not underneath
    drawTirePaths(ctx, camera, level, state);

    drawHud(ctx, hud);
    drawCelebration(ctx, hud);
  }

  function drawSpeechBubble(ctx, x, y, w, h, pointerX, pointerY) {
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + w * 0.65, y + h);
    ctx.lineTo(pointerX, pointerY);
    ctx.lineTo(x + w * 0.45, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Photo + "Well done!" speech bubble shown while the level is in the parked-success state.
  function drawCelebration(ctx, hud) {
    if (!hud.celebrate) return;

    const size = 140, margin = 20;
    // Pushed further down when a floating toolbar (mobile) eats into the top of the canvas.
    const extraTopClearance = Math.max(0, (hud.topInset ?? 12) - 12);
    const cx = C.CANVAS_WIDTH - margin - size / 2;
    const cy = margin + size + extraTopClearance; // photo + bubble pulled down by size/2 so the bubble stays on-screen

    const text = 'Well done!';
    ctx.save();
    ctx.font = 'bold 20px sans-serif';
    const bubbleW = ctx.measureText(text).width + 32;
    const bubbleH = 44;
    const bubbleX = cx - bubbleW / 2;
    const bubbleY = cy - size / 2 - bubbleH - 14;

    drawSpeechBubble(ctx, bubbleX, bubbleY, bubbleW, bubbleH, cx, cy - size / 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bubbleX + bubbleW / 2, bubbleY + bubbleH / 2 + 1);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const photo = celebrationPhotos[hud.photoIndex] || celebrationPhotos[0];
    if (photo.loaded) {
      ctx.drawImage(photo.img, cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.fillStyle = '#444444';
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function drawHud(ctx, hud) {
    ctx.save();
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    let y = hud.topInset ?? 12;
    hud.lines.forEach((line) => {
      ctx.fillText(line, 12, y);
      y += 22;
    });
    if (hud.message) {
      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = hud.messageColor || '#ffffff';
      const metrics = ctx.measureText(hud.message);
      ctx.fillText(hud.message, (C.CANVAS_WIDTH - metrics.width) / 2, C.CANVAS_HEIGHT - 60);
    }
    ctx.restore();
  }

  return { renderFrame, getCelebrationPhotoCount };
})();
