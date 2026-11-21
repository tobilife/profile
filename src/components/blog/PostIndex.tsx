import Link from "next/link";
import type { Post } from "@/lib/posts";

/** Mailing-list style index: date, category, title, one line of description. */
export function PostIndex({ posts }: { posts: Post[] }) {
  return (
    <ul className="index post-index">
      {posts.map((p) => (
        <li key={p.slug}>
          <time className="mono" dateTime={p.date}>
            {p.date.slice(0, 10)}
          </time>
          <span className="cat">{p.category}</span>
          <div className="entry">
            <Link href={`/blog/${p.slug}/`}>{p.title}</Link>
            <p>{p.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
