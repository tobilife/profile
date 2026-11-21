import { ImageResponse } from "next/og";
import { TOPOLOGY } from "@/lib/topology";

// Served as /profile/og.png: the default share image. A route (not the opengraph-image
// convention) so the exported file keeps its .png extension on GitHub Pages.
const size = { width: 1200, height: 630 };
export const dynamic = "force-static";

const TITLE = "정상기";
const LINE = "손해보험 IT 개발자, AI 에이전트 엔지니어링";

// Google Fonts returns a subset with exactly these glyphs when given `text=`.
async function koreanFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800&text=${encodeURIComponent(text)}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const font = await koreanFont(TITLE + LINE);
  const art = TOPOLOGY.join("\n");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0f0e", color: "#d5d9d3", padding: 64 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <div style={{ fontSize: 28, color: "#78c27c", fontFamily: "monospace" }}>tobilife.github.io/profile</div>
          <div style={{ fontSize: 112, fontWeight: 800, color: "#ffffff", fontFamily: font ? "Noto Sans KR" : "sans-serif" }}>{TITLE}</div>
          <div style={{ fontSize: 34, fontFamily: font ? "Noto Sans KR" : "sans-serif" }}>{LINE}</div>
        </div>
        <div style={{ display: "flex", whiteSpace: "pre", fontFamily: "monospace", fontSize: 15, lineHeight: 1.25, color: "#78c27c" }}>{art}</div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Noto Sans KR", data: font, weight: 800, style: "normal" }] : undefined },
  );
}
