"use client";

import { useEffect, useId, useRef, useState } from "react";

const BONE = "#ede6dc";
const GROUND = "#14100d";
const GROUND_DEEP = "#0c0908";

/**
 * The three architecture diagrams, drawn in the desk's own palette. Mermaid is loaded
 * only when a diagram is on the page, and only in the browser, because it reaches for
 * the DOM to measure text.
 *
 * When it cannot draw, the source of the diagram is shown instead. A reader is never
 * left with an empty frame where a diagram was promised.
 */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"drawing" | "drawn" | "failed">("drawing");

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: "var(--font-plex-sans), system-ui, sans-serif",
          // Without this a wide diagram is squeezed into the column and its labels go to
          // four points. It keeps its own width instead and the frame around it scrolls.
          flowchart: { useMaxWidth: false, htmlLabels: true },
          sequence: { useMaxWidth: false },
          themeVariables: {
            darkMode: true,
            background: GROUND,
            fontSize: "13px",
            primaryColor: "#1e1713",
            primaryTextColor: BONE,
            primaryBorderColor: "rgba(237, 230, 220, 0.22)",
            secondaryColor: "#241c17",
            tertiaryColor: GROUND_DEEP,
            lineColor: "rgba(237, 230, 220, 0.38)",
            textColor: BONE,
            mainBkg: "#1e1713",
            nodeBorder: "rgba(237, 230, 220, 0.22)",
            clusterBkg: "rgba(237, 230, 220, 0.03)",
            clusterBorder: "rgba(255, 125, 85, 0.38)",
            titleColor: BONE,
            edgeLabelBackground: GROUND,
            actorBkg: "#1e1713",
            actorBorder: "rgba(237, 230, 220, 0.22)",
            actorTextColor: BONE,
            actorLineColor: "rgba(237, 230, 220, 0.22)",
            signalColor: BONE,
            signalTextColor: BONE,
            labelBoxBkgColor: "#1e1713",
            labelBoxBorderColor: "rgba(255, 125, 85, 0.38)",
            labelTextColor: BONE,
            loopTextColor: BONE,
            noteBkgColor: "#241c17",
            noteBorderColor: "rgba(255, 125, 85, 0.38)",
            noteTextColor: BONE,
            sequenceNumberColor: GROUND,
          },
        });
        const { svg } = await mermaid.render(`vidiyal-${id}`, chart);
        if (!live || !host.current) return;
        host.current.innerHTML = svg;
        setState("drawn");
      } catch {
        if (live) setState("failed");
      }
    })();

    return () => {
      live = false;
    };
  }, [chart, id]);

  return (
    <figure className="docs-mermaid mt-10">
      <div
        className="overflow-x-auto rounded-lg border border-bone/10 bg-ground-deep/70 px-5 py-8"
        data-lenis-prevent
      >
        {state === "failed" ? (
          <pre className="font-mono text-[12px] leading-[1.6] text-bone/60">{chart}</pre>
        ) : (
          <div ref={host} className="min-h-[3rem]" />
        )}
      </div>
      <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-bone/30">
        {state === "drawing" ? "drawing the diagram" : null}
        {state === "drawn" ? "scroll the frame to follow a wide diagram" : null}
        {state === "failed" ? "the diagram could not be drawn, so here is its source" : null}
      </figcaption>
    </figure>
  );
}
