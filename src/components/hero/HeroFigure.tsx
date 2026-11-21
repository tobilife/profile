import { Fragment } from "react";
import { PATHS, TOPOLOGY } from "@/lib/topology";
import { TopologyMotion } from "./TopologyMotion";

const onPath = new Set(PATHS.flat().map(([r, c]) => `${r}-${c}`));

/** Character class: labels read brighter than the wiring. */
const kind = (ch: string) => (/[A-Za-z/]/.test(ch) ? "t" : ch === " " ? null : "w");

/**
 * A generic insurance system as an ASCII topology: channels, EAI, contract/claim/product, batch, FEP.
 * Fully drawn in the HTML; TopologyMotion only moves requests along the wires when motion is on.
 */
export function HeroFigure() {
  return (
    <figure className="scene">
      <div className="scene-box orbit">
        <div className="glow" aria-hidden="true" />
        <pre className="topo mono" aria-hidden="true">
          {TOPOLOGY.map((row, r) => (
            <Fragment key={r}>
              {Array.from(row, (ch, c) => {
                const k = kind(ch);
                if (!k) return ch;
                const rc = `${r}-${c}`;
                return (
                  <span key={c} className={k} data-rc={onPath.has(rc) ? rc : undefined}>
                    {ch}
                  </span>
                );
              })}
              {r < TOPOLOGY.length - 1 ? "\n" : null}
            </Fragment>
          ))}
        </pre>
        <TopologyMotion />
      </div>
    </figure>
  );
}
