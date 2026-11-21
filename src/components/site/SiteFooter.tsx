import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="foot container mono">
      <p>
        {SITE.name} ({SITE.handle}) &lt;<a href={`mailto:${SITE.email}`}>{SITE.email}</a>&gt;
      </p>
    </footer>
  );
}
