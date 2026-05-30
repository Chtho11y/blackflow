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
  /* Side bit flags. Order matches Player.DIRS (0=N,1=E,2=S,3=W).
     These are the *internal* bit values. */
  const N = 1, E = 2, S = 4, W = 8;
  const SIDES = [N, E, S, W];
  const OPP   = [S, W, N, E];

  /* A small deterministic PRNG so wall-texture choices stay stable
     between reloads (we also use it for the DFS fallback). */
  function makeRand(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1103515245 + 12345) >>> 0;
      return s / 0xffffffff;
    };
  }

  /* Random wall texture id. 1=bark, 2=moss, 3=blackstream (rare). */
  function makeTexPicker(rand) {
    return () => {
      const r = rand();
      if (r < 0.10) return 3;
      if (r < 0.35) return 2;
      return 1;
    };
  }

  /* ============================================================
     Path A — hand-authored layout from window.MAZE_LAYOUT.
     The file format uses a *different* bitmask convention than our
     internal one, so we translate per side. We also enforce shared-
     edge consistency by OR-ing both halves of every shared edge,
     and force the outer border to be solid wall.
     ============================================================ */
  function buildFromLayout(layout) {
    const rand = makeRand(7);
    const pickTexId = makeTexPicker(rand);

    const CW = layout.width  | 0;
    const CH = layout.height | 0;
    const bits = layout.bits || { N: 1, S: 2, W: 4, E: 8 };

    /* Sanity: matrix dimensions. */
    if (!Array.isArray(layout.matrix) || layout.matrix.length !== CH) {
      throw new Error("MAZE_LAYOUT.matrix row count != height");
    }

    /* Step 1: read every cell's mask, translating external bits to
       internal (N=1,E=2,S=4,W=8). */
    const cells = Array.from({ length: CH }, (_, y) =>
      Array.from({ length: CW }, (_, x) => {
        const row = layout.matrix[y];
        if (!row || row.length !== CW) {
          throw new Error(`MAZE_LAYOUT.matrix row ${y} has wrong length`);
        }
        const ext = row[x] | 0;
        let walls = 0;
        if (ext & bits.N) walls |= N;
        if (ext & bits.E) walls |= E;
        if (ext & bits.S) walls |= S;
        if (ext & bits.W) walls |= W;
        return { walls, tex: { N: 0, E: 0, S: 0, W: 0 } };
      })
    );

    /* Step 2: reconcile shared edges by OR (any side claiming a wall
       wins, per user's rule). Also force outer border. */
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const c = cells[y][x];

        /* North neighbor */
        if (y > 0) {
          const up = cells[y - 1][x];
          if ((c.walls & N) || (up.walls & S)) {
            c.walls  |= N;
            up.walls |= S;
          }
        } else {
          c.walls |= N; // outer border
        }

        /* West neighbor */
        if (x > 0) {
          const lf = cells[y][x - 1];
          if ((c.walls & W) || (lf.walls & E)) {
            c.walls  |= W;
            lf.walls |= E;
          }
        } else {
          c.walls |= W;
        }

        /* South / East borders (interior pairs already covered above
           when their neighbor is iterated). */
        if (y === CH - 1) c.walls |= S;
        if (x === CW - 1) c.walls |= E;
      }
    }

    /* Step 3: assign textures, keeping shared edges consistent. */
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const c = cells[y][x];
        if (c.walls & N) {
          if (y > 0 && cells[y - 1][x].tex.S) c.tex.N = cells[y - 1][x].tex.S;
          else {
            c.tex.N = pickTexId();
            if (y > 0) cells[y - 1][x].tex.S = c.tex.N;
          }
        }
        if (c.walls & W) {
          if (x > 0 && cells[y][x - 1].tex.E) c.tex.W = cells[y][x - 1].tex.E;
          else {
            c.tex.W = pickTexId();
            if (x > 0) cells[y][x - 1].tex.E = c.tex.W;
          }
        }
        if (c.walls & S) {
          if (y < CH - 1 && cells[y + 1][x].tex.N) c.tex.S = cells[y + 1][x].tex.N;
          else if (!c.tex.S) c.tex.S = pickTexId();
        }
        if (c.walls & E) {
          if (x < CW - 1 && cells[y][x + 1].tex.W) c.tex.E = cells[y][x + 1].tex.W;
          else if (!c.tex.E) c.tex.E = pickTexId();
        }
      }
    }

    /* spawn / exit. The file uses [row, col] = [y, x]. */
    const [sy, sx] = layout.start;
    const [ey, ex] = layout.end;
    const spawn = { x: sx | 0, y: sy | 0 };
    const exit  = { x: ex | 0, y: ey | 0 };
    const startDir = (layout.startDir | 0) & 3;

    return { cells, CW, CH, spawn, exit, startDir };
  }

  /* ============================================================
     Path B — DFS fallback (the original generator). Used only if
     no MAZE_LAYOUT is present on window.
     ============================================================ */
  function buildFromDFS(seed) {
    const RW = 21, RH = 21;
    const raw = Array.from({ length: RH }, () => new Array(RW).fill(1));
    const rand = makeRand(seed);
    const pickTexId = makeTexPicker(rand);

    function rawInBounds(x, y) {
      return x > 0 && y > 0 && x < RW - 1 && y < RH - 1;
    }
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

    const CW = ((RW - 1) / 2) | 0;
    const CH = ((RH - 1) / 2) | 0;
    function rawWall(rx, ry) {
      if (rx < 0 || ry < 0 || rx >= RW || ry >= RH) return 1;
      return raw[ry][rx] !== 0;
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
    /* Reconcile shared-edge texture choice. */
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

    return {
      cells, CW, CH,
      spawn: { x: 0, y: 0 },
      exit:  { x: CW - 1, y: CH - 1 },
      startDir: 1,
    };
  }

  /* ============================================================
     Multi-zone system: 5 interconnected zones forming a loop
     ============================================================ */
  const NUM_ZONES = 5;
  const zones = [];
  
  /* Build the base layout once and clone for each zone */
  const baseLayout = (typeof window !== "undefined" && window.MAZE_LAYOUT)
    ? buildFromLayout(window.MAZE_LAYOUT)
    : buildFromDFS(7);

  /* Item definitions - placed at specific coordinates per zone */
  const zoneItems = [
    { zone: 1, x: 0, y: 4, itemId: "axe" },
  ];

  /* ============================================================
     TELEPORT DEFINITIONS (TESTING ONLY)
     ============================================================
     When player tries to move in fromDir direction at (fromX, fromY)
     in fromZone, they are teleported to (toX, toY) in toZone facing toDir.

     Directions: 0=N, 1=E, 2=S, 3=W

     Teleport entry fields:
       - fromZone, fromX, fromY: Origin position
       - fromDir: Direction player must be facing (0=N, 1=E, 2=S, 3=W)
       - toZone, toX, toY: Destination position
       - toDir: Direction player faces after teleport
       - requiredItem: Item ID required to activate (null = no item required)
     ============================================================ */
  const teleports = [
    /* TEST: Zone 1 (2,5) East → Zone 2 (1,1) North (requires 'axe') */
    { fromZone: 1, fromX: 2, fromY: 5, fromDir: 1, toZone: 2, toX: 1, toY: 1, toDir: 0, requiredItem: "axe" },
  ];

  /* Find teleport at (zone, x, y, dir). Returns null if none.
     If hasItemFn is provided, also checks requiredItem. */
  function getTeleport(zone, x, y, dir, hasItemFn) {
    const tp = teleports.find(t =>
      t.fromZone === zone && t.fromX === x && t.fromY === y && t.fromDir === dir
    );
    if (!tp) return null;
    if (tp.requiredItem && hasItemFn && !hasItemFn(tp.requiredItem)) return null;
    return tp;
  }

  /* Execute teleport: returns { cx, cy, x, y, dir, zoneId } or null */
  function executeTeleport(teleport) {
    currentZoneIndex = teleport.toZone - 1;
    const targetZone = zones[teleport.toZone - 1];
    return {
      cx: teleport.toX,
      cy: teleport.toY,
      x: teleport.toX + 0.5,
      y: teleport.toY + 0.5,
      dir: teleport.toDir,
      zoneId: teleport.toZone
    };
  }

  /* Create 5 zones with identical layout */
  for (let z = 0; z < NUM_ZONES; z++) {
    /* Deep clone the cells */
    const clonedCells = baseLayout.cells.map(row => 
      row.map(cell => ({ 
        walls: cell.walls, 
        tex: { ...cell.tex } 
      }))
    );
    
    zones.push({
      cells: clonedCells,
      CW: baseLayout.CW,
      CH: baseLayout.CH,
      spawn: { ...baseLayout.spawn },
      exit: { ...baseLayout.exit },
      startDir: baseLayout.startDir,
      zoneId: z + 1
    });
  }

  /* Collect items that exist in current zone */
  function getZoneItems(zoneId) {
    return zoneItems.filter(z => z.zone === zoneId);
  }

  /* Check if a cell has an item and return it */
  function getItemAt(cx, cy, zoneId) {
    const item = zoneItems.find(z => z.zone === zoneId && z.x === cx && z.y === cy);
    return item ? item.itemId : null;
  }

  /* Mark item as collected (remove from zone) */
  const collectedItems = new Set();
  function collectItem(cx, cy, zoneId) {
    const key = `${zoneId},${cx},${cy}`;
    if (collectedItems.has(key)) return null;
    const itemId = getItemAt(cx, cy, zoneId);
    if (itemId) {
      collectedItems.add(key);
      return itemId;
    }
    return null;
  }

  /* Current zone state */
  let currentZoneIndex = 0;
  
  function getCurrentZone() {
    return zones[currentZoneIndex];
  }

  function getCurrentZoneId() {
    return currentZoneIndex + 1;
  }

  function getTotalZones() {
    return NUM_ZONES;
  }

  /* Advance to next zone (wraps around from 5 to 1) */
  function advanceZone() {
    currentZoneIndex = (currentZoneIndex + 1) % NUM_ZONES;
    return getCurrentZoneId();
  }

  /* Reset to zone 1 */
  function resetToZone1() {
    currentZoneIndex = 0;
  }

  /* Teleport to a specific zone (1-5). Returns spawn info. */
  function teleportToZone(zoneId) {
    const z = ((zoneId - 1) % NUM_ZONES + NUM_ZONES) % NUM_ZONES;
    currentZoneIndex = z;
    const zone = getCurrentZone();
    return {
      x: zone.spawn.x,
      y: zone.spawn.y,
      dir: zone.startDir,
      zoneId: getCurrentZoneId()
    };
  }

  /* --- Current zone properties --- */
  const cells     = getCurrentZone().cells;
  const CW        = getCurrentZone().CW;
  const CH        = getCurrentZone().CH;
  const spawn     = getCurrentZone().spawn;
  const exit      = getCurrentZone().exit;
  const startDir  = getCurrentZone().startDir;

  function inBounds(cx, cy) {
    return cx >= 0 && cy >= 0 && cx < CW && cy < CH;
  }

  /* side = 0..3 (N,E,S,W). True if that edge is a wall (or out of map). */
  function hasWall(cx, cy, side) {
    if (!inBounds(cx, cy)) return true;
    return (getCurrentZone().cells[cy][cx].walls & SIDES[side]) !== 0;
  }

  function wallTexAt(cx, cy, side) {
    if (!inBounds(cx, cy)) return 1;
    const t = getCurrentZone().cells[cy][cx].tex;
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
    width: CW,
    height: CH,
    spawn,
    exit,
    startDir,
    hasWall,
    wallTexAt,
    isWall,
    SIDE: { N: 0, E: 1, S: 2, W: 3 },
    /* Multi-zone API */
    getCurrentZoneId,
    getTotalZones,
    advanceZone,
    resetToZone1,
    teleportToZone,
    zones,
    /* Item API */
    getItemAt,
    collectItem,
    /* Teleport API */
    getTeleport,
    executeTeleport,
    teleports
  };
})();
