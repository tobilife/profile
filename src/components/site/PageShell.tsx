import type { ReactNode } from "react";
import { ConsoleMotion } from "@/components/motion/ConsoleMotion";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Header, footer, CRT texture and motion for every page except the home page, which composes its own. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="crt" aria-hidden="true" />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <ConsoleMotion />
    </>
  );
}
