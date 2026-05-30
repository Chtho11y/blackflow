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
  const zoneEl      = document.getElementById("zone");

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
  Dialogue.init();
  Inventory.init();

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

  /* Zone transition */
  let lastCellKey = "";

  function transitionToNextZone() {
    const currentZone = Maze.getCurrentZoneId();
    const nextZone = Maze.advanceZone();
    
    /* Reset player position to the new zone's spawn point */
    const ps = Player.state;
    ps.cx = Maze.spawn.x;
    ps.cy = Maze.spawn.y;
    ps.x = Maze.spawn.x + 0.5;
    ps.y = Maze.spawn.y + 0.5;
    ps.dir = Maze.startDir;
    ps.angle = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][ps.dir];
    
    /* Reset movement state */
    ps.moving = false;
    ps.rotating = false;
    lastCellKey = "";
    
    VHS.punch(1000, 0.8);
    
    /* Check if completed all zones (loop back to zone 1) */
    if (nextZone === 1 && currentZone === Maze.getTotalZones()) {
      alert("恭喜你完成了所有区域的循环！");
    }
  }

  let last = performance.now();
  
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!menuOpen) Input.pump();
    Player.update(dt);
    
    const ps = Player.state;
    const cellKey = `${ps.cx},${ps.cy}`;
    
    /* Check for dialogue events when player enters a new cell */
    if (!Dialogue.isActive()) {
      if (cellKey !== lastCellKey && Dialogue.isDialogueCell(ps.cx, ps.cy)) {
        Dialogue.show(ps.cx, ps.cy);
      }
    }
    
    /* Check for items when player enters a new cell */
    if (cellKey !== lastCellKey && !Inventory.isOpen()) {
      const itemId = Maze.collectItem(ps.cx, ps.cy, Maze.getCurrentZoneId());
      if (itemId) {
        Inventory.addItem(itemId);
        const itemInfo = Inventory.ITEMS[itemId];
        if (itemInfo) {
          VHS.punch(300, 0.5);
        }
      }
    }
    
    lastCellKey = cellKey;
    
    Raycaster.render(now);
    Minimap.update();
    if (settings.vhs) VHS.render(now);

    /* Tape-style HUD readout. */
    coordEl.textContent =
      `${String(ps.cx).padStart(2, "0")},${String(ps.cy).padStart(2, "0")} ` +
      Player.DIRS[ps.dir].label;

    /* Zone indicator */
    if (zoneEl) {
      zoneEl.textContent = `Zone ${Maze.getCurrentZoneId()}/${Maze.getTotalZones()}`;
    }

    /* Reaching the exit triggers zone transition */
    if (ps.cx === Maze.exit.x && ps.cy === Maze.exit.y && !loop._reached) {
      loop._reached = true;
      transitionToNextZone();
    }
    
    /* Reset reached flag when player moves away from exit */
    if (ps.cx !== Maze.exit.x || ps.cy !== Maze.exit.y) {
      loop._reached = false;
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();