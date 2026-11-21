// Markdown -> HTML for blog posts, run at build time.
import rehypeShiki from "@shikijs/rehype";
import type { Element, Root as HastRoot } from "hast";
import { toString as hastToString } from "hast-util-to-string";
import type { Root as MdastRoot, PhrasingContent } from "mdast";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import type { BuiltinLanguage } from "shiki";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";
import { withBase } from "./site";

export type Heading = { depth: 2 | 3; id: string; text: string };

const CALLOUTS = new Set(["note", "tip", "important", "caution", "warning"]);

const LANGS: BuiltinLanguage[] = [ "json", "yaml", "bash", "python", "ts", "typescript", "javascript", "powershell", "sql", "java", "xml", "html", "css", "diff"];

/**
 * `:::note` ... `:::` becomes an <aside class="callout callout-note">. Any other directive is turned
 * back into what the author typed, so a stray colon in prose ("Note:foo") never swallows text.
 */
function remarkCallouts() {
  return (tree: MdastRoot) => {
    visit(tree, (node, index, parent) => {
      if (node.type === "containerDirective") {
        const d = node as ContainerDirective;
        if (CALLOUTS.has(d.name)) {
          d.data = { hName: "aside", hProperties: { className: ["callout", `callout-${d.name}`] } };
        } else {
          d.data = { hName: "div" };
        }
        return;
      }
      if ((node.type === "leafDirective" || node.type === "textDirective") && parent && index !== undefined) {
        const d = node as LeafDirective | TextDirective;
        const marker = node.type === "leafDirective" ? "::" : ":";
        const restored: PhrasingContent[] = [{ type: "text", value: marker + d.name }, ...(d.children as PhrasingContent[])];
        if (node.type === "leafDirective") {
          parent.children.splice(index, 1, { type: "paragraph", children: restored });
        } else {
          parent.children.splice(index, 1, ...restored);
        }
        return [SKIP, index];
      }
    });
  };
}

/** Site-relative links and images get the /profile base path; external links open in a new tab. */
function rehypeLinks() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "img" && typeof node.properties.src === "string") {
        node.properties.src = withBase(node.properties.src);
        node.properties.loading = "lazy";
      }
      if (node.tagName === "a" && typeof node.properties.href === "string") {
        const href = node.properties.href;
        if (/^https?:\/\//.test(href)) {
          node.properties.target = "_blank";
          node.properties.rel = ["noopener", "noreferrer"];
        } else {
          node.properties.href = withBase(href);
        }
      }
    });
  };
}

function collectHeadings(into: Heading[]) {
  return () => (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if ((node.tagName === "h2" || node.tagName === "h3") && typeof node.properties.id === "string") {
        into.push({ depth: node.tagName === "h2" ? 2 : 3, id: node.properties.id, text: hastToString(node).trim() });
      }
    });
  };
}

export async function renderMarkdown(md: string): Promise<{ html: string; headings: Heading[] }> {
  const headings: Heading[] = [];
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkCallouts)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(collectHeadings(headings))
    .use(rehypeLinks)
    .use(rehypeShiki, { theme: "github-dark-default", langs: LANGS, fallbackLanguage: "text", defaultLanguage: "text" })
    .use(rehypeStringify)
    .process(md);
  return { html: String(file), headings };
}
