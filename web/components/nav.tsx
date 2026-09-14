"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./wordmark";

const LINKS = [
  { href: "/", label: "shelf" },
  { href: "/patterns", label: "patterns" },
  { href: "/checklist", label: "checklist" },
  { href: "/gate", label: "gate" },
  { href: "/ask", label: "ask" },
  { href: "/docs", label: "docs" },
];

const QUIET =
  "group relative inline-flex items-center gap-2 py-1 font-mono text-[10px] uppercase tracking-[0.17em] text-bone/45 transition-colors duration-500 hover:text-dawn md:text-[11px] md:tracking-[0.2em]";

/**
 * The desk's own spine: the wordmark where it has always been, the rooms of the review,
 * and the one thing a reader can do with their own record. It sits at the top right on a
 * wide screen and drops to a strip along the foot on a narrow one, where the hero's
 * headline owns the top of the page.
 */
export function Nav() {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  const home = pathname === "/";

  return (
    <>
      {/* The shelf keeps its open top. Every other page scrolls a column of text under the
          wordmark, so those get a scrim to read against. */}
      {home ? null : (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-30 h-32 bg-gradient-to-b from-ground via-ground/80 to-transparent md:h-36"
        />
      )}
      <Wordmark />
      <motion.nav
        initial={{ opacity: 0, y: reduced ? 0 : -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
        aria-label="the review"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-bone/10 bg-ground/85 backdrop-blur-md md:inset-x-auto md:bottom-auto md:right-[4vw] md:top-[3vh] md:border-0 md:bg-transparent md:backdrop-blur-none"
      >
        {/* On a narrow window the invitation gets its own quiet row above the rooms, where
            it is reachable with a thumb and never crowds the six labels beneath it. */}
        <div className="border-b border-bone/10 px-5 py-2 text-right md:hidden">
          <Link href="/connect" className={QUIET}>
            review my trades
            <span
              aria-hidden
              className="inline-block transition-transform duration-500 group-hover:translate-x-1"
            >
              &rarr;
            </span>
          </Link>
        </div>

        <ul className="flex items-center justify-between px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.17em] md:justify-end md:gap-7 md:px-0 md:py-0 md:text-[11px] md:tracking-[0.2em]">
          {LINKS.map((link) => {
            const here = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={here ? "page" : undefined}
                  className={`group relative block py-1 transition-colors duration-500 ${
                    here ? "text-dawn" : "text-bone/45 hover:text-bone"
                  }`}
                >
                  {link.label}
                  <span
                    aria-hidden
                    className={`absolute -bottom-0.5 left-0 h-px w-full origin-left bg-current transition-transform duration-500 ease-out ${
                      here ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                </Link>
              </li>
            );
          })}

          <li aria-hidden className="hidden md:block">
            <span className="block h-3 w-px bg-bone/15" />
          </li>
          <li className="hidden md:block">
            <Link href="/connect" className={QUIET}>
              review my trades
              <span
                aria-hidden
                className="inline-block transition-transform duration-500 group-hover:translate-x-1"
              >
                &rarr;
              </span>
            </Link>
          </li>
        </ul>
      </motion.nav>
    </>
  );
}
