"use client";

import Lenis from "lenis";
import { useEffect } from "react";

let current: Lenis | null = null;

/** The live smooth-scroll instance, or null when the visitor asked for less motion. */
export function getLenis(): Lenis | null {
  return current;
}

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
    current = lenis;

    let frame = requestAnimationFrame(function tick(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      current = null;
    };
  }, []);

  return null;
}
