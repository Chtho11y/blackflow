/* ============================================================
   textures.js
   Wall textures. Procedural fallbacks are tiny (TEX_FALLBACK_SIZE)
   power-of-two squares; once the forest illustration finishes
   loading we replace them with much larger TEX_SIZE squares that
   contain the *whole* image (cover-fit, no cropping to a small
   region). The raycaster reads `tex.width` per sample so it works
   with either size as long as it's still a power of two.

   Three wall ids share the same source image but get different
   recolours so the maze still feels varied:

     id 1 (bark)        — neutral / slightly warm
     id 2 (moss)        — green-pushed
     id 3 (blackstream) — crushed dark + sparse red sparks
   ============================================================ */

/* High-res target size for image-backed walls. Must be a power of two
   (the raycaster wraps with `& (size - 1)`). 256 keeps the whole
   forest illustration legible without busting CPU sampling cost. */
const TEX_SIZE = 256;
/* Smaller size used by the procedural fallbacks (cheap to generate). */
const TEX_FALLBACK_SIZE = 64;

const Textures = (() => {
  /* ---------- procedural fallback helpers ---------- */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  }

  function makeImageData(generator) {
    const img = new ImageData(TEX_FALLBACK_SIZE, TEX_FALLBACK_SIZE);
    generator(img.data);
    return img;
  }

  function setPx(data, x, y, r, g, b, a = 255) {
    const i = (y * TEX_FALLBACK_SIZE + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }

  function valueNoise(rand) {
    const grid = [];
    for (let i = 0; i < 16 * 16; i++) grid.push(rand());
    return (x, y) => {
      const gx = (x / TEX_FALLBACK_SIZE) * 16;
      const gy = (y / TEX_FALLBACK_SIZE) * 16;
      const x0 = Math.floor(gx) & 15;
      const y0 = Math.floor(gy) & 15;
      const x1 = (x0 + 1) & 15;
      const y1 = (y0 + 1) & 15;
      const fx = gx - Math.floor(gx);
      const fy = gy - Math.floor(gy);
      const a = grid[y0 * 16 + x0];
      const b = grid[y0 * 16 + x1];
      const c = grid[y1 * 16 + x0];
      const d = grid[y1 * 16 + x1];
      const ux = fx * fx * (3 - 2 * fx);
      const uy = fy * fy * (3 - 2 * fy);
      return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) +
             c * (1 - ux) * uy + d * ux * uy;
    };
  }

  function proceduralBark() {
    return makeImageData((data) => {
      const r = rng(91);
      const noise = valueNoise(r);
      for (let y = 0; y < TEX_FALLBACK_SIZE; y++) {
        for (let x = 0; x < TEX_FALLBACK_SIZE; x++) {
          const grain = Math.sin(x * 0.6 + noise(x, y) * 8) * 0.5 + 0.5;
          const n = noise(x, y);
          const v = grain * 0.5 + n * 0.5;
          const base = 18 + v * 50;
          const moss = Math.max(0, n - 0.6) * 1.5;
          setPx(data, x, y,
            (base * 0.6) | 0,
            (base * 0.85 + moss * 60) | 0,
            (base * 0.55) | 0);
        }
      }
    });
  }

  function proceduralMoss() {
    return makeImageData((data) => {
      const r = rng(417);
      const noise = valueNoise(r);
      for (let y = 0; y < TEX_FALLBACK_SIZE; y++) {
        for (let x = 0; x < TEX_FALLBACK_SIZE; x++) {
          const n = noise(x, y);
          const n2 = noise(x * 1.3 + 11, y * 1.3 + 7);
          const v = Math.pow(n * 0.6 + n2 * 0.4, 1.4);
          setPx(data, x, y,
            (22 + v * 40) | 0,
            (40 + v * 110) | 0,
            (30 + v * 50) | 0);
        }
      }
    });
  }

  function proceduralBlackstream() {
    return makeImageData((data) => {
      const r = rng(2718);
      const noise = valueNoise(r);
      for (let y = 0; y < TEX_FALLBACK_SIZE; y++) {
        for (let x = 0; x < TEX_FALLBACK_SIZE; x++) {
          const flow = Math.sin((y + noise(x, y) * 16) * 0.5) * 0.5 + 0.5;
          const v = flow * 0.7 + noise(x, y) * 0.3;
          const c = v * 30;
          const spark = (r() < 0.0006) ? 180 : 0;
          setPx(data, x, y, (c + spark) | 0, c | 0, (c + 6) | 0);
        }
      }
    });
  }

  function proceduralGround() {
    return makeImageData((data) => {
      const r = rng(53);
      const noise = valueNoise(r);
      for (let y = 0; y < TEX_FALLBACK_SIZE; y++) {
        for (let x = 0; x < TEX_FALLBACK_SIZE; x++) {
          const n = noise(x, y);
          const v = 12 + n * 28;
          setPx(data, x, y, (v * 0.5) | 0, (v * 0.7) | 0, (v * 0.45) | 0);
        }
      }
    });
  }

  /* ---------- image-based whole-picture wall ----------
     Build a TEX_SIZE x TEX_SIZE wall texture that contains the
     *whole* source image, scaled with object-fit: cover semantics
     (fill the square, centre-crop the overflowing axis). The result
     is then run through an optional per-pixel `recolor` callback
     so the same source image can power three differently-tinted
     wall variants.

     We do NOT mirror or otherwise force horizontal seamlessness:
     each wall slab is one cell wide, so its U coord runs 0..1
     exactly across the slab and the seam is hidden inside the
     wall corner. */
  function buildWholeImageTex(img, recolor) {
    const tmp = document.createElement("canvas");
    tmp.width = TEX_SIZE;
    tmp.height = TEX_SIZE;
    const tctx = tmp.getContext("2d");
    /* High-quality downscale once at load time -- raycaster will then
       sample with nearest-neighbour anyway, so this gives us a clean
       starting point instead of jagged single-pixel aliasing. */
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = "high";

    /* object-fit: cover. Pick the axis we have to crop. */
    const srcRatio = img.width / img.height;
    let sx, sy, sw, sh;
    if (srcRatio > 1) {
      /* Wider than tall -- crop horizontally, keep full height. */
      sh = img.height;
      sw = img.height;
      sx = (img.width - sw) * 0.5;
      sy = 0;
    } else {
      /* Taller than wide -- crop vertically, keep full width. */
      sw = img.width;
      sh = img.width;
      sx = 0;
      sy = (img.height - sh) * 0.5;
    }
    tctx.drawImage(img, sx, sy, sw, sh, 0, 0, TEX_SIZE, TEX_SIZE);

    const out = tctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
    if (recolor) {
      const d = out.data;
      for (let i = 0; i < d.length; i += 4) {
        const o = recolor(d[i], d[i + 1], d[i + 2], i);
        d[i]     = o[0] | 0;
        d[i + 1] = o[1] | 0;
        d[i + 2] = o[2] | 0;
      }
    }
    return out;
  }

  /* Tonemap helpers used by the three variants. */
  function recolorBark(r, g, b) {
    /* Slight warm push, keep mid contrast — this is the "default" wall. */
    return [
      Math.min(255, r * 1.05),
      Math.min(255, g * 1.00),
      Math.min(255, b * 0.92),
    ];
  }
  function recolorMoss(r, g, b) {
    /* Damp shadowed moss: pull everything down ~30%, nudge green up
       just slightly, lift midtones with a faint cool tint. The point
       is to *differ* from bark without screaming "fluorescent green". */
    const lum = (r * 0.299 + g * 0.587 + b * 0.114);
    /* Target: a desaturated mossy olive. */
    const tr = lum * 0.55;
    const tg = lum * 0.78 + 4;
    const tb = lum * 0.50 + 2;
    /* Blend the source pixel toward that target so we keep some of
       the original detail/variation. */
    const k = 0.65; // 0 = original, 1 = pure target
    return [
      r * (1 - k) + tr * k,
      g * (1 - k) + tg * k,
      b * (1 - k) + tb * k,
    ];
  }
  function recolorBlackstream(r, g, b, i) {
    /* Crush dark, very faint cool tint, occasional dim red ember. */
    const k = 0.45;
    let nr = r * k;
    let ng = g * k;
    let nb = b * k + 4;
    /* Sparks: ~0.05% of pixels become a dim red eye. Deterministic via index. */
    if (((i * 2654435761) >>> 0) % 1900 === 0) {
      nr = 110; ng = 8; nb = 8;
    }
    return [nr, ng, nb];
  }

  /* ---------- start with procedural defaults so render works
       on frame 0 even before the image finishes loading ---------- */
  const tex = {
    bark:        proceduralBark(),
    moss:        proceduralMoss(),
    blackstream: proceduralBlackstream(),
    ground:      proceduralGround(),
  };

  /* ---------- async image load + slice ---------- */
  let failReason = null;
  const ready = new Promise((resolve) => {
    console.info("[Textures] page protocol:", location.protocol, "href:", location.href);
    const img = new Image();
    /* Safe to leave unset for same-origin (incl. http://localhost), and harmless
       for file://. Helps if you ever serve from a different origin. */
    try { img.crossOrigin = "anonymous"; } catch (_) {}
    img.onload = () => {
      console.info("[Textures] image loaded:", img.width, "x", img.height);
      try {
        /* Build three full-image wall variants. Same source picture,
           three different colour grades. Because every wall slab is
           one cell wide and the U coord is 0..1 across that slab,
           you'll see the *whole* forest illustration on each wall. */
        tex.bark        = buildWholeImageTex(img, recolorBark);
        tex.moss        = buildWholeImageTex(img, recolorMoss);
        tex.blackstream = buildWholeImageTex(img, recolorBlackstream);
        resolve(true);
      } catch (e) {
        /* Fallback: keep procedural textures. Common cause is
           getImageData() blocked by CORS when running off file://. */
        failReason = (location.protocol === "file:")
          ? "file:// blocks getImageData (start a local HTTP server)"
          : ("slice error: " + (e && e.message || e));
        console.warn("[Textures] image slice failed, using procedural fallback:", e);
        resolve(false);
      }
    };
    img.onerror = (e) => {
      failReason = "image not found at asset/forest_dense_tile.png";
      console.warn("[Textures] image load error:", e);
      resolve(false);
    };
    img.src = "asset/forest_dense_tile.png";
  });

  return {
    SIZE: TEX_SIZE,
    ready,
    get failReason() { return failReason; },
    /* Lookup by wall id (set in maze.js). */
    byId(id) {
      switch (id) {
        case 1: return tex.bark;
        case 2: return tex.moss;
        case 3: return tex.blackstream;
        default: return tex.bark;
      }
    },
    get bark()        { return tex.bark; },
    get moss()        { return tex.moss; },
    get blackstream() { return tex.blackstream; },
    get ground()      { return tex.ground; },
  };
})();
