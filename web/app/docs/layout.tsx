import type { ReactNode } from "react";
import { DocsHeader } from "@/components/docs/docs-header";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { Footer } from "@/components/footer";
import { docsNav } from "@/lib/docs-source";

export default function DocsLayout({ children }: { children: ReactNode }) {
  const nav = docsNav();

  return (
    <div className="docs-shell">
      <div className="px-6 pt-[122px] md:px-[5vw] md:pt-[138px]">
        <DocsHeader />

        <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-x-14">
          <aside className="hidden lg:block">
            <div
              className="docs-scroll sticky top-[138px] h-[calc(100svh-190px)] overflow-y-auto border-r border-bone/10 pr-6 pt-10"
              data-lenis-prevent
            >
              <DocsSidebar nav={nav} markerId="docs-marker-rail" />
            </div>
          </aside>

          <details className="group mt-8 border-b border-bone/10 pb-4 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/45 transition-colors duration-400 hover:text-bone">
              contents
              <span
                aria-hidden
                className="text-[11px] leading-none transition-transform duration-400 group-open:rotate-90"
              >
                &rsaquo;
              </span>
            </summary>
            <div className="pt-4">
              <DocsSidebar nav={nav} markerId="docs-marker-drawer" />
            </div>
          </details>

          <div className="min-w-0">{children}</div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
