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
  Minimap.init();
  Dialogue.init();

  /* Hide boot screen on first input — but only after assets ready. */
  let started = false;
  let assetsReady = false;
  function start() {
    if (started) return;
    started = true;
    bootEl.classList.add("hidden");
    VHS.punch(500, 1.0);
  }
  window.addEventListener("keydown", start, { once: false });
  window.addEventListener("pointerdown", start, { once: false });

  Textures.ready.then((ok) => {
    assetsReady = true;
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
  let lastCellKey = "";
  
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    Input.pump();
    Player.update(dt);
    
    const ps = Player.state;
    const cellKey = `${ps.cx},${ps.cy}`;
    
    /* Check for dialogue events when player enters a new cell */
    if (!Dialogue.isActive()) {
      if (cellKey !== lastCellKey && Dialogue.isDialogueCell(ps.cx, ps.cy)) {
        Dialogue.show(ps.cx, ps.cy);
      }
    }
    
    lastCellKey = cellKey;
    
    Minimap.update();
    Raycaster.render(now);
    VHS.render(now);

    /* Tape-style HUD readout. */
    coordEl.textContent =
      `${String(ps.cx).padStart(2, "0")},${String(ps.cy).padStart(2, "0")} ` +
      Player.DIRS[ps.dir].label;

    /* Reaching the exit triggers a long glitch (placeholder for
       end-of-tape sequence). */
    if (ps.cx === Maze.exit.x && ps.cy === Maze.exit.y && !loop._reached) {
      loop._reached = true;
      VHS.punch(2200, 1.0);
      alert("恭喜逃出");
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();