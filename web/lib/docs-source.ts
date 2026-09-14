import { loader } from "fumadocs-core/source";
import type { Folder, Node, Root } from "fumadocs-core/page-tree";
import { docs } from "@/.source/server";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});

export type DocsLink = { url: string; label: string };

export type DocsNavNode =
  | { kind: "page"; page: DocsLink }
  | { kind: "group"; title: string; pages: DocsLink[] };

function textOf(name: unknown): string {
  return typeof name === "string" ? name : "";
}

/** The short name a page asked for in its frontmatter, falling back to its title. */
function labelFor(url: string, fallback: string): string {
  const page = source.getPages().find((candidate) => candidate.url === url);
  const label = page?.data.label;
  return typeof label === "string" && label.length > 0 ? label : fallback;
}

/**
 * The sidebar, flattened to the two levels this project has: a named group, or a page
 * standing on its own. The order is the page tree's own, which is the order the
 * meta.json files set, so nothing here is a second list that can fall behind.
 */
export function docsNav(): DocsNavNode[] {
  const tree = source.pageTree as Root;
  const nodes: DocsNavNode[] = [];

  for (const node of tree.children as Node[]) {
    if (node.type === "page") {
      nodes.push({ kind: "page", page: { url: node.url, label: labelFor(node.url, textOf(node.name)) } });
      continue;
    }
    if (node.type !== "folder") continue;
    const folder = node as Folder;
    const pages = (folder.children as Node[])
      .filter((child): child is Extract<Node, { type: "page" }> => child.type === "page")
      .map((child) => ({ url: child.url, label: labelFor(child.url, textOf(child.name)) }));
    if (pages.length > 0) nodes.push({ kind: "group", title: textOf(folder.name), pages });
  }

  return nodes;
}

/** The group a page belongs to, which the page prints above its title. */
export function sectionOf(url: string): string | null {
  for (const node of docsNav()) {
    if (node.kind !== "group") continue;
    if (node.pages.some((page) => page.url === url)) return node.title;
  }
  return null;
}

/** The page before and after this one in reading order, for the foot of the page. */
export function neighbours(url: string): { previous: DocsLink | null; next: DocsLink | null } {
  const flat = docsNav().flatMap((node) => (node.kind === "page" ? [node.page] : node.pages));
  const at = flat.findIndex((page) => page.url === url);
  if (at === -1) return { previous: null, next: null };
  return {
    previous: at > 0 ? flat[at - 1] : null,
    next: at < flat.length - 1 ? flat[at + 1] : null,
  };
}
