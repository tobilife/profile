import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";

export default function NotFound() {
  return (
    <PageShell>
      <section className="section container panic" aria-labelledby="panic-title">
        <pre className="panic-log mono" aria-hidden="true">
          {`[    0.404000] VFS: Unable to mount requested path
[    0.404001] ---[ end trace 0000000000000404 ]---`}
        </pre>
        <h1 id="panic-title" className="page-title mono">
          Kernel panic - not syncing: page not found
        </h1>
        <p className="page-lead">찾으시는 페이지가 없습니다. 주소가 바뀌었거나 삭제된 글일 수 있습니다.</p>
        <p className="actions">
          <Link className="btn btn-primary" href="/">
            처음으로
          </Link>
          <Link className="btn btn-ghost" href="/blog/">
            블로그
          </Link>
        </p>
      </section>
    </PageShell>
  );
}
