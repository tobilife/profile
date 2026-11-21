"use client";

import { useEffect } from "react";
import { packetCells } from "@/lib/topology";

/** Moves three requests along the diagram's wires while motion is on and the diagram is on screen. */
export function TopologyMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".topo");
    if (!root) return;
    const cells = new Map<string, HTMLElement>();
    root.querySelectorAll<HTMLElement>("[data-rc]").forEach((el) => cells.set(el.dataset.rc!, el));

    let lit: HTMLElement[] = [];
    const clear = () => {
      lit.forEach((el) => el.classList.remove("pkt"));
      lit = [];
    };
    let visible = true;
    const io = new IntersectionObserver((entries) => (visible = entries[0].isIntersecting));
    io.observe(root);

    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.documentElement.dataset.motion !== "on") return clear();
      if (!visible || document.hidden || now - last < 60) return;
      last = now;
      clear();
      for (const [r, c] of packetCells(now - t0)) {
        const el = cells.get(`${r}-${c}`);
        if (el) {
          el.classList.add("pkt");
          lit.push(el);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      clear();
    };
  }, []);
  return null;
}
