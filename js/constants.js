window.Sim = window.Sim || {};

Sim.Constants = (function () {
  const DEG = Math.PI / 180;

  return {
    // Physics
    MAX_SPEED_FWD: 2.5,      // m/s
    MAX_SPEED_REV: 1.5,      // m/s
    ACCEL: 1.5,              // m/s^2
    REVERSE_ACCEL: 1.0,      // m/s^2
    BRAKE_DECEL: 3.0,        // m/s^2
    COAST_DECEL: 0.8,        // m/s^2
    MAX_STEER: 35 * DEG,     // rad
    STEER_RATE: 90 * DEG,    // rad/s

    // Car geometry
    CAR_LENGTH: 4.70,        // m
    CAR_WIDTH: 1.85,         // m
    WHEELBASE: 2.75,         // m
    REAR_OVERHANG: 0.95,     // m
    FRONT_OVERHANG: 1.00,    // m
    TRACK_WIDTH: 1.60,       // m
    WHEEL_LENGTH: 0.62,      // m, tire diameter (e.g. a 205/55R16)
    WHEEL_WIDTH: 0.205,      // m, tire width

    // Lot geometry
    LANE_WIDTH: 6.5,             // m
    PERP_SPACE_WIDTH: 2.5,       // m
    PERP_SPACE_DEPTH: 5.0,       // m
    PARALLEL_BAY_LENGTH: 6.0,    // m
    PARALLEL_BAY_WIDTH: 2.5,     // m
    WALL_THICKNESS: 0.2,         // m
    LANE_APPROACH_MARGIN: 8.0,   // m, extra pavement drawn beyond the stall row so there's visible room to approach from

    // Rendering
    PX_PER_METER: 30,
    CANVAS_WIDTH: 1000,
    CANVAS_HEIGHT: 700,

    // Tire path extrapolation
    T_PREVIEW: 3.0,           // s
    STRAIGHT_STEER_EPS: 0.5 * DEG,
    MOVING_EPS: 0.05,         // m/s

    // Success tolerance
    POSITION_TOLERANCE: 0.35, // m
    HEADING_TOLERANCE: 8 * DEG,

    // Misc
    DEG: DEG,
    MAX_DT: 0.05, // s
  };
})();
