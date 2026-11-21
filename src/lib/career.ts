// Career-length math. Runs both at build time and in the browser (the client script
// recomputes it on the visitor's date), so it must stay free of Node imports.
import { SITE } from "./site";

const [START_YEAR, START_MONTH] = SITE.careerStart.split("-").map(Number);

/** Completed years since the career start month (2009-03): 17 until 2027-02, 18 from 2027-03. */
export function careerYears(now: Date = new Date()): number {
  const months = (now.getFullYear() - START_YEAR) * 12 + (now.getMonth() + 1 - START_MONTH);
  return Math.floor(months / 12);
}

/** "YYYY.MM" for the last line of the boot log. */
export function todayStamp(now: Date = new Date()): string {
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`;
}
