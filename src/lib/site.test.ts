import { describe, expect, it } from "vitest";
import { SITE, absoluteUrl, withBase } from "./site";

describe("withBase", () => {
  it("prefixes site-relative paths with the base path", () => {
    expect(withBase("/blog/")).toBe("/profile/blog/");
  });

  it("does not prefix a path that already carries the base path", () => {
    expect(withBase("/profile/blog/")).toBe("/profile/blog/");
    expect(withBase("/profile")).toBe("/profile");
  });

  it("leaves absolute, protocol-relative, anchor and mail links alone", () => {
    expect(withBase("https://example.com/a")).toBe("https://example.com/a");
    expect(withBase("//cdn.example.com/a.js")).toBe("//cdn.example.com/a.js");
    expect(withBase("#top")).toBe("#top");
    expect(withBase("mailto:a@b.c")).toBe("mailto:a@b.c");
  });

  it("does not mistake a sibling path that starts with the base name", () => {
    expect(withBase("/profiles/x")).toBe("/profile/profiles/x");
  });
});

describe("absoluteUrl", () => {
  it("builds the public URL on the GitHub Pages origin", () => {
    expect(absoluteUrl("/blog/")).toBe("https://tobilife.github.io/profile/blog/");
  });
});

describe("SITE", () => {
  it("exposes the fixed identity values", () => {
    expect(SITE).toMatchObject({
      name: "정상기",
      handle: "토비라이프",
      email: "happytobilife@gmail.com",
      origin: "https://tobilife.github.io",
      basePath: "/profile",
      careerStart: "2009-03",
    });
  });
});
