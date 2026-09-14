"use client";

import { TOCItem, type TOCItemType } from "fumadocs-core/toc";
import type { MouseEvent } from "react";
import { getLenis } from "@/components/smooth-scroll";

/**
 * The right rail. Headings are followed as the reader scrolls, and a click is handed to
 * the same smooth scroll the rest of the desk uses, landing the heading clear of the
 * wordmark rather than under it.
 */
export function DocsToc({ toc }: { toc: TOCItemType[] }) {
  if (toc.length === 0) return null;

  function jump(event: MouseEvent<HTMLAnchorElement>, url: string) {
    const lenis = getLenis();
    const target = document.getElementById(url.slice(1));
    if (!lenis || !target) return;
    event.preventDefault();
    lenis.scrollTo(target, { offset: -140 });
    window.history.replaceState(null, "", url);
  }

  return (
    <div>
      <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-bone/35">
        on this page
      </span>
      <ul className="mt-5 border-l border-bone/10">
        {toc.map((item) => (
          <li key={item.url}>
            <TOCItem
              href={item.url}
              onClick={(event) => jump(event, item.url)}
              style={{ paddingLeft: `${0.9 + Math.max(0, item.depth - 2) * 0.75}rem` }}
              className="block border-l border-transparent py-[5px] font-body text-[0.82rem] font-light leading-[1.35] text-bone/40 transition-colors duration-400 hover:text-bone data-[active=true]:border-dawn data-[active=true]:text-dawn"
            >
              {item.title}
            </TOCItem>
          </li>
        ))}
      </ul>
    </div>
  );
}
