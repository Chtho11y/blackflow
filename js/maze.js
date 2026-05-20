/* ============================================================
   maze.js
   Thin-wall maze. We still generate connectivity with a classic
   odd-grid DFS (because it's bullet-proof) but then *fold* the
   thick-wall result into a per-cell wall bitmask:

       cell.walls  =  N | E | S | W
                       1   2   4   8

   Public surface
     Maze.cells[y][x]     — { walls, texN, texE, texS, texW }
     Maze.W / .H          — room-grid size (cells, NOT tiles)
     Maze.spawn / .exit   — { x, y } in cell coords
     Maze.hasWall(cx,cy,side)   — true if that edge blocks travel
     Maze.wallTexAt(cx,cy,side) — texture id (1..3) of that edge
     Maze.isWall(cx,cy)   — legacy: true if cell is out of bounds
                            (kept so old call sites don't break)
   ============================================================ */

const Maze = (() => {
  /* Side bit flags. Order matches Player.DIRS (0=N,1=E,2=S,3=W). */
  const N = 1, E = 2, S = 4, W = 8;
  const SIDES = [N, E, S, W];
  const OPP   = [S, W, N, E];

  /* --- 1. Generate connectivity on an odd-sized scratch grid. --- */
  const RW = 21, RH = 21;                      // raw thick-wall grid
  const raw = Array.from({ length: RH }, () => new Array(RW).fill(1));

  function rawInBounds(x, y) {
    return x > 0 && y > 0 && x < RW - 1 && y < RH - 1;
  }

  function carveRaw(seed) {
    let s = seed >>> 0;
    const rand = () => {
      s = (s * 1103515245 + 12345) >>> 0;
      return s / 0xffffffff;
    };
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = (rand() * (i + 1)) | 0;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const start = [1, 1];
    raw[start[1]][start[0]] = 0;
    const stack = [start];
    const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];

    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const cands = shuffle(dirs.slice()).filter(([dx, dy]) => {
        const nx = cx + dx, ny = cy + dy;
        return rawInBounds(nx, ny) && raw[ny][nx] === 1;
      });
      if (cands.length === 0) { stack.pop(); continue; }
      const [dx, dy] = cands[0];
      raw[cy + dy / 2][cx + dx / 2] = 0;
      raw[cy + dy][cx + dx] = 0;
      stack.push([cx + dx, cy + dy]);
    }
    return rand;
  }

  const rand = carveRaw(7);

  /* --- 2. Fold raw grid into thin-wall cells.
     A "room" sits at raw position (2*cx + 1, 2*cy + 1).
     A wall between two rooms exists iff the edge cell between
     them in `raw` is non-zero. --- */
  const CW = ((RW - 1) / 2) | 0;               // 10
  const CH = ((RH - 1) / 2) | 0;               // 10

  function rawWall(rx, ry) {
    if (rx < 0 || ry < 0 || rx >= RW || ry >= RH) return 1;
    return raw[ry][rx] !== 0;
  }

  /* Random wall texture id with the same weights as before. */
  function pickTexId() {
    const r = rand();
    if (r < 0.10) return 3;       // blackstream — rare
    if (r < 0.35) return 2;       // moss
    return 1;                     // bark
  }

  const cells = Array.from({ length: CH }, (_, cy) =>
    Array.from({ length: CW }, (_, cx) => {
      const rx = cx * 2 + 1;
      const ry = cy * 2 + 1;
      let walls = 0;
      const tex = { N: 0, E: 0, S: 0, W: 0 };

      if (rawWall(rx,     ry - 1)) { walls |= N; tex.N = pickTexId(); }
      if (rawWall(rx + 1, ry    )) { walls |= E; tex.E = pickTexId(); }
      if (rawWall(rx,     ry + 1)) { walls |= S; tex.S = pickTexId(); }
      if (rawWall(rx - 1, ry    )) { walls |= W; tex.W = pickTexId(); }

      return { walls, tex };
    })
  );

  /* Make sure shared edges agree on texture id (N of (x,y) == S of (x,y-1)). */
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const c = cells[y][x];
      if ((c.walls & N) && y > 0) {
        const up = cells[y - 1][x];
        if (up.tex.S) c.tex.N = up.tex.S;
        else          up.tex.S = c.tex.N;
      }
      if ((c.walls & W) && x > 0) {
        const lf = cells[y][x - 1];
        if (lf.tex.E) c.tex.W = lf.tex.E;
        else          lf.tex.E = c.tex.W;
      }
    }
  }

  const spawn = { x: 0,      y: 0      };
  const exit  = { x: CW - 1, y: CH - 1 };

  function inBounds(cx, cy) {
    return cx >= 0 && cy >= 0 && cx < CW && cy < CH;
  }

  /* side = 0..3 (N,E,S,W). True if that edge is a wall (or out of map). */
  function hasWall(cx, cy, side) {
    if (!inBounds(cx, cy)) return true;
    return (cells[cy][cx].walls & SIDES[side]) !== 0;
  }

  function wallTexAt(cx, cy, side) {
    if (!inBounds(cx, cy)) return 1;
    const t = cells[cy][cx].tex;
    return [t.N, t.E, t.S, t.W][side] || 1;
  }

  /* Legacy compatibility: old callers asked "is this tile a wall?".
     In the thin-wall world, players only ever stand in cells, so
     "isWall" really means "is this an out-of-bounds cell?". The
     real edge test is hasWall(). */
  function isWall(cx, cy) {
    return !inBounds(cx, cy);
  }

  return {
    cells,
    W: CW,
    H: CH,
    /* expose the same `width` / `height` names some old code may use */
    width: CW,
    height: CH,
    spawn,
    exit,
    hasWall,
    wallTexAt,
    isWall,
    /* side flag constants for any external consumer */
    SIDE: { N: 0, E: 1, S: 2, W: 3 },
  };
})();
