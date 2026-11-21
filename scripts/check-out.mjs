// Checks the static export in out/ after `npm run build`. Exits 1 on any failure.
// Run with: npm run check
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const OUT = join(process.cwd(), "out");
const failures = [];
const fail = (msg) => failures.push(msg);
const read = (rel) => readFileSync(join(OUT, rel), "utf8");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

if (!existsSync(join(OUT, "index.html"))) {
  console.error("out/index.html missing: run npm run build first");
  process.exit(1);
}

const allHtml = walk(OUT).filter((f) => f.endsWith(".html"));
const rel = (f) => relative(OUT, f).replaceAll("\\", "/");

// ---- home page -------------------------------------------------------------
{
  const home = read("index.html");
  const must = [
    "정상기",
    "happytobilife@gmail.com",
    "mailto:happytobilife@gmail.com",
    "2009.03 ~ 2017.12",
    "산출지원센터 TM 신규 시스템 구축",
    "2026.09 ~ 2026.12",
    "자동차 TM 유지보수",
    "2012 운영 최우수상",
    "application/ld+json",
    "data-career-years",
    "거대한 레거시를 이해하고, 오래가는 구조로 바꿉니다",
    'class="code-wall"',
    "사이드 프로젝트로 AI 에이전트 하네스를 만들고 있습니다",
  ];
  for (const text of must) if (!home.includes(text)) fail(`index.html: missing "${text}"`);

  const career = home.slice(home.indexOf('id="career"'), home.indexOf('id="strengths-title"'));
  const details = career.match(/<details[^>]*>/g) ?? [];
  if (details.length === 0 || details.some((d) => !/\sopen(=|\s|>)/.test(d))) {
    fail(`index.html: career details must all start open (${details.filter((d) => !/\sopen(=|\s|>)/.test(d)).length} closed)`);
  }

  const order = ["한화손해보험", "현대해상", "메리츠화재"].map((n) => home.indexOf(n));
  if (order.some((i) => i < 0) || !(order[0] < order[1] && order[1] < order[2])) {
    fail(`index.html: companies not in newest-first order (positions ${order.join(", ")})`);
  }
}

// ---- hero diagram: the system topology, drawn in the HTML; no WebGL shipped ------------
{
  const home = read("index.html");
  const topo = home.match(/<pre class="topo[^"]*"[^>]*>([\s\S]*?)<\/pre>/)?.[1] ?? "";
  const text = topo.replace(/<[^>]+>/g, "");
  for (const part of ["CM channel", "EAI", "contract", "claim", "batch", "FEP"]) {
    if (!text.includes(part)) fail(`index.html: topology diagram is missing "${part}"`);
  }
  if ((topo.match(/data-rc="/g) ?? []).length < 20) fail("index.html: topology wires are not addressable for the request animation");
  const chunks = walk(join(OUT, "_next")).filter((f) => f.endsWith(".js"));
  const withThree = chunks.filter((f) => readFileSync(f, "utf8").includes("WebGLRenderer"));
  if (withThree.length) fail(`three.js is still shipped in ${withThree.length} chunk(s)`);
}

// ---- blog, tags, feeds -------------------------------------------------------
{
  const postsDir = join(process.cwd(), "content", "posts");
  // Same rule as selectPublished() in src/lib/posts.ts: not a draft, and dated today or earlier.
  const now = Date.now();
  const published = readdirSync(postsDir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => {
      const src = readFileSync(join(postsDir, f), "utf8");
      if (/^draft:\s*true\s*$/m.test(src)) return false;
      const date = src.match(/^date:\s*["']?([^"'\n]+)/m)?.[1];
      return !date || new Date(date).getTime() <= now;
    })
    .map((f) => f.replace(/\.md$/, "").toLowerCase());

  if (!existsSync(join(OUT, "blog", "index.html"))) fail("out/blog/index.html missing");
  for (const slug of published) {
    const file = join(OUT, "blog", slug, "index.html");
    if (!existsSync(file)) {
      fail(`post page missing: blog/${slug}/index.html`);
      continue;
    }
    const html = readFileSync(file, "utf8");
    for (const prop of ["og:title", "og:description", "og:image"]) {
      if (!html.includes(`property="${prop}"`)) fail(`blog/${slug}: no ${prop}`);
    }
    const img = html.match(/property="og:image" content="([^"]+)"/)?.[1] ?? "";
    if (!img.startsWith("https://tobilife.github.io/profile/")) fail(`blog/${slug}: og:image not absolute (${img})`);
  }
  for (const tag of ["sim-studio", "next-js", "검색-시스템"]) {
    if (!existsSync(join(OUT, "blog", "tag", tag, "index.html"))) fail(`tag page missing: blog/tag/${tag}/`);
  }
  if (!existsSync(join(OUT, "rss.xml"))) fail("out/rss.xml missing");
  else {
    const rss = read("rss.xml");
    const items = rss.match(/<item>/g)?.length ?? 0;
    if (items !== published.length) fail(`rss.xml: ${items} items, expected ${published.length}`);
    const links = [...rss.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)].map((m) => m[1]);
    if (links.some((l) => !l.startsWith("https://tobilife.github.io/profile/blog/"))) fail("rss.xml: item link not absolute under /profile/blog/");
  }
  for (const f of ["sitemap.xml", "robots.txt", "404.html"]) if (!existsSync(join(OUT, f))) fail(`out/${f} missing`);
  if (existsSync(join(OUT, "sitemap.xml"))) {
    const n = read("sitemap.xml").match(/<loc>/g)?.length ?? 0;
    if (n < published.length + 2) fail(`sitemap.xml: only ${n} urls`);
  }
  if (existsSync(join(OUT, "404.html")) && !read("404.html").includes("Kernel panic")) fail("404.html: not the kernel panic page");
}

// ---- every og:image is a real image file with an image extension ------------------
{
  const PREFIX = "https://tobilife.github.io/profile/";
  for (const f of allHtml) {
    const html = readFileSync(f, "utf8");
    for (const m of html.matchAll(/property="og:image" content="([^"]+)"/g)) {
      const url = m[1];
      if (!url.startsWith(PREFIX)) continue;
      const path = decodeURIComponent(url.slice(PREFIX.length).split("?")[0]);
      if (!/\.(png|jpe?g|webp)$/i.test(path)) fail(`${rel(f)}: og:image has no image extension (${url})`);
      else if (!existsSync(join(OUT, path))) fail(`${rel(f)}: og:image file missing (${path})`);
    }
  }
}

// ---- internal links: everything under /profile/ resolves to a file in out/ ----------
{
  const target = (path) => {
    const clean = decodeURIComponent(path.split(/[?#]/)[0]).slice("/profile".length) || "/";
    const p = join(OUT, clean);
    if (clean.endsWith("/")) return existsSync(join(p, "index.html"));
    return existsSync(p) || existsSync(p + ".html");
  };
  let checked = 0;
  for (const f of allHtml) {
    // next/font emits <link rel="preconnect" href="/"> for self-hosted fonts: a same-origin hint, not a link.
    const html = readFileSync(f, "utf8").replace(/<link rel="preconnect"[^>]*>/g, "");
    for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      const url = m[1].replaceAll("&amp;", "&");
      if (!url.startsWith("/") || url.startsWith("//")) continue;
      checked += 1;
      if (url !== "/profile" && !url.startsWith("/profile/")) fail(`${rel(f)}: link outside the base path: ${url}`);
      else if (!target(url)) fail(`${rel(f)}: broken internal link ${url}`);
    }
  }
  if (checked < 100) fail(`link check saw only ${checked} internal links`);
}

// ---- forbidden anywhere ------------------------------------------------------
{
  // The stale career facts are checked on the career page only; posts may legitimately say "2015년".
  const home = read("index.html");
  for (const re of [/(?<!\d)15년/, /2013\.09/]) if (re.test(home)) fail(`index.html: contains forbidden ${re}`);
  const forbidden = [/linkedin/i, /tobilife\.webp/];
  for (const f of allHtml) {
    const html = readFileSync(f, "utf8");
    for (const re of forbidden) if (re.test(html)) fail(`${rel(f)}: contains forbidden ${re}`);
  }
}

if (failures.length) {
  console.error(`check-out: ${failures.length} failure(s)`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-out: ok (${allHtml.length} html files)`);
