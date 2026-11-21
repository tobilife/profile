export function AtAGlance({ years, companies, awards }: { years: number; companies: number; awards: number }) {
  return (
    <div className="container">
      <dl className="glance reveal">
        <div>
          <dt>손해보험사</dt>
          <dd data-decode>{companies}</dd>
        </div>
        <div>
          <dt>경력 (년)</dt>
          <dd data-decode data-career-years>
            {years}
          </dd>
        </div>
        <div>
          <dt>수상</dt>
          <dd data-decode>{awards}</dd>
        </div>
      </dl>
    </div>
  );
}
