import { describe, expect, it } from "vitest";
import { companies } from "../../content/career";
import { bootLines } from "./bootlog";

describe("bootLines", () => {
  const lines = bootLines(companies, new Date("2026-11-21"));

  it("starts at the first job and prints one line per milestone, oldest first", () => {
    expect(lines.map((l) => `${l.stamp} ${l.subsys}`)).toEqual([
      "2009.03 meritz",
      "2012 meritz",
      "2013 meritz",
      "2017.12 hyundai",
      "2022.09 hanwha",
      "2025.01 hanwha",
      "2026.09 hanwha",
      "2026.11 uptime",
    ]);
  });

  it("names the first projects of each company and the dated additions", () => {
    expect(lines[0].text).toBe("대외계 운영 (FEP Batch), 계약공통 개발, DBIO 공통모듈");
    expect(lines[1].text).toBe("운영 최우수상");
    expect(lines[5].text).toBe("자동차 TM 유지보수");
    expect(lines[6].text).toBe("산출지원센터 TM 신규 시스템 구축");
  });

  it("ends with an uptime line computed from the date", () => {
    expect(lines.at(-1)).toEqual({ stamp: "2026.11", subsys: "uptime", text: "17년, 손해보험 3사, 수상 2회", live: true });
    expect(bootLines(companies, new Date("2027-03-01")).at(-1)?.text).toBe("18년, 손해보험 3사, 수상 2회");
  });
});
