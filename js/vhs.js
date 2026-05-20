/* ============================================================
   vhs.js
   Post-processing overlay: RGB chromatic aberration, scanlines,
   noise grain, vertical hold jitter, and rare full-frame
   tracking-error tears. Drawn on the upper canvas with
   mix-blend-mode: screen.
   ============================================================ */

const VHS = (() => {
  let canvas, ctx, scene;
  let W = 0, H = 0;
  let noiseImg = null;

  /* Glitch state: occasional intense tearing for the horror beats. */
  let glitchUntil = 0;
  let glitchIntensity = 0;
  let nextGlitchAt = 0;

  function init(vhsCanvas, sceneCanvas) {
    canvas = vhsCanvas;
    scene = sceneCanvas;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    nextGlitchAt = performance.now() + 4000 + Math.random() * 8000;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = (window.innerWidth  * dpr) | 0;
    H = (window.innerHeight * dpr) | 0;
    canvas.width = W;
    canvas.height = H;
    /* Pre-bake a noise tile we can quickly stamp around. */
    const tile = 256;
    noiseImg = ctx.createImageData(tile, tile);
    for (let i = 0; i < tile * tile; i++) {
      const v = (Math.random() * 255) | 0;
      noiseImg.data[i * 4]     = v;
      noiseImg.data[i * 4 + 1] = v;
      noiseImg.data[i * 4 + 2] = v;
      noiseImg.data[i * 4 + 3] = 26;
    }
  }

  function maybeTriggerGlitch(now) {
    if (now >= nextGlitchAt) {
      glitchUntil = now + 120 + Math.random() * 280;
      glitchIntensity = 0.6 + Math.random() * 0.4;
      nextGlitchAt = now + 5000 + Math.random() * 12000;
    }
  }

  function render(now) {
    if (!ctx) return;
    maybeTriggerGlitch(now);

    ctx.clearRect(0, 0, W, H);
    const inGlitch = now < glitchUntil;
    const t = now * 0.001;

    /* --- 1. Chromatic aberration: redraw scene shifted in R/B. --- */
    /* We tint via globalCompositeOperation so each shifted copy
       contributes only that channel. Subtle at rest, harsh on glitch. */
    const baseShift = 1.5 + Math.sin(t * 1.3) * 0.6;
    const shift = baseShift + (inGlitch ? glitchIntensity * 14 : 0);

    ctx.globalCompositeOperation = "lighter";

    /* Red channel — shifted right. */
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#330000";
    /* Use the already-rendered scene as source, drawn slightly off. */
    ctx.drawImage(scene,  shift, 0, W, H);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(255, 60, 60, 0.18)";
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";
    /* Blue channel — shifted left. */
    ctx.globalAlpha = 0.4;
    ctx.drawImage(scene, -shift, 0, W, H);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(60, 80, 255, 0.12)";
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    /* --- 2. Vertical hold jitter (during glitch). --- */
    if (inGlitch) {
      /* Tear a few horizontal slices and shift them sideways. */
      const slices = 4 + ((Math.random() * 4) | 0);
      for (let i = 0; i < slices; i++) {
        const sy = (Math.random() * H) | 0;
        const sh = 8 + (Math.random() * 40) | 0;
        const dx = ((Math.random() - 0.5) * 80 * glitchIntensity) | 0;
        ctx.drawImage(scene,
          0, sy, W, sh,
          dx, sy, W, sh);
      }
      /* Occasional bright sync band. */
      if (Math.random() < 0.4) {
        const by = (Math.random() * H) | 0;
        ctx.fillStyle = "rgba(180, 255, 200, 0.18)";
        ctx.fillRect(0, by, W, 6);
      }
    }

    /* --- 3. Noise grain — tile the prebaked noise and offset it. --- */
    /* Doing it as ImageData is expensive every frame; use a temp
       canvas + drawImage instead. We bake once into a small canvas. */
    if (!render._noiseCanvas) {
      const c = document.createElement("canvas");
      c.width = noiseImg.width;
      c.height = noiseImg.height;
      c.getContext("2d").putImageData(noiseImg, 0, 0);
      render._noiseCanvas = c;
    }
    const nc = render._noiseCanvas;
    const ox = -((Math.random() * nc.width)  | 0);
    const oy = -((Math.random() * nc.height) | 0);
    ctx.globalAlpha = inGlitch ? 0.55 : 0.22;
    for (let y = oy; y < H; y += nc.height) {
      for (let x = ox; x < W; x += nc.width) {
        ctx.drawImage(nc, x, y);
      }
    }
    ctx.globalAlpha = 1;

    /* --- 4. Scanlines on top of everything. --- */
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

    /* --- 5. A slowly drifting horizontal "tracking" band. --- */
    const bandY = ((t * 60) % (H + 80)) - 40;
    const grad = ctx.createLinearGradient(0, bandY, 0, bandY + 60);
    grad.addColorStop(0,   "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.08)");
    grad.addColorStop(1,   "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, bandY, W, 60);
  }

  /* External hook so events (e.g. encountering something) can punch
     a glitch on demand. */
  function punch(durationMs = 300, intensity = 0.9) {
    const now = performance.now();
    glitchUntil = now + durationMs;
    glitchIntensity = intensity;
  }

  return { init, render, punch };
})();
