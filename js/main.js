/* ============================================================
   main.js
   Bootstraps everything and runs the main loop.
   ============================================================ */

(() => {
  const sceneCanvas = document.getElementById("scene");
  const vhsCanvas   = document.getElementById("vhs");
  const bootEl      = document.getElementById("boot");
  const coordEl     = document.getElementById("coord");

  Raycaster.init(sceneCanvas);
  VHS.init(vhsCanvas, sceneCanvas);

  /* Hide boot screen on first input — but only after assets ready. */
  let started = false;
  let assetsReady = false;
  function start() {
    if (started || !assetsReady) return;
    started = true;
    bootEl.classList.add("hidden");
    /* Punch a glitch as a "tape engaged" cue. */
    VHS.punch(500, 1.0);
  }
  window.addEventListener("keydown", start, { once: false });
  window.addEventListener("pointerdown", start, { once: false });

  Textures.ready.then((ok) => {
    assetsReady = true;
    /* Tweak the boot prompt to reflect which texture path we ended up on. */
    const pre = bootEl.querySelector("pre");
    if (pre) {
      const reason = Textures.failReason ? ("\n  reason: " + Textures.failReason) : "";
      pre.textContent = pre.textContent.replace(
        "decoding signal........[ ok ]",
        ok
          ? "decoding signal........[ ok ]\n  reels // foliage.......[ ok ]"
          : "decoding signal........[ ok ]\n  reels // foliage.......[ degraded ]" + reason
      );
    }
  });

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    Input.pump();
    Player.update(dt);
    Raycaster.render(now);
    VHS.render(now);

    /* Tape-style HUD readout. */
    const ps = Player.state;
    coordEl.textContent =
      `${String(ps.cx).padStart(2, "0")},${String(ps.cy).padStart(2, "0")} ` +
      Player.DIRS[ps.dir].label;

    /* Reaching the exit triggers a long glitch (placeholder for
       end-of-tape sequence). */
    if (ps.cx === Maze.exit.x && ps.cy === Maze.exit.y && !loop._reached) {
      loop._reached = true;
      VHS.punch(2200, 1.0);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
