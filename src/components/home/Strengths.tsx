export function Strengths({ items, motto }: { items: { title: string; body: string }[]; motto: string }) {
  return (
    <section className="section container" aria-labelledby="strengths-title">
      <h2 id="strengths-title" className="reveal">
        강점
      </h2>
      <p className="cmd mono" data-cmd="$ cat /proc/strengths">
        $ cat /proc/strengths
      </p>
      <ol className="strengths">
        {items.map((s, i) => (
          <li key={s.title} className="reveal">
            <span className="idx mono">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <blockquote className="motto reveal">
        <p>{motto}</p>
      </blockquote>
    </section>
  );
}
