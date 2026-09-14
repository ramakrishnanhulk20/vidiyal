import { AnchorProvider } from "fumadocs-core/toc";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsToc } from "@/components/docs/docs-toc";
import { Rise } from "@/components/editorial";
import { neighbours, sectionOf, source } from "@/lib/docs-source";
import { getMDXComponents } from "@/mdx-components";

type Params = { slug?: string[] };

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) return {};
  return { title: `${page.data.title} | Vidiyal` };
}

export default async function DocPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const Body = page.data.body;
  const section = sectionOf(page.url);
  const { previous, next } = neighbours(page.url);

  return (
    <AnchorProvider toc={page.data.toc}>
      <div className="pt-12 xl:grid xl:grid-cols-[minmax(0,1fr)_12.5rem] xl:gap-x-14">
        <article className="min-w-0 pb-24">
          <Rise>
            <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-dawn/80 md:text-[11px]">
              {section ?? "Vidiyal"}
            </span>
            <h1 className="mt-4 max-w-[20ch] font-display text-[clamp(2.1rem,4.6vw,3.4rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-bone">
              {page.data.title}
            </h1>
          </Rise>

          <div className="mt-10 xl:hidden">
            <details className="group border-y border-bone/10 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40">
                on this page
                <span
                  aria-hidden
                  className="text-[11px] leading-none transition-transform duration-400 group-open:rotate-90"
                >
                  &rsaquo;
                </span>
              </summary>
              <div className="pt-5">
                <DocsToc toc={page.data.toc} />
              </div>
            </details>
          </div>

          <Rise delay={0.08} className="docs-prose mt-4">
            <Body components={getMDXComponents()} />
          </Rise>

          {previous || next ? (
            <nav className="mt-24 grid gap-8 border-t border-bone/10 pt-10 sm:grid-cols-2">
              {previous ? (
                <Link href={previous.url} className="group block">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-bone/30">
                    before this
                  </span>
                  <span className="mt-2.5 block font-display text-[1.15rem] font-light italic leading-[1.2] tracking-[-0.02em] text-bone/80 transition-colors duration-500 group-hover:text-dawn">
                    {previous.label}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={next.url} className="group block sm:text-right">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-bone/30">
                    after this
                  </span>
                  <span className="mt-2.5 block font-display text-[1.15rem] font-light italic leading-[1.2] tracking-[-0.02em] text-bone/80 transition-colors duration-500 group-hover:text-dawn">
                    {next.label}
                  </span>
                </Link>
              ) : null}
            </nav>
          ) : null}
        </article>

        <aside className="hidden xl:block">
          <div
            className="docs-scroll sticky top-[138px] max-h-[calc(100svh-190px)] overflow-y-auto pt-12"
            data-lenis-prevent
          >
            <DocsToc toc={page.data.toc} />
          </div>
        </aside>
      </div>
    </AnchorProvider>
  );
}
