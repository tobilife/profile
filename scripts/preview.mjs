// Serves out/ at http://localhost:4173/profile/ the way GitHub Pages will: unknown paths get out/404.html with status 404.
// Run with: npm run preview   (after npm run build)
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const OUT = join(process.cwd(), "out");
const BASE = "/profile";
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function resolveFile(urlPath) {
  if (!urlPath.startsWith(BASE)) return null;
  const rel = normalize(decodeURIComponent(urlPath.slice(BASE.length) || "/"));
  if (rel.includes("..")) return null;
  const p = join(OUT, rel);
  if (existsSync(p) && statSync(p).isFile()) return p;
  if (existsSync(join(p, "index.html"))) return join(p, "index.html");
  if (existsSync(p + ".html")) return p + ".html";
  return null;
}

createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/" || path === BASE) {
    res.writeHead(301, { Location: BASE + "/" });
    return res.end();
  }
  const file = resolveFile(path);
  if (!file) {
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    return createReadStream(join(OUT, "404.html")).pipe(res);
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`preview: http://localhost:${PORT}${BASE}/`));
