import { describe, expect, it } from "vitest";
import { companies, strengths, techGroups } from "../../content/career";
import { careerYears, todayStamp } from "./career";

describe("careerYears", () => {
  it("counts completed years since 2009-03", () => {
    expect(careerYears(new Date("2026-11-21"))).toBe(17);
    expect(careerYears(new Date("2027-02-28"))).toBe(17);
    expect(careerYears(new Date("2027-03-01"))).toBe(18);
    expect(careerYears(new Date("2030-03-01"))).toBe(21);
  });

  it("does not roll over on the first of January", () => {
    expect(careerYears(new Date("2027-01-01"))).toBe(17);
  });
});

describe("todayStamp", () => {
  it("formats a date as YYYY.MM for the boot log", () => {
    expect(todayStamp(new Date("2026-11-21"))).toBe("2026.11");
    expect(todayStamp(new Date("2027-03-01"))).toBe("2027.03");
  });
});

describe("career data", () => {
  it("lists companies newest first", () => {
    expect(companies.map((c) => c.id)).toEqual(["hanwha", "hyundai", "meritz"]);
  });

  it("uses the corrected periods", () => {
    expect(companies[2].period).toBe("2009.03 ~ 2017.12");
    expect(companies[1].period).toBe("2017.12 ~ 2022.09");
    expect(companies[0].period).toBe("2022.09 ~ 현재");
  });

  it("carries the two Hanwha additions with only name and period", () => {
    const hanwha = companies[0].projects;
    const calc = hanwha.find((p) => p.name === "산출지원센터 TM 신규 시스템 구축");
    const auto = hanwha.find((p) => p.name === "자동차 TM 유지보수");
    expect(calc).toEqual({ name: "산출지원센터 TM 신규 시스템 구축", period: "2026.09 ~ 2026.12" });
    expect(auto).toEqual({ name: "자동차 TM 유지보수", period: "2025.01 ~" });
  });

  it("keeps the Meritz awards", () => {
    expect(companies[2].awards).toEqual(["2012 운영 최우수상", "2013 매뉴얼 최우수상"]);
  });

  it("lists AI skills, not products or repositories", () => {
    const ai = techGroups.find((g) => g.label === "ai")!.items;
    expect(ai).toEqual(expect.arrayContaining(["AI 에이전트 하네스 구축", "AI 오케스트레이션"]));
    expect(ai).not.toContain("Sim Studio");
    expect(ai).not.toContain("Supabase");
  });

  it("lists NCRM among the frontend skills", () => {
    expect(techGroups.find((g) => g.label === "frontend")!.items).toContain("NCRM");
  });

  it("has five strengths", () => {
    expect(strengths).toHaveLength(5);
  });

  it("never carries the typo'd period or a stale year count", () => {
    expect(JSON.stringify({ companies, strengths, techGroups })).not.toMatch(/15년|2013\.09/);
  });
});
