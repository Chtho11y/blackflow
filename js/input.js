/* ============================================================
   input.js
   Maps keyboard to one-step player commands. Holding a key does
   NOT auto-repeat the move at engine speed — instead, when the
   current move finishes, if the key is still held we fire one
   more step. This preserves the strict grid feel.
   ============================================================ */

const Input = (() => {
  const held = {
    forward: false,
    back: false,
    left: false,
    right: false,
  };

  function bind(code, prop, down) {
    held[prop] = down;
  }

  function onKey(e, down) {
    /* Support WASD + arrows. */
    switch (e.code) {
      case "KeyW": case "ArrowUp":    bind(e.code, "forward", down); break;
      case "KeyS": case "ArrowDown":  bind(e.code, "back",    down); break;
      case "KeyA": case "ArrowLeft":  bind(e.code, "left",    down); break;
      case "KeyD": case "ArrowRight": bind(e.code, "right",   down); break;
      default: break;
    }
    /* Number keys 1-5 for zone teleport */
    if (down) {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 5) {
        Player.teleport(num);
        e.preventDefault();
        return;
      }
    }
    if (["KeyW","KeyS","KeyA","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
  }

  window.addEventListener("keydown", (e) => onKey(e, true));
  window.addEventListener("keyup",   (e) => onKey(e, false));

  /* Called every frame: if player is idle and a key is still held,
     fire exactly one queued action. */
  function pump() {
    if (Player.isBusy()) return;
    if (held.forward) { Player.stepForward();  return; }
    if (held.back)    { Player.stepBackward(); return; }
    if (held.left)    { Player.rotateLeft();   return; }
    if (held.right)   { Player.rotateRight();  return; }
  }

  return { pump, held };
})();
