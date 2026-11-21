import type { Company, Project } from "../../../content/career";

function ProjectBody({ p }: { p: Project }) {
  return (
    <div className="body">
      {p.summary && <p>{p.summary}</p>}
      {p.items && (
        <ul>
          {p.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {p.result && <p className="result">{p.result}</p>}
      {p.tech && <p className="tech mono">{p.tech.join(", ")}</p>}
    </div>
  );
}

function ProjectRow({ p, since }: { p: Project; since: string }) {
  const when = p.period ?? `${since} ~`;
  const hasBody = Boolean(p.summary || p.items || p.result || p.tech);
  if (!hasBody) {
    return (
      <li className="reveal">
        <div className="row">
          <span className="when mono">{when}</span>
          <span className="what">{p.name}</span>
        </div>
      </li>
    );
  }
  return (
    <li className="reveal">
      <details open>
        <summary>
          <span className="when mono">{when}</span>
          <span className="what">{p.name}</span>
        </summary>
        <ProjectBody p={p} />
      </details>
    </li>
  );
}

export function CareerTimeline({ companies }: { companies: Company[] }) {
  return (
    <section id="career" className="section container" aria-labelledby="career-title">
      <h2 id="career-title" className="reveal">
        경력
      </h2>
      <p className="cmd mono" data-cmd="$ git log --oneline insurance/">
        $ git log --oneline insurance/
      </p>
      {companies.map((c) => {
        const since = c.period.split("~")[0].trim();
        return (
          <article key={c.id} className="subsys reveal" aria-labelledby={`co-${c.id}`}>
            <header>
              <h3 id={`co-${c.id}`}>
                <code className="mono">{c.id}/</code>
                {c.name} {c.division}
              </h3>
              <span className="period mono">{c.period}</span>
            </header>
            <ul className="log">
              {c.projects.map((p) => (
                <ProjectRow key={p.name} p={p} since={since} />
              ))}
            </ul>
            {c.awards && (
              <p className="awards mono">
                {c.awards.map((a) => (
                  <span key={a}>{a}</span>
                ))}
              </p>
            )}
            <p className="stack mono">{c.stack.join(", ")}</p>
          </article>
        );
      })}
    </section>
  );
}
