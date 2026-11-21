/** `lsmod`-style list: a moving ticker when motion is on, a plain grouped list underneath for everyone. */
export function TechList({ groups }: { groups: { label: string; items: string[] }[] }) {
  const all = groups.flatMap((g) => g.items);
  return (
    <section className="section container" aria-labelledby="tech-title">
      <h2 id="tech-title" className="reveal">
        기술
      </h2>
      <p className="cmd mono" data-cmd="$ lsmod">
        $ lsmod
      </p>
      <div className="ticker mono" aria-hidden="true">
        <div className="track">
          {[...all, ...all].map((t, i) => (
            <span key={`${t}-${i}`}>{t}</span>
          ))}
        </div>
      </div>
      <dl className="modules mono reveal">
        {groups.map((g) => (
          <div key={g.label}>
            <dt>{g.label}</dt>
            <dd>{g.items.join(", ")}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
