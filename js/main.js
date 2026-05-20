/* ============================================================
   main.js
   Bootstraps everything and runs the main loop.
   ============================================================ */

(() => {
  const sceneCanvas = document.getElementById("scene");
  const vhsCanvas   = document.getElementById("vhs");
  const bootEl      = document.getElementById("boot");
  const coordEl     = document.getElementById("coord");
  const menuEl      = document.getElementById("esc-menu");

  const optTextures = document.getElementById("opt-textures");
  const optVhs      = document.getElementById("opt-vhs");
  const optCoord    = document.getElementById("opt-coord");
  const optMinimap  = document.getElementById("opt-minimap");
  const optNoFog    = document.getElementById("opt-no-fog");
  const optFov      = document.getElementById("opt-fov");
  const optFovValue = document.getElementById("opt-fov-value");

  Raycaster.init(sceneCanvas);
  VHS.init(vhsCanvas, sceneCanvas);
  Minimap.init();

  const settings = {
    textures: true,
    vhs: true,
    coord: true,
    minimap: true,
    fog: true,
    fov: 60,
  };

  function applySettings() {
    Raycaster.setUseTextures(settings.textures);
    Raycaster.setFogEnabled(settings.fog);
    Raycaster.setFovDeg(settings.fov);
    vhsCanvas.style.display = settings.vhs ? "block" : "none";
    coordEl.style.display = settings.coord ? "inline" : "none";
    Minimap.setVisible(settings.minimap);
    if (optFovValue) optFovValue.textContent = `${settings.fov}°`;
  }
  applySettings();

  let menuOpen = false;
  function setMenuOpen(open) {
    menuOpen = !!open;
    if (menuEl) {
      menuEl.classList.toggle("open", menuOpen);
      menuEl.setAttribute("aria-hidden", menuOpen ? "false" : "true");
    }
    Input.setEnabled(!menuOpen);
    document.body.style.cursor = menuOpen ? "default" : "none";
  }

  window.addEventListener("keydown", (e) => {
    if (e.code !== "Escape") return;
    e.preventDefault();
    setMenuOpen(!menuOpen);
  });

  if (optTextures) {
    optTextures.addEventListener("change", () => {
      settings.textures = optTextures.checked;
      applySettings();
    });
  }
  if (optVhs) {
    optVhs.addEventListener("change", () => {
      settings.vhs = optVhs.checked;
      applySettings();
    });
  }
  if (optCoord) {
    optCoord.addEventListener("change", () => {
      settings.coord = optCoord.checked;
      applySettings();
    });
  }
  if (optMinimap) {
    optMinimap.addEventListener("change", () => {
      settings.minimap = optMinimap.checked;
      applySettings();
    });
  }
  if (optNoFog) {
    optNoFog.addEventListener("change", () => {
      settings.fog = !optNoFog.checked;
      applySettings();
    });
  }
  if (optFov) {
    optFov.addEventListener("input", () => {
      settings.fov = Number(optFov.value) || 60;
      applySettings();
    });
  }

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

    if (!menuOpen) Input.pump();
    Player.update(dt);
    Raycaster.render(now);
    if (settings.minimap) Minimap.update();
    if (settings.vhs) VHS.render(now);

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
      alert("恭喜逃出");
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
