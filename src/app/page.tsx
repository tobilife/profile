import { companies, motto, strengths, techGroups } from "../../content/career";
import { AiActivity } from "@/components/home/AiActivity";
import { AtAGlance } from "@/components/home/AtAGlance";
import { BootLog } from "@/components/home/BootLog";
import { CareerTimeline } from "@/components/home/CareerTimeline";
import { Contact } from "@/components/home/Contact";
import { Hero } from "@/components/home/Hero";
import { Strengths } from "@/components/home/Strengths";
import { TechList } from "@/components/home/TechList";
import { HeroFigure } from "@/components/hero/HeroFigure";
import { ConsoleMotion } from "@/components/motion/ConsoleMotion";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { bootLines } from "@/lib/bootlog";
import { careerYears } from "@/lib/career";
import { getAllPosts } from "@/lib/posts";
import { SITE, absoluteUrl } from "@/lib/site";

export default function Home() {
  const now = new Date();
  const years = careerYears(now);
  const awards = companies.reduce((n, c) => n + (c.awards?.length ?? 0), 0);
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: SITE.name,
    alternateName: SITE.handle,
    email: `mailto:${SITE.email}`,
    url: absoluteUrl("/"),
    jobTitle: "손해보험사 IT 개발자",
    worksFor: { "@type": "Organization", name: companies[0].name },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person) }} />
      <div className="crt" aria-hidden="true" />
      <div className="sweep" aria-hidden="true" />
      <SiteHeader />
      <main>
        <Hero figure={<HeroFigure />} />
        <BootLog lines={bootLines(companies, now)} />
        <AtAGlance years={years} companies={companies.length} awards={awards} />
        <TechList groups={techGroups} />
        <CareerTimeline companies={companies} />
        <Strengths items={strengths} motto={motto} />
        <AiActivity recent={getAllPosts().slice(0, 3)} />
        <Contact />
      </main>
      <SiteFooter />
      <ConsoleMotion />
    </>
  );
}
