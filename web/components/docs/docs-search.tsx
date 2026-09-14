"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useDocsSearch } from "fumadocs-core/search/client";
import { fetchClient } from "fumadocs-core/search/client/fetch";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getLenis } from "@/components/smooth-scroll";

const EASE = [0.16, 1, 0.3, 1] as const;

function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(<mark>[\s\S]*?<\/mark>)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("<mark>") ? (
          <mark key={i} className="bg-transparent text-dawn">
            {part.slice(6, -7)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * Search over every docs page, indexed from the same content the pages are built from.
 * The panel opens on the button or on the key everyone already presses.
 */
export function DocsSearch() {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;
  const input = useRef<HTMLInputElement>(null);

  const client = useMemo(() => fetchClient({ api: "/docs/api/search" }), []);
  const { search, setSearch, query } = useDocsSearch({ client });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((was) => !was);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      getLenis()?.start();
      return;
    }
    getLenis()?.stop();
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      getLenis()?.start();
    };
  }, [open]);

  const results = Array.isArray(query.data) ? query.data : [];

  function type(value: string) {
    setSearch(value);
    setAt(0);
  }

  function go(url: string) {
    setOpen(false);
    setSearch("");
    router.push(url);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-3 rounded-lg border border-bone/15 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/45 transition-colors duration-400 hover:border-bone/35 hover:text-bone"
      >
        search the docs
        <span className="rounded-[4px] border border-bone/15 px-1.5 py-0.5 text-[9px] text-bone/35 transition-colors duration-400 group-hover:text-bone/60">
          ctrl k
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.25, ease: EASE }}
            className="fixed inset-0 z-[60] flex items-start justify-center bg-ground-deep/80 px-5 pt-[14vh] backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal
              aria-label="search the documentation"
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
              transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[38rem] overflow-hidden rounded-lg border border-bone/15 bg-ground shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]"
            >
              <div className="flex items-center gap-4 border-b border-bone/10 px-5 py-4">
                <span aria-hidden className="font-mono text-[11px] text-dawn">
                  /
                </span>
                <input
                  ref={input}
                  value={search}
                  onChange={(event) => type(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setAt((was) => Math.min(was + 1, Math.max(results.length - 1, 0)));
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setAt((was) => Math.max(was - 1, 0));
                    }
                    if (event.key === "Enter" && results[at]) go(results[at].url);
                  }}
                  placeholder="a symbol, a detector, a variable name"
                  className="w-full bg-transparent font-body text-[1rem] font-light text-bone outline-none placeholder:text-bone/25"
                />
              </div>

              <div className="max-h-[52vh] overflow-y-auto docs-scroll" data-lenis-prevent>
                {search.length === 0 ? (
                  <p className="px-5 py-6 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/30">
                    every page, every heading, every line of these docs
                  </p>
                ) : null}
                {search.length > 0 && query.data === "empty" ? (
                  <p className="px-5 py-6 font-body text-[0.95rem] font-light text-bone/50">
                    Nothing in the docs matches that.
                  </p>
                ) : null}
                {results.map((result, i) => (
                  <button
                    key={result.id}
                    type="button"
                    onMouseEnter={() => setAt(i)}
                    onClick={() => go(result.url)}
                    className={`block w-full border-b border-bone/[0.06] px-5 py-3.5 text-left transition-colors duration-200 ${
                      i === at ? "bg-bone/[0.05]" : ""
                    }`}
                  >
                    {result.breadcrumbs && result.breadcrumbs.length > 0 ? (
                      <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.16em] text-bone/30">
                        {result.breadcrumbs.join(" / ")}
                      </span>
                    ) : null}
                    <span
                      className={`block font-body text-[0.95rem] leading-[1.45] ${
                        result.type === "page" ? "font-normal text-bone" : "font-light text-bone/65"
                      }`}
                    >
                      <Highlighted text={result.content} />
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
