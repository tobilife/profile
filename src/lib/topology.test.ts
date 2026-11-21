import { describe, expect, it } from "vitest";
import { PATHS, TOPOLOGY, packetCells } from "./topology";

const WIRE = new Set(["|", "-", "v", ">", "+"]);

describe("TOPOLOGY", () => {
  it("is a rectangle of ASCII characters, so every row lines up in a monospace font", () => {
    const width = TOPOLOGY[0].length;
    for (const row of TOPOLOGY) {
      expect(row).toHaveLength(width);
      expect(row).toMatch(/^[\x20-\x7e]*$/);
    }
  });

  it("names the parts of an insurance system", () => {
    const text = TOPOLOGY.join("\n");
    for (const part of ["CM channel", "EAI", "contract", "claim", "product", "batch", "FEP"]) expect(text).toContain(part);
  });
});

describe("PATHS", () => {
  it("runs only along wires drawn in the diagram", () => {
    expect(PATHS.length).toBeGreaterThanOrEqual(3);
    for (const path of PATHS) {
      expect(path.length).toBeGreaterThan(4);
      for (const [r, c] of path) expect(WIRE.has(TOPOLOGY[r][c]), `(${r},${c}) is '${TOPOLOGY[r][c]}'`).toBe(true);
    }
  });
});

describe("packetCells", () => {
  it("puts one request on each path, always on a wire", () => {
    const cells = packetCells(1234);
    expect(cells).toHaveLength(PATHS.length);
    cells.forEach(([r, c], i) => expect(PATHS[i]).toContainEqual([r, c]));
  });

  it("moves the requests over time", () => {
    expect(packetCells(0)).not.toEqual(packetCells(900));
  });
});
