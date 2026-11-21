"use client";

import { useSyncExternalStore } from "react";

// The motion state lives on <html data-motion>, set before paint by the script in layout.tsx.
const subscribe = (onChange: () => void) => {
  window.addEventListener("motionchange", onChange);
  return () => window.removeEventListener("motionchange", onChange);
};
const read = () => document.documentElement.dataset.motion ?? null;
const readOnServer = () => null;

/** Pause (motion on) or play (motion off) icon; the choice is remembered for this browser. */
export function MotionSwitch() {
  const motion = useSyncExternalStore(subscribe, read, readOnServer);
  if (motion === null) return null;
  const on = motion === "on";
  const label = on ? "움직임 멈추기" : "움직임 켜기";

  const toggle = () => {
    const next = on ? "off" : "on";
    try {
      localStorage.setItem("motion", next);
    } catch {
      /* storage unavailable: the choice still applies to this page view */
    }
    document.documentElement.dataset.motion = next;
    window.dispatchEvent(new Event("motionchange"));
  };

  return (
    <button type="button" className="motion-switch" aria-pressed={on} aria-label={label} title={label} onClick={toggle}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        {on ? (
          <>
            <rect x="3.5" y="3" width="3" height="10" rx="0.6" />
            <rect x="9.5" y="3" width="3" height="10" rx="0.6" />
          </>
        ) : (
          <path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5Z" />
        )}
      </svg>
    </button>
  );
}
