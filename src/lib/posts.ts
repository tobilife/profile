// Reads blog posts from content/posts at build time and validates their front matter.
// A malformed post fails the build with the file name, instead of silently disappearing.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

export const CATEGORIES = ["에이전트 엔지니어링", "저장소 소개", "AI 트렌드", "AI 실전"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Post = {
  slug: string;
  title: string;
  date: string; // ISO timestamp
  description: string;
  category: Category;
  tags: string[];
  draft: boolean;
  cover?: string;
  body: string;
};

const POSTS_DIR = join(process.cwd(), "content", "posts");

function fail(fileName: string, message: string): never {
  throw new Error(`${fileName}: ${message}`);
}

function requireText(fileName: string, data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") fail(fileName, `front matter "${key}" is missing or empty`);
  return value.trim();
}

export function parsePost(fileName: string, raw: string): Post {
  if (!raw.trimStart().startsWith("---")) fail(fileName, "no front matter block");
  const { data, content } = matter(raw);

  const title = requireText(fileName, data, "title");
  const description = requireText(fileName, data, "description");

  // YAML turns an unquoted date into a Date; a quoted one stays a string.
  const rawDate = data.date instanceof Date ? data.date : new Date(String(data.date ?? ""));
  if (Number.isNaN(rawDate.getTime())) fail(fileName, `front matter "date" is not a valid date: ${String(data.date)}`);
  // JS dates roll impossible days over (2026-02-30 -> 2026-03-02); compare against what was written.
  const written = raw.match(/^date:\s*["']?(\d{4})-(\d{2})-(\d{2})/m);
  if (written) {
    const [, y, m, d] = written;
    const back = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (back.getUTCFullYear() !== Number(y) || back.getUTCMonth() + 1 !== Number(m) || back.getUTCDate() !== Number(d)) {
      fail(fileName, `front matter "date" ${y}-${m}-${d} is not a real calendar date`);
    }
  }

  const category = data.category;
  if (!CATEGORIES.includes(category as Category)) {
    fail(fileName, `front matter "category" must be one of ${CATEGORIES.join(", ")}; got ${String(category)}`);
  }

  const tags = Array.isArray(data.tags) ? data.tags.map((t) => String(t).trim()).filter(Boolean) : [];

  return {
    slug: fileName.replace(/\.md$/i, "").toLowerCase(),
    title,
    date: rawDate.toISOString(),
    description,
    category: category as Category,
    tags,
    draft: data.draft === true,
    cover: typeof data.cover === "string" ? data.cover : undefined,
    body: content.trim(),
  };
}

export function selectPublished(posts: Post[], now: Date = new Date()): Post[] {
  return posts
    .filter((p) => !p.draft && new Date(p.date).getTime() <= now.getTime())
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function tagToSlug(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[\s.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function collectTags(posts: Post[]): { tag: string; slug: string; count: number }[] {
  const bySlug = new Map<string, { tag: string; slug: string; count: number }>();
  for (const post of posts) {
    for (const tag of post.tags) {
      const slug = tagToSlug(tag);
      const entry = bySlug.get(slug);
      if (entry) entry.count += 1;
      else bySlug.set(slug, { tag, slug, count: 1 });
    }
  }
  return [...bySlug.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function assertUniqueSlugs(entries: { file: string; slug: string }[]): void {
  const seen = new Map<string, string>();
  for (const { file, slug } of entries) {
    const first = seen.get(slug);
    if (first) throw new Error(`duplicate post slug "${slug}": ${first} and ${file}`);
    seen.set(slug, file);
  }
}

/** All posts in a directory, validated, including drafts. */
export function loadPosts(dir: string = POSTS_DIR): Post[] {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md")).sort();
  const posts = files.map((file) => parsePost(file, readFileSync(join(dir, file), "utf8")));
  assertUniqueSlugs(files.map((file, i) => ({ file, slug: posts[i].slug })));
  return posts;
}

let cache: Post[] | undefined;

/** Published posts, newest first. */
export function getAllPosts(): Post[] {
  cache ??= selectPublished(loadPosts());
  return cache;
}

export function getPostBySlug(slug: string): Post | undefined {
  return getAllPosts().find((p) => p.slug === slug);
}

export function getPostsByTagSlug(slug: string): Post[] {
  return getAllPosts().filter((p) => p.tags.some((t) => tagToSlug(t) === slug));
}
