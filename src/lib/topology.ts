// The hero diagram: a generic insurance system drawn in ASCII, with requests travelling along the wires.
// ASCII only (no box-drawing or Hangul), so every row lines up in any monospace font.

export const TOPOLOGY: string[] = [
  "+-- web/app --+       +-- partner --+    ",
  "|  CM channel |       | easy quote  |    ",
  "+------+------+       +------+------+    ",
  "       |                     |           ",
  "       v                     v           ",
  "+------+---------------------+----------+",
  "|                  EAI                  |",
  "+------+------------+------------+------+",
  "       |            |            |       ",
  "       v            v            v       ",
  "+------+---+  +-----+----+  +----+------+",
  "| contract |--|  claim   |--| product   |",
  "+------+---+  +-----+----+  +-----------+",
  "       |            |                    ",
  "       v            v                    ",
  "+------+------------+----+    +---------+",
  "| batch close/xfer/fee   |--->|   FEP   |",
  "+------------------------+    +---------+",
];

type Cell = [number, number];
const down = (col: number, ...rows: number[]): Cell[] => rows.map((r) => [r, col]);
const along = (row: number, ...cols: number[]): Cell[] => cols.map((c) => [row, c]);

/** Wire cells each request passes, in order. Boxes are crossed instantly (the request is "inside"). */
export const PATHS: Cell[][] = [
  // web/app -> EAI -> contract -> batch -> FEP
  [...down(7, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13, 14, 15), ...along(16, 26, 27, 28, 29)],
  // partner -> EAI -> claim -> batch -> FEP
  [...down(29, 2, 3, 4, 5), ...down(20, 7, 8, 9, 10, 12, 13, 14, 15), ...along(16, 26, 27, 28, 29)],
  // EAI -> product -> claim -> contract
  [...down(33, 7, 8, 9, 10), ...along(11, 27, 26, 13, 12)],
];

const SPEED = [7.5, 6, 5]; // cells per second
const OFFSET = [0, 0.45, 0.2]; // phase, as a fraction of the path

/** Where each request is at `ms` milliseconds. */
export function packetCells(ms: number): Cell[] {
  return PATHS.map((path, i) => {
    const step = Math.floor((ms / 1000) * SPEED[i] + OFFSET[i] * path.length) % path.length;
    return path[step];
  });
}
