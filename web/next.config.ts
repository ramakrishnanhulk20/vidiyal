import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // A verification build must never write into the folder the dev server is serving from.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The engine and its lockfile sit one level up, so the root has to be named or Next
  // guesses. It is the folder that holds both web/ and the engine the desk compiles.
  turbopack: { root: resolve(here, "..") },
  // Next writes its own AGENTS.md and CLAUDE.md on every dev boot unless this is off.
  agentRules: false,
  // On Vercel the root directory is web/, so only web/node_modules is ever installed.
  // The engine files one folder up ask for their packages by bare name and Node would
  // look for them beside themselves, in a vidiyal/node_modules that is not there. This
  // adds web's own packages as the last place to look, wherever the build runs. Last, not
  // first: a package that ships its own copy of a dependency has to keep winning, or the
  // hoisted copy at the top gets handed to a package that cannot use it. The sign-in SDK
  // is the case that proves it, through viem and its own newer copy of ox.
  webpack: (config) => {
    const own = resolve(here, "node_modules");
    const existing = config.resolve.modules ?? ["node_modules"];
    config.resolve.modules = [...existing.filter((dir: string) => dir !== own), own];
    return config;
  },
  // The story used to live at /story and is now the home page. Anything already pointing
  // at the old address, a link in a post or a judge's bookmark, lands on the same reading.
  redirects: async () => [{ source: "/story", destination: "/", permanent: true }],
  experimental: {
    // In import mode the desk calls the engine in this process, and the engine is the
    // TypeScript one folder up, outside the app. This is what lets it be compiled.
    externalDir: true,
    // The engine imports its own files the way Node does, naming the .js each one
    // compiles to. The bundler has to be told to read those as the .ts they are. This
    // setting is why dev and build run on webpack: Turbopack has no equivalent in this
    // version of Next and cannot resolve a single one of the engine's imports.
    extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
  },
};

// The /docs route reads MDX out of content/docs. This plugin compiles it and keeps
// the generated .source folder in step with the files.
const withMDX = createMDX();

export default withMDX(nextConfig);
