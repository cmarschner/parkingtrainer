window.Sim = window.Sim || {};

Sim.Levels = (function () {
  const C = Sim.Constants;
  const HALF_PI = Math.PI / 2;

  function verticalWall(cx, yMin, yMax, thickness) {
    return { cx, cy: (yMin + yMax) / 2, angle: HALF_PI, length: yMax - yMin, width: thickness };
  }

  function horizontalWall(cy, xMin, xMax, thickness) {
    return { cx: (xMin + xMax) / 2, cy, angle: 0, length: xMax - xMin, width: thickness };
  }

  function buildPerpendicularLot({ numSpaces, targetIndex, occupied }) {
    const W = C.PERP_SPACE_WIDTH, D = C.PERP_SPACE_DEPTH, WT = C.WALL_THICKNESS;
    const laneTopY = D + C.LANE_WIDTH;
    const rowWidth = numSpaces * W;
    const rowStartX = -rowWidth / 2;
    const stallCenterX = (i) => rowStartX + (i + 0.5) * W;

    // Side walls only guard the stall depth, not the through-lane above it —
    // the lane stays open on both ends so the car can approach from either side.
    const walls = [
      horizontalWall(-WT / 2, rowStartX - WT, rowStartX + rowWidth + WT, WT),
      verticalWall(rowStartX - WT / 2, -WT, D, WT),
      verticalWall(rowStartX + rowWidth + WT / 2, -WT, D, WT),
    ];

    const stallLines = [];
    for (let i = 1; i < numSpaces; i++) {
      const x = rowStartX + i * W;
      stallLines.push({ x1: x, y1: 0, x2: x, y2: D });
    }

    const obstacleCars = occupied.map((i) => ({
      cx: stallCenterX(i), cy: D / 2, angle: -HALF_PI, length: C.CAR_LENGTH, width: C.CAR_WIDTH,
    }));

    const targetCx = stallCenterX(targetIndex);
    const targetSpace = {
      rect: { cx: targetCx, cy: D / 2, angle: 0, length: W, width: D },
      targetHeading: -HALF_PI,
    };

    const laneCenterY = (D + laneTopY) / 2;

    return {
      kind: 'perp',
      startPose: { x: targetCx - 7.0, y: laneCenterY, theta: 0 },
      targetSpace,
      obstacleCars,
      walls,
      stallLines,
      paveBounds: {
        minX: rowStartX - WT - C.LANE_APPROACH_MARGIN,
        minY: -WT,
        maxX: rowStartX + rowWidth + WT + C.LANE_APPROACH_MARGIN,
        maxY: laneTopY,
      },
      viewCenter: { x: 0, y: laneTopY / 2 },
    };
  }

  function buildParallelLot({ numBays, targetIndex, occupied }) {
    const L = C.PARALLEL_BAY_LENGTH, W = C.PARALLEL_BAY_WIDTH, WT = C.WALL_THICKNESS;
    const laneTopY = W + C.LANE_WIDTH;
    const rowWidth = numBays * L;
    const rowStartX = -rowWidth / 2;
    const bayCenterX = (i) => rowStartX + (i + 0.5) * L;

    // Side walls only guard the bay depth, not the through-lane above it —
    // the lane stays open on both ends so the car can approach from either side.
    const walls = [
      horizontalWall(-WT / 2, rowStartX - WT, rowStartX + rowWidth + WT, WT),
      verticalWall(rowStartX - WT / 2, -WT, W, WT),
      verticalWall(rowStartX + rowWidth + WT / 2, -WT, W, WT),
    ];

    const stallLines = [];
    for (let i = 1; i < numBays; i++) {
      const x = rowStartX + i * L;
      stallLines.push({ x1: x, y1: 0, x2: x, y2: W });
    }

    const obstacleCars = occupied.map((i) => ({
      cx: bayCenterX(i), cy: W / 2, angle: 0, length: C.CAR_LENGTH, width: C.CAR_WIDTH,
    }));

    const targetCx = bayCenterX(targetIndex);
    const targetSpace = {
      rect: { cx: targetCx, cy: W / 2, angle: 0, length: L, width: W },
      targetHeading: 0,
    };

    const laneCenterY = (W + laneTopY) / 2;

    return {
      kind: 'parallel',
      startPose: { x: targetCx + 4.0, y: laneCenterY, theta: 0 },
      targetSpace,
      obstacleCars,
      walls,
      stallLines,
      paveBounds: {
        minX: rowStartX - WT - C.LANE_APPROACH_MARGIN,
        minY: -WT,
        maxX: rowStartX + rowWidth + WT + C.LANE_APPROACH_MARGIN,
        maxY: laneTopY,
      },
      viewCenter: { x: 0, y: laneTopY / 2 },
    };
  }

  // Every new scenario (a new lot kind, or a new difficulty within a kind) is introduced
  // twice in a row: once with extrapolation guide lines, then immediately again without them.
  const LEVELS = [
    { id: 1, title: 'Perpendicular parking', kind: 'perp', numSpaces: 5, targetIndex: 2, occupied: [], showExtrapolation: true },
    { id: 2, title: 'Perpendicular parking, no guides', kind: 'perp', numSpaces: 5, targetIndex: 2, occupied: [], showExtrapolation: false },
    { id: 3, title: 'Perpendicular, tight squeeze', kind: 'perp', numSpaces: 5, targetIndex: 2, occupied: [1, 3], showExtrapolation: true },
    { id: 4, title: 'Perpendicular, tight squeeze, no guides', kind: 'perp', numSpaces: 5, targetIndex: 2, occupied: [1, 3], showExtrapolation: false },
    { id: 5, title: 'Parallel parking', kind: 'parallel', numBays: 3, targetIndex: 1, occupied: [], showExtrapolation: true },
    { id: 6, title: 'Parallel parking, no guides', kind: 'parallel', numBays: 3, targetIndex: 1, occupied: [], showExtrapolation: false },
    { id: 7, title: 'Parallel, tight squeeze', kind: 'parallel', numBays: 3, targetIndex: 1, occupied: [0, 2], showExtrapolation: true },
    { id: 8, title: 'Parallel, tight squeeze, no guides', kind: 'parallel', numBays: 3, targetIndex: 1, occupied: [0, 2], showExtrapolation: false },
  ];

  function buildLevel(id) {
    const spec = LEVELS.find((l) => l.id === id);
    if (!spec) throw new Error('Unknown level id: ' + id);
    const lot = spec.kind === 'perp'
      ? buildPerpendicularLot(spec)
      : buildParallelLot(spec);
    return Object.assign({ id: spec.id, title: spec.title, showExtrapolation: spec.showExtrapolation }, lot);
  }

  return { LEVELS, buildLevel };
})();
