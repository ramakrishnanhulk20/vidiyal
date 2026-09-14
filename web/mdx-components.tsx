import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { Mermaid } from "@/components/docs/mermaid";

function Anchor({ id }: { id?: string }) {
  if (!id) return null;
  return (
    <a
      href={`#${id}`}
      aria-label="link to this heading"
      className="ml-3 align-middle font-mono text-[0.55em] text-dawn opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-visible:opacity-100"
    >
      #
    </a>
  );
}

const components: MDXComponents = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h2
      {...props}
      className="group mt-20 scroll-mt-[140px] font-display text-[clamp(1.6rem,3vw,2.1rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-bone"
    >
      {props.children}
      <Anchor id={props.id} />
    </h2>
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2
      {...props}
      className="group mt-16 scroll-mt-[140px] border-t border-bone/10 pt-8 font-display text-[clamp(1.5rem,2.8vw,1.95rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-bone first:mt-10"
    >
      {props.children}
      <Anchor id={props.id} />
    </h2>
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3
      {...props}
      className="group mt-12 scroll-mt-[140px] font-display text-[1.22rem] font-semibold leading-[1.2] tracking-[-0.02em] text-bone/95"
    >
      {props.children}
      <Anchor id={props.id} />
    </h3>
  ),
  h4: (props: ComponentPropsWithoutRef<"h4">) => (
    <h4
      {...props}
      className="group mt-10 scroll-mt-[140px] font-mono text-[11px] uppercase tracking-[0.18em] text-bone/50"
    >
      {props.children}
      <Anchor id={props.id} />
    </h4>
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p
      {...props}
      className="mt-6 max-w-[68ch] font-body text-[1.02rem] font-light leading-[1.72] text-bone/75"
    />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul {...props} className="mt-6 max-w-[68ch] space-y-3 pl-0" />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol {...props} className="mt-6 max-w-[68ch] list-decimal space-y-3 pl-6 marker:font-mono marker:text-[0.8em] marker:text-dawn/70" />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li {...props} className="font-body text-[1.02rem] font-light leading-[1.7] text-bone/75" />
  ),
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong {...props} className="font-normal text-bone" />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      {...props}
      className="mt-8 max-w-[66ch] border-l-2 border-dawn/60 pl-6 font-display text-[1.1rem] font-light italic leading-[1.5] text-bone/85"
    />
  ),
  hr: () => <div aria-hidden className="mt-14 h-px w-full bg-bone/10" />,
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="docs-table-scroll mt-8 overflow-x-auto" data-lenis-prevent>
      <table {...props} className="w-full min-w-[34rem] border-collapse text-left" />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th
      {...props}
      className="border-b border-bone/20 pb-3 pr-6 align-bottom font-mono text-[10px] uppercase tracking-[0.16em] text-bone/45 last:pr-0"
    />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td
      {...props}
      className="border-b border-bone/10 py-3.5 pr-6 align-top font-body text-[0.93rem] font-light leading-[1.55] text-bone/75 last:pr-0"
    />
  ),
  a: ({ href = "", ...props }: ComponentPropsWithoutRef<"a">) => {
    const external = href.startsWith("http");
    const className =
      "text-bone underline decoration-dawn/50 decoration-1 underline-offset-[5px] transition-colors duration-400 hover:text-dawn hover:decoration-dawn";
    if (external) {
      return <a href={href} target="_blank" rel="noreferrer" className={className} {...props} />;
    }
    return <Link href={href} className={className} {...props} />;
  },
  Mermaid,
};

export function getMDXComponents(extra?: MDXComponents): MDXComponents {
  return { ...components, ...extra };
}
