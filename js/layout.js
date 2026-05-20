/* ============================================================
   layout.js
   Hand-authored maze layout. Loaded as a plain <script> so that
   maze.js can read it synchronously at boot — no fetch, no
   async ordering hazards.

   Bitmask convention USED IN THIS FILE (matches asset/maze_bitmask.json):
       1 = wall on NORTH (top)
       2 = wall on SOUTH (bottom)
       4 = wall on WEST  (left)
       8 = wall on EAST  (right)
   maze.js will translate this to its own internal bitmask
   (N=1, E=2, S=4, W=8).

   Coordinates use [row, col] = [y, x].
   To re-author the maze, just paste new contents from
   asset/maze_bitmask.json into MATRIX below.
   ============================================================ */

window.MAZE_LAYOUT = {
  /* External (file-format) bit flags — kept here so the parser in
     maze.js doesn't have to hard-code magic numbers. */
  bits: { N: 1, S: 2, W: 4, E: 8 },

  width:  20,   // columns (x-axis)
  height: 12,   // rows    (y-axis)

  /* [row, col] i.e. [y, x] */
  start: [5, 0],
  end:   [6, 19],

  /* Initial heading at spawn. 0=N, 1=E, 2=S, 3=W.
     Spawn hugs the left wall, so we face east by default. */
  startDir: 1,

  /* matrix[row][col] = bitmask of walls around that cell. */
  matrix: [
    [ 7, 3, 9, 5, 3, 3, 1, 3, 3,11, 5, 3,11, 5, 3, 9, 7, 9, 5,11],
    [ 5, 3,10, 4,11, 5,10, 5, 3, 3,10, 5, 1, 2, 9,12, 5,10, 6, 9],
    [12, 5, 3, 2, 9,14, 5,10, 5, 3, 3,10, 6, 9,12, 6, 2, 9,13,12],
    [ 4,10, 5, 9,14,13, 6, 9,12, 7, 3, 9, 5,10, 6, 3, 9,12, 4,10],
    [ 4, 3,10, 6,11,12, 5, 2,10, 5, 9,12, 6, 3, 9, 5, 8, 4,10,13],
    [ 6, 3, 9, 5, 9,12, 4, 3, 9,12, 4,10, 7, 1,10,12,12, 6, 3,10],
    [ 5, 9,12,12, 6,10, 4, 9,14,14,12, 5, 9, 6, 9,12, 6, 3, 3,11],
    [14,12, 6, 2, 1, 3,10, 4, 1, 1,10,12,14, 5,10, 6, 1, 9, 7, 9],
    [13, 6, 1, 3,10, 5, 9,14,12, 6, 1, 2,11, 6, 1, 9,12,14,13,12],
    [ 6, 1,10, 5, 3,10,14, 7,10, 5,10, 7, 3, 3, 8,12,12, 5,10,12],
    [ 5,10, 5, 2, 9, 5, 3,11, 7,10, 7, 9, 5, 3,10,12, 4, 2, 3,10],
    [ 6, 3, 2,11, 6, 2, 3, 3, 3, 3, 3,10, 6, 3,11,14, 6, 3, 3,11],
  ],
};
