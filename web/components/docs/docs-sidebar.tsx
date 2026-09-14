"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { DocsLink, DocsNavNode } from "@/lib/docs-source";

const EASE = [0.16, 1, 0.3, 1] as const;

function PageLink({
  page,
  index,
  reduced,
  markerId,
}: {
  page: DocsLink;
  index: number;
  reduced: boolean;
  markerId: string;
}) {
  const pathname = usePathname();
  const here = pathname === page.url;

  return (
    <motion.li
      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduced ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: Math.min(index, 14) * 0.018 }
      }
    >
      <Link
        href={page.url}
        aria-current={here ? "page" : undefined}
        className={`group relative block py-[7px] pl-4 font-body text-[0.9rem] font-light leading-[1.35] transition-colors duration-400 ${
          here ? "text-dawn" : "text-bone/45 hover:text-bone"
        }`}
      >
        {here ? (
          <motion.span
            aria-hidden
            layoutId={markerId}
            transition={reduced ? { duration: 0 } : { duration: 0.45, ease: EASE }}
            className="absolute bottom-1 left-0 top-1 w-px bg-dawn"
          />
        ) : (
          <span
            aria-hidden
            className="absolute bottom-1 left-0 top-1 w-px origin-top scale-y-0 bg-bone/40 transition-transform duration-400 ease-out group-hover:scale-y-100"
          />
        )}
        {page.label}
      </Link>
    </motion.li>
  );
}

/**
 * The left rail. A group is closed until it is needed, and the one holding the page
 * being read is open. The dawn rule slides from the last page to the new one, which is
 * the only motion in this column.
 */
export function DocsSidebar({ nav, markerId = "docs-marker" }: { nav: DocsNavNode[]; markerId?: string }) {
  const pathname = usePathname();
  const reduced = useReducedMotion() ?? false;
  const [choice, setChoice] = useState<Record<string, boolean>>({});

  const groups = nav.filter((node) => node.kind === "group");
  const active = groups.find((node) => node.pages.some((page) => page.url === pathname));
  const openByDefault = (active ?? groups[0])?.title ?? null;

  let running = 0;

  return (
    <nav aria-label="documentation" className="pb-16">
      <ul>
        {nav.map((node) => {
          if (node.kind === "page") {
            return (
              <PageLink
                key={node.page.url}
                page={node.page}
                index={running++}
                reduced={reduced}
                markerId={markerId}
              />
            );
          }

          const open = choice[node.title] ?? node.title === openByDefault;

          return (
            <li key={node.title} className="pt-7 first:pt-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setChoice((was) => ({ ...was, [node.title]: !open }))}
                className="flex w-full items-center justify-between gap-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-bone/40 transition-colors duration-400 hover:text-bone/80"
              >
                {node.title}
                <span
                  aria-hidden
                  className={`inline-block text-[11px] leading-none transition-transform duration-400 ${
                    open ? "rotate-90" : ""
                  }`}
                >
                  &rsaquo;
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open ? (
                  <motion.div
                    initial={reduced ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduced ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <ul className="mt-1.5">
                      {node.pages.map((page, i) => (
                        <PageLink
                          key={page.url}
                          page={page}
                          index={i}
                          reduced={reduced}
                          markerId={markerId}
                        />
                      ))}
                    </ul>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
