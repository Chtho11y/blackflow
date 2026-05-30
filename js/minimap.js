/* ============================================================
   minimap.js
   Mini-map overlay that shows the maze layout and player position.
   ============================================================ */

const Minimap = (() => {
  let canvas, ctx;
  let cellSize = 12;
  let padding = 10;
  let visible = true;

  function init() {
    canvas = document.getElementById("minimap");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "minimap";
      document.getElementById("screen").appendChild(canvas);
    }
    ctx = canvas.getContext("2d");
    resize();
    setVisible(visible);
    render();
  }

  function resize() {
    canvas.width = Maze.W * cellSize + padding * 2;
    canvas.height = Maze.H * cellSize + padding * 2;
  }

  function render() {
    if (!ctx) return;

    /* Clear with deep black background (path color). */
    ctx.fillStyle = "#06140a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Draw walls as dark green lines. */
    ctx.strokeStyle = "#2ee66b";
    ctx.lineWidth = 1;

    const N = 1, E = 2, S = 4, W = 8;

    for (let cy = 0; cy < Maze.H; cy++) {
      for (let cx = 0; cx < Maze.W; cx++) {
        const cell = Maze.cells[cy][cx];
        const px = padding + cx * cellSize;
        const py = padding + cy * cellSize;

        /* Draw walls based on bitmask. */
        if (cell.walls & N) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + cellSize, py);
          ctx.stroke();
        }
        if (cell.walls & E) {
          ctx.beginPath();
          ctx.moveTo(px + cellSize, py);
          ctx.lineTo(px + cellSize, py + cellSize);
          ctx.stroke();
        }
        if (cell.walls & S) {
          ctx.beginPath();
          ctx.moveTo(px, py + cellSize);
          ctx.lineTo(px + cellSize, py + cellSize);
          ctx.stroke();
        }
        if (cell.walls & W) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + cellSize);
          ctx.stroke();
        }
      }
    }

    /* Draw exit marker (light green dot). */
    const exitPx = padding + Maze.exit.x * cellSize + cellSize / 2;
    const exitPy = padding + Maze.exit.y * cellSize + cellSize / 2;
    ctx.fillStyle = "#00ff41";
    ctx.beginPath();
    ctx.arc(exitPx, exitPy, cellSize / 3, 0, Math.PI * 2);
    ctx.fill();

    /* Draw player as red dot. */
    const playerPx = padding + Player.state.cx * cellSize + cellSize / 2;
    const playerPy = padding + Player.state.cy * cellSize + cellSize / 2;
    ctx.fillStyle = "#ff0000";
    ctx.beginPath();
    ctx.arc(playerPx, playerPy, cellSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function update() {
    if (!visible) return;
    render();
  }

  function setVisible(next) {
    visible = !!next;
    if (canvas) {
      canvas.style.display = visible ? "block" : "none";
    }
  }

  return {
    init,
    update,
    setVisible,
  };
})();