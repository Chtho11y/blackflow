/* ============================================================
   player.js
   Strict tile-based movement. The player always rests on integer
   cell coordinates and faces one of 4 directions. Issuing a move
   command starts a smooth tween to the target cell; while that
   tween is running, no further input is accepted.
   This is what enforces "完全封闭路线 / 严格按照迷宫行走".
   ============================================================ */

const Player = (() => {
  /* Direction vectors: 0=N, 1=E, 2=S, 3=W. */
  const DIRS = [
    { x:  0, y: -1, label: "N" },
    { x:  1, y:  0, label: "E" },
    { x:  0, y:  1, label: "S" },
    { x: -1, y:  0, label: "W" },
  ];

  const state = {
    /* Logical (integer) tile coords. */
    cx: Maze.spawn.x,
    cy: Maze.spawn.y,
    /* Initial heading comes from the layout file (defaults to East). */
    dir: (Maze.startDir != null ? Maze.startDir : 1),

    /* Render-space coords used by raycaster (centre of tile + 0.5). */
    x: Maze.spawn.x + 0.5,
    y: Maze.spawn.y + 0.5,
    angle: 0,                  // radians, derived from dir during tween

    /* Tween state. */
    moving: false,
    rotating: false,
    tweenT: 0,
    tweenDur: 0.22,            // seconds — feel free to tune
    tweenFromX: 0, tweenFromY: 0,
    tweenToX: 0,   tweenToY: 0,
    tweenFromA: 0, tweenToA: 0,

    /* Mild head bob during walking — small, to keep the step
       feel without breaking pixel-grid look. */
    bob: 0,
  };

  /* Target angle from a direction index. */
  function angleOf(dir) {
    /* North = -PI/2, East = 0, South = +PI/2, West = PI. */
    return [-Math.PI / 2, 0, Math.PI / 2, Math.PI][dir];
  }
  state.angle = angleOf(state.dir);

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function isBusy() {
    return state.moving || state.rotating;
  }

  /* Try to step forward one cell. Rejected if there's a wall on the
     current cell's facing edge, or the target cell is out of bounds. */
  function stepForward() {
    if (isBusy()) return false;
    const d = DIRS[state.dir];
    if (Maze.hasWall(state.cx, state.cy, state.dir)) return false;
    const tx = state.cx + d.x;
    const ty = state.cy + d.y;
    if (Maze.isWall(tx, ty)) return false;
    state.tweenFromX = state.x;
    state.tweenFromY = state.y;
    state.tweenToX = tx + 0.5;
    state.tweenToY = ty + 0.5;
    state.cx = tx; state.cy = ty;
    state.tweenT = 0;
    state.moving = true;
    return true;
  }

  /* Step backward (without turning) — check the back-facing edge. */
  function stepBackward() {
    if (isBusy()) return false;
    const d = DIRS[state.dir];
    const backDir = (state.dir + 2) % 4;
    if (Maze.hasWall(state.cx, state.cy, backDir)) return false;
    const tx = state.cx - d.x;
    const ty = state.cy - d.y;
    if (Maze.isWall(tx, ty)) return false;
    state.tweenFromX = state.x;
    state.tweenFromY = state.y;
    state.tweenToX = tx + 0.5;
    state.tweenToY = ty + 0.5;
    state.cx = tx; state.cy = ty;
    state.tweenT = 0;
    state.moving = true;
    return true;
  }

  /* Rotate 90 degrees. delta = -1 (left) or +1 (right). */
  function rotate(delta) {
    if (isBusy()) return false;
    const newDir = (state.dir + delta + 4) % 4;
    state.tweenFromA = state.angle;
    /* Keep angle continuous (no flips through 2pi). */
    let target = angleOf(newDir);
    while (target - state.tweenFromA >  Math.PI) target -= Math.PI * 2;
    while (target - state.tweenFromA < -Math.PI) target += Math.PI * 2;
    state.tweenToA = target;
    state.dir = newDir;
    state.tweenT = 0;
    state.rotating = true;
    return true;
  }

  function update(dt) {
    if (state.moving) {
      state.tweenT += dt / state.tweenDur;
      const t = Math.min(1, state.tweenT);
      const e = easeInOut(t);
      state.x = state.tweenFromX + (state.tweenToX - state.tweenFromX) * e;
      state.y = state.tweenFromY + (state.tweenToY - state.tweenFromY) * e;
      state.bob = Math.sin(t * Math.PI) * 1.5;
      if (t >= 1) {
        state.moving = false;
        state.bob = 0;
      }
    } else if (state.rotating) {
      state.tweenT += dt / state.tweenDur;
      const t = Math.min(1, state.tweenT);
      const e = easeInOut(t);
      state.angle = state.tweenFromA + (state.tweenToA - state.tweenFromA) * e;
      if (t >= 1) {
        state.rotating = false;
        state.angle = angleOf(state.dir); // snap to clean axis
      }
    }
  }

  return {
    state,
    DIRS,
    isBusy,
    stepForward,
    stepBackward,
    rotateLeft:  () => rotate(-1),
    rotateRight: () => rotate( 1),
    update,
  };
})();
