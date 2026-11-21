"use client";

import { useEffect } from "react";
import { careerYears, todayStamp } from "@/lib/career";

/**
 * Page-wide behaviour for the console look:
 * - always: refresh the career-year count and today's stamp from the visitor's clock;
 * - when motion is on: type the boot log, reveal blocks on scroll, type command lines, decode numbers.
 * Everything is in the server HTML already; this only animates it.
 */
export function ConsoleMotion() {
  useEffect(() => {
    const now = new Date();
    const years = String(careerYears(now));
    document.querySelectorAll<HTMLElement>("[data-career-years]").forEach((el) => (el.textContent = years));
    // The boot log's last line is retyped from data-text, so keep that in step with the visitor's date too.
    document.querySelectorAll<HTMLElement>("[data-boot] .last [data-text]").forEach((el) => {
      el.dataset.text = (el.dataset.text ?? "").replace(/^\d+/, years);
    });
    document.querySelectorAll<HTMLElement>("[data-today]").forEach((el) => (el.textContent = todayStamp(now)));

    const root = document.documentElement;
    if (root.dataset.motion !== "on") {
      root.classList.add("motion-done");
      return;
    }
    root.classList.add("js");
    const timers: number[] = [];
    let cancelled = false;

    // Boot log: lines appear one after another, the text typed with a block cursor.
    const lines = Array.from(document.querySelectorAll<HTMLElement>("[data-boot] li"));
    const cursor = document.createElement("i");
    cursor.className = "cur";
    cursor.setAttribute("aria-hidden", "true");
    const typeInto = (el: HTMLElement, text: string, cps: number, done: () => void) => {
      const node = document.createTextNode("");
      el.replaceChildren(node, cursor);
      const start = performance.now();
      const step = (t: number) => {
        if (cancelled) return;
        const n = Math.min(text.length, Math.floor(((t - start) * cps) / 1000));
        node.nodeValue = text.slice(0, n);
        if (n < text.length) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    };
    const boot = (i: number) => {
      if (cancelled || i >= lines.length) return;
      const li = lines[i];
      const span = li.querySelector<HTMLElement>("[data-text]");
      li.classList.add("on");
      if (!span) return boot(i + 1);
      const text = span.dataset.text ?? span.textContent ?? "";
      typeInto(span, text, 70, () => timers.push(window.setTimeout(() => boot(i + 1), 110)));
    };
    timers.push(window.setTimeout(() => boot(0), 300));

    // Reveal on scroll, type command lines, decode figures.
    const decodedValue = new Map<HTMLElement, string>();
    const decode = (el: HTMLElement) => {
      const target = decodedValue.get(el) ?? el.textContent ?? "";
      decodedValue.set(el, target);
      const t0 = performance.now();
      const HEX = "0123456789abcdef";
      const tick = () => {
        if (cancelled) return;
        if (performance.now() - t0 >= 700) {
          el.textContent = target;
          return;
        }
        el.textContent = Array.from(target, () => HEX[Math.floor(Math.random() * 16)]).join("");
        timers.push(window.setTimeout(tick, 45));
      };
      tick();
    };
    const typeCmd = (el: HTMLElement) => {
      const text = el.dataset.cmd ?? el.textContent ?? "";
      const t0 = performance.now();
      const step = (t: number) => {
        if (cancelled) return;
        const n = Math.min(text.length, Math.floor(((t - t0) * 38) / 1000));
        el.textContent = text.slice(0, n) + (n < text.length ? "█" : "");
        if (n < text.length) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const seen = (el: HTMLElement) => {
      if (el.hasAttribute("data-cmd")) return typeCmd(el);
      el.classList.add("in");
      el.querySelectorAll<HTMLElement>("[data-decode]").forEach(decode);
    };
    const targets = document.querySelectorAll<HTMLElement>(".reveal, [data-cmd]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            seen(e.target as HTMLElement);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    targets.forEach((el) => io.observe(el));

    const stop = () => {
      cancelled = true;
      io.disconnect();
      timers.forEach(clearTimeout);
    };
    // Motion switched off mid-animation: stop every script-driven effect and show the final text.
    const finish = () => {
      if (root.dataset.motion === "on") return;
      stop();
      cursor.remove();
      lines.forEach((li) => {
        li.classList.add("on");
        const span = li.querySelector<HTMLElement>("[data-text]");
        if (span?.dataset.text) span.textContent = span.dataset.text;
      });
      document.querySelectorAll<HTMLElement>("[data-cmd]").forEach((el) => (el.textContent = el.dataset.cmd ?? el.textContent));
      decodedValue.forEach((value, el) => (el.textContent = value));
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
      window.removeEventListener("motionchange", finish);
    };
    window.addEventListener("motionchange", finish);

    return () => {
      stop();
      window.removeEventListener("motionchange", finish);
    };
  }, []);

  return null;
}
