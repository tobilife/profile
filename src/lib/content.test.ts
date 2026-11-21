// Checks the real content/posts folder. Written so that adding a post never breaks it:
// it pins the three migrated posts and checks properties every post must have.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";
import { getAllPosts } from "./posts";

const MIGRATED: Record<string, string> = {
  "sim-studio-complete-guide": "2025-05-27",
  "rag-blog-post": "2025-04-13",
  "tobylife-blog-ai-rag": "2024-05-19",
};

describe("content/posts", () => {
  const posts = getAllPosts();

  it("contains the three migrated posts with their original dates in AI 실전", () => {
    for (const [slug, day] of Object.entries(MIGRATED)) {
      const post = posts.find((p) => p.slug === slug);
      expect(post, slug).toBeDefined();
      expect(post!.date.startsWith(day), `${slug} date ${post!.date}`).toBe(true);
      expect(post!.category).toBe("AI 실전");
    }
  });

  it("dates every newer post after the last migrated one", () => {
    const fresh = posts.filter((p) => !(p.slug in MIGRATED));
    expect(fresh.length).toBeGreaterThanOrEqual(30);
    for (const p of fresh) expect(p.date >= "2025-05-28", `${p.slug} ${p.date}`).toBe(true);
  });

  it("renders every post and every referenced local image exists", async () => {
    for (const p of posts) {
      const { html } = await renderMarkdown(p.body);
      const images = [...html.matchAll(/src="\/profile(\/images\/[^"]+)"/g)].map((m) => m[1]);
      if (p.cover) images.push(p.cover);
      for (const src of images) {
        expect(existsSync(join(process.cwd(), "public", decodeURI(src))), `${p.slug}: ${src}`).toBe(true);
      }
    }
  }, 120_000);
});
