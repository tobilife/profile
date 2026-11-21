import type { Metadata } from "next";
import { Nanum_Gothic_Coding, Noto_Sans_KR } from "next/font/google";
import { DEFAULT_OG_IMAGE, SITE, absoluteUrl } from "@/lib/site";
import "./globals.css";
import "./console.css";
import "./blog.css";

const body = Noto_Sans_KR({
  weight: ["400", "700", "800"],
  variable: "--font-noto-sans-kr",
  display: "swap",
  preload: false,
});

const mono = Nanum_Gothic_Coding({
  weight: ["400", "700"],
  variable: "--font-nanum-coding",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl("/")),
  title: { default: `${SITE.name} | 보험 IT 개발자`, template: `%s | ${SITE.handle}` },
  description: "손해보험 3사의 기간계와 비대면 채널 시스템을 만들어 온 개발자 정상기의 경력과, AI 에이전트 엔지니어링 블로그입니다.",
  alternates: { types: { "application/rss+xml": absoluteUrl("/rss.xml") } },
  openGraph: {
    siteName: `${SITE.handle} 블로그`,
    locale: "ko_KR",
    type: "website",
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630, alt: `${SITE.name}, 보험 IT 개발자` }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Motion is always on (owner's choice); the attribute stays so the CSS can scope every animation to it.
    <html lang="ko" className={`${body.variable} ${mono.variable}`} data-motion="on">
      <body>{children}</body>
    </html>
  );
}
