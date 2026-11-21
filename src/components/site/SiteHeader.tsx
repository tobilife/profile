import Link from "next/link";
import { MotionSwitch } from "./MotionSwitch";

export function SiteHeader() {
  return (
    <header className="bar container">
      <nav aria-label="주요 메뉴">
        <Link href="/#career">경력</Link>
        <Link href="/blog/">블로그</Link>
        <Link href="/#contact">연락처</Link>
        <MotionSwitch />
      </nav>
    </header>
  );
}
