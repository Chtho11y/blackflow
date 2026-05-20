/* ============================================================
   raycaster.js
   Thin-wall DDA raycasting. Walls live on the *edges* between
   cells, not on cells themselves, and have a configurable
   thickness (WALL_THICKNESS) so they read as slabs rather than
   full tiles. Renders into a low-res ImageData buffer for that
   chunky pixel look. Heavy fog falloff keeps things creepy.
   ============================================================ */

const Raycaster = (() => {
  const FOV = Math.PI / 3;             // 60° — classic
  const MAX_DEPTH = 6;                 // rays don't need to go far when fog kills them fast
  const FOG_START = 0.4;               // fog begins almost immediately
  const FOG_END = 2.2;                 // fully black just past 2 tiles
  const FOG_CURVE = 1.8;               // >1 = darken faster near the end

  /* Thin-wall thickness in world units (1 unit = 1 cell wide).
     0.10 means the wall takes up 10% of a cell, the room 90%. */
  const WALL_THICKNESS = 0.10;
  const HALF_WT = WALL_THICKNESS * 0.5;

  let canvas, ctx, W, H;
  let frame, frameData;                // ImageData buffer + Uint8Clamped

  function init(sceneCanvas) {
    canvas = sceneCanvas;
    ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = false;
    W = canvas.width;
    H = canvas.height;
    frame = ctx.createImageData(W, H);
    frameData = frame.data;
  }

  /* Tonemap: slight green push, dim shadows — black-stream forest.
     Fog applied with a curve so the falloff is gentle up close and
     then crushes hard into pure black. */
  function tint(r, g, b, fog) {
    const f = Math.pow(Math.min(1, Math.max(0, fog)), FOG_CURVE);
    const nf = 1 - f;
    /* Ambient floor color the world fades into — near-black with the
       faintest dead-green ember. Set to 0,0,0 for absolute pitch. */
    const fr = 2 * f;
    const fg = 4 * f;
    const fb = 3 * f;
    return [
      (r * nf + fr) | 0,
      (g * nf + fg) | 0,
      (b * nf + fb) | 0,
    ];
  }

  function setPixel(x, y, r, g, b) {
    const i = (y * W + x) * 4;
    frameData[i]     = r;
    frameData[i + 1] = g;
    frameData[i + 2] = b;
    frameData[i + 3] = 255;
  }

  /* Sample a wall texture at (u, v) in [0..1).
     Each texture knows its own `width`/`height` (must be power of two)
     so this works for the 64x64 procedural fallbacks and the larger
     image-backed textures alike. */
  function sampleTex(tex, u, v) {
    const w = tex.width;
    const h = tex.height;
    const x = ((u * w) | 0) & (w - 1);
    const y = ((v * h) | 0) & (h - 1);
    const i = (y * w + x) * 4;
    return [tex.data[i], tex.data[i + 1], tex.data[i + 2]];
  }

  function render(time) {
    const ps = Player.state;
    const baseAngle = ps.angle;
    /* Subtle vertical bob shifts the horizon a couple pixels. */
    const horizon = (H * 0.5) + ps.bob;

    /* --- 1. Sky (canopy): pitch black with a per-pixel ±2 noise so it
       doesn't read as a flat dead colour under the VHS post-pass. --- */
    for (let y = 0; y < (horizon | 0); y++) {
      for (let x = 0; x < W; x++) {
        /* Cheap deterministic hash → tiny grain. Stays put across frames
           so we don't compete with the VHS layer's own animated noise. */
        const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
        const n = (h & 3);                     // 0..3
        setPixel(x, y, n, n, n);
      }
    }

    /* --- 2. Floor: textured ground using proper raycaster floor-casting.
       For each scan-line below the horizon we know the world distance
       to that row, so we can sample the ground texture in world space.
       Result: as the player walks forward the floor scrolls *under* them
       (option B), and turning rotates it correctly. --- */
    const groundTex = Textures.ground;
    const gW = groundTex.width, gH = groundTex.height;
    const gData = groundTex.data;
    const cosA = Math.cos(baseAngle);
    const sinA = Math.sin(baseAngle);
    const tanHalfFov = Math.tan(FOV / 2);

    /* World-space ray dirs for the leftmost (col=-1) and rightmost (col=+1)
       camera columns. We linearly interpolate between them per column. */
    const rayDirL_x = cosA - sinA * tanHalfFov;
    const rayDirL_y = sinA + cosA * tanHalfFov;
    const rayDirR_x = cosA + sinA * tanHalfFov;
    const rayDirR_y = sinA - cosA * tanHalfFov;

    /* Camera height in cell units. 0.5 puts us "eye level" but for floor
       casting what matters is the player's distance *above* the floor;
       smaller value = farther floor pushed up (looks more grounded). */
    const camZ = 0.5 * H;

    for (let y = (horizon | 0); y < H; y++) {
      /* Vertical distance from the horizon, in screen pixels. */
      const p = y - horizon;
      if (p <= 0) continue;
      /* World distance to the floor strip drawn on this row. */
      const rowDist = camZ / p;

      /* Step in world units per screen column. */
      const stepX = rowDist * (rayDirR_x - rayDirL_x) / W;
      const stepY = rowDist * (rayDirR_y - rayDirL_y) / W;

      /* World position of the left edge of this row. */
      let floorX = ps.x + rowDist * rayDirL_x;
      let floorY = ps.y + rowDist * rayDirL_y;

      /* Same fog curve as the walls so the join at the wall base is invisible. */
      const fog = Math.min(1, Math.max(0,
        (rowDist - FOG_START) / (FOG_END - FOG_START)));
      const f = Math.pow(fog, FOG_CURVE);
      const nf = 1 - f;

      for (let x = 0; x < W; x++) {
        /* Wrap to texture. The blackstream tile is 64x64 power-of-two,
           so `& (size-1)` is the cheap modulo. TILE controls how many
           world units one texture repeat covers — larger = bigger,
           more visible patches of "stream" under your feet. */
        const TILE = 2.0; // world-units per texture repeat
        const u = floorX / TILE;
        const v = floorY / TILE;
        const tx = (((u - Math.floor(u)) * gW) | 0) & (gW - 1);
        const ty = (((v - Math.floor(v)) * gH) | 0) & (gH - 1);
        const idx = (ty * gW + tx) * 4;
        /* Source blackstream texture is intentionally near-black, so
           we *boost* it here — otherwise fog crushes the floor into
           solid pitch and you can't read the ground at all. Combined
           with the fog blend below, the floor still goes pure-black
           past ~2 tiles, just like the walls. */
        const FLOOR_GAIN = 1.6;
        const FLOOR_BIAS = 6;     // lifted black point so detail survives
        const r0 = Math.min(255, gData[idx]     * FLOOR_GAIN + FLOOR_BIAS);
        const g0 = Math.min(255, gData[idx + 1] * FLOOR_GAIN + FLOOR_BIAS);
        const b0 = Math.min(255, gData[idx + 2] * FLOOR_GAIN + FLOOR_BIAS);

        /* Fade to ambient floor (near-pitch with faint dead-green). */
        const r = (r0 * nf + 2 * f) | 0;
        const g = (g0 * nf + 4 * f) | 0;
        const b = (b0 * nf + 3 * f) | 0;
        setPixel(x, y, r, g, b);

        floorX += stepX;
        floorY += stepY;
      }
    }

    /* --- 2. Walls: cast one ray per column (thin-wall DDA). --- */
    const zBuffer = new Float32Array(W);

    for (let col = 0; col < W; col++) {
      const cameraX = (2 * col) / W - 1;          // -1..1
      const rayAngle = baseAngle + Math.atan(cameraX * Math.tan(FOV / 2));
      const rdx = Math.cos(rayAngle);
      const rdy = Math.sin(rayAngle);

      /* DDA setup. mapX/mapY = current cell (room) coords. */
      let mapX = Math.floor(ps.x);
      let mapY = Math.floor(ps.y);

      const deltaX = Math.abs(1 / (rdx || 1e-9));
      const deltaY = Math.abs(1 / (rdy || 1e-9));

      let stepX, stepY, sideX, sideY;
      if (rdx < 0) { stepX = -1; sideX = (ps.x - mapX) * deltaX; }
      else         { stepX =  1; sideX = (mapX + 1.0 - ps.x) * deltaX; }
      if (rdy < 0) { stepY = -1; sideY = (ps.y - mapY) * deltaY; }
      else         { stepY =  1; sideY = (mapY + 1.0 - ps.y) * deltaY; }

      /* When we cross a grid line, identify which edge of the cell
         we are *leaving*. side index follows Maze.SIDE: 0=N,1=E,2=S,3=W. */
      let hit = 0;
      let hitSide = 0;       // edge index 0..3
      let hitAxis = 0;       // 0 = vertical grid line (x=k), 1 = horizontal
      let perp = 0;          // perpendicular distance to wall front face
      let wallTex = 1;

      let rawDist = 0;       // distance to the grid line itself

      while (!hit) {
        /* Advance to the nearer of the two upcoming grid lines. */
        if (sideX < sideY) {
          rawDist = sideX;
          if (rawDist > MAX_DEPTH) break;
          /* Cell we are leaving is (mapX, mapY); edge is its E or W. */
          hitSide = (stepX > 0) ? 1 : 3;          // E or W
          hitAxis = 0;
          if (Maze.hasWall(mapX, mapY, hitSide)) {
            /* Front face of the wall slab is HALF_WT in front of the grid
               line, measured along the ray's projected horizontal axis. */
            perp = rawDist - HALF_WT * deltaX;
            if (perp < 0) perp = 0;               // standing inside the slab
            wallTex = Maze.wallTexAt(mapX, mapY, hitSide);
            hit = 1;
            break;
          }
          sideX += deltaX;
          mapX  += stepX;
        } else {
          rawDist = sideY;
          if (rawDist > MAX_DEPTH) break;
          hitSide = (stepY > 0) ? 2 : 0;          // S or N
          hitAxis = 1;
          if (Maze.hasWall(mapX, mapY, hitSide)) {
            perp = rawDist - HALF_WT * deltaY;
            if (perp < 0) perp = 0;
            wallTex = Maze.wallTexAt(mapX, mapY, hitSide);
            hit = 1;
            break;
          }
          sideY += deltaY;
          mapY  += stepY;
        }
      }

      if (!hit) { zBuffer[col] = MAX_DEPTH; continue; }

      /* Fish-eye correction: project distance onto camera plane. */
      const corrected = Math.max(0.0001, perp * Math.cos(rayAngle - baseAngle));
      zBuffer[col] = corrected;

      const lineH = (H / corrected) | 0;
      const drawStart = Math.max(0, (-lineH / 2 + horizon) | 0);
      const drawEnd   = Math.min(H - 1, (lineH / 2 + horizon) | 0);

      /* Texture U from the actual hit point on the wall slab front face. */
      const hitX = ps.x + perp * rdx;
      const hitY = ps.y + perp * rdy;
      let texU;
      if (hitAxis === 0) {
        /* Vertical wall — U runs along Y. */
        texU = hitY - Math.floor(hitY);
        if (hitSide === 3) texU = 1 - texU;       // flip W faces
      } else {
        /* Horizontal wall — U runs along X. */
        texU = hitX - Math.floor(hitX);
        if (hitSide === 0) texU = 1 - texU;       // flip N faces
      }

      const tex = Textures.byId(wallTex);
      const fog = Math.min(1, Math.max(0,
        (corrected - FOG_START) / (FOG_END - FOG_START)));
      /* Side shading — N/S walls slightly darker than E/W. */
      const sideShade = (hitAxis === 1) ? 0.72 : 1.0;

      for (let y = drawStart; y <= drawEnd; y++) {
        const v = (y - (horizon - lineH / 2)) / lineH;
        const [tr, tg, tb] = sampleTex(tex, texU, v);
        const [r, g, b] = tint(
          tr * sideShade, tg * sideShade, tb * sideShade, fog);
        setPixel(col, y, r, g, b);
      }
    }

    /* --- 3. Subtle screen-space scanline darken to add depth. --- */
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        frameData[i]     = (frameData[i]     * 0.88) | 0;
        frameData[i + 1] = (frameData[i + 1] * 0.88) | 0;
        frameData[i + 2] = (frameData[i + 2] * 0.88) | 0;
      }
    }

    ctx.putImageData(frame, 0, 0);
    return zBuffer;
  }

  return { init, render };
})();
