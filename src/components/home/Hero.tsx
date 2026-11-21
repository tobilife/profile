import type { ReactNode } from "react";
import { SITE } from "@/lib/site";
import { CodeWall } from "./CodeWall";

const HEADLINE = "거대한 레거시를 이해하고, 오래가는 구조로 바꿉니다";

/** Headline, one sentence and the two actions; the structure diagram sits beside them. */
export function Hero({ figure }: { figure: ReactNode }) {
  return (
    <section className="hero container" aria-labelledby="hero-title" data-hero>
      <CodeWall />
      <div className="hero-copy">
        <h1 id="hero-title">{HEADLINE}</h1>
        <p className="hero-lead">
          {SITE.name}입니다. 2009년부터 손해보험 3사에서 기간계와 비대면 채널을 개발하고 운영해 왔습니다. 요즘은
          사이드 프로젝트로 AI 에이전트 하네스를 만들고 있습니다.
        </p>
        <div className="actions">
          <a className="btn btn-primary" href={`mailto:${SITE.email}`}>
            이메일 보내기
          </a>
          <a className="btn btn-ghost" href="#career">
            경력 보기
          </a>
        </div>
      </div>
      <div className="hero-figure">{figure}</div>
    </section>
  );
}
