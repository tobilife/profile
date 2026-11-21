import type { MetadataRoute } from "next";
import { collectTags, getAllPosts } from "@/lib/posts";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  return [
    { url: absoluteUrl("/"), lastModified: new Date() },
    { url: absoluteUrl("/blog/"), lastModified: posts[0] ? new Date(posts[0].date) : new Date() },
    ...posts.map((p) => ({ url: absoluteUrl(`/blog/${p.slug}/`), lastModified: new Date(p.date) })),
    ...collectTags(posts).map((t) => ({ url: absoluteUrl(`/blog/tag/${encodeURIComponent(t.slug)}/`) })),
  ];
}
