// The home page's dmesg-style career summary, derived from content/career.ts so it never
// says anything the career data does not.
import type { Company } from "../../content/career";
import { careerYears, todayStamp } from "./career";

export type BootLine = { stamp: string; subsys: string; text: string; live?: true };

const startOf = (period: string) => period.split("~")[0].trim();

export function bootLines(companies: Company[], now: Date = new Date()): BootLine[] {
  const lines: BootLine[] = [];
  let awards = 0;
  for (const c of companies) {
    const undated = c.projects.filter((p) => !p.period).slice(0, 3);
    lines.push({ stamp: startOf(c.period), subsys: c.id, text: undated.map((p) => p.name).join(", ") });
    for (const award of c.awards ?? []) {
      awards += 1;
      const [year, ...rest] = award.split(" ");
      lines.push({ stamp: year, subsys: c.id, text: rest.join(" ") });
    }
    for (const p of c.projects.filter((p) => p.period)) {
      lines.push({ stamp: startOf(p.period!), subsys: c.id, text: p.name });
    }
  }
  lines.sort((a, b) => a.stamp.localeCompare(b.stamp));
  lines.push({
    stamp: todayStamp(now),
    subsys: "uptime",
    text: `${careerYears(now)}년, 손해보험 ${companies.length}사, 수상 ${awards}회`,
    live: true,
  });
  return lines;
}
