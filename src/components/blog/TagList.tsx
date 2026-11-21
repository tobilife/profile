import Link from "next/link";
import { tagToSlug } from "@/lib/posts";

export function TagList({ tags, counts }: { tags: string[]; counts?: Map<string, number> }) {
  if (tags.length === 0) return null;
  return (
    <ul className="tags mono" aria-label="태그">
      {tags.map((t) => {
        const slug = tagToSlug(t);
        return (
          <li key={slug}>
            <Link href={`/blog/tag/${slug}/`}>
              {t}
              {counts?.has(slug) ? <span className="count"> ({counts.get(slug)})</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
