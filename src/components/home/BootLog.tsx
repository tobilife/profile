import type { BootLine } from "@/lib/bootlog";

const pad = (stamp: string) => stamp.padEnd(7, " ");

/** The career as a dmesg boot log. Text is complete in the HTML; ConsoleMotion types it when motion is on. */
export function BootLog({ lines }: { lines: BootLine[] }) {
  return (
    <div className="container">
      <ol className="dmesg mono" aria-label="경력 요약" data-boot>
        {lines.map((l) => (
          <li key={`${l.stamp}-${l.subsys}-${l.text}`} className={l.live ? "last" : undefined}>
            <span className="stamp">
              [{l.live ? <time data-today>{l.stamp}</time> : pad(l.stamp)}]
            </span>
            <b>{l.subsys}:</b>
            {l.live ? (
              <span data-text={l.text}>
                <span data-career-years>{l.text.split("년")[0]}</span>년{l.text.slice(l.text.indexOf("년") + 1)}
              </span>
            ) : (
              <span data-text={l.text}>{l.text}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
