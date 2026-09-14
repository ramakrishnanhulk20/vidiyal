import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: frontmatterSchema.extend({
      // The short name the sidebar uses when the page title is a full sentence.
      label: z.string().optional(),
    }),
  },
});

export default defineConfig({
  mdxOptions: {
    // Turns a ```mermaid block into <Mermaid chart="..." />, which mdx-components.tsx
    // renders in the desk's own colours.
    remarkPlugins: (plugins) => [remarkMdxMermaid, ...plugins],
    // The desk has one ground and never switches to a light one, so both slots hold the
    // same theme and every token carries its colour inline. Vesper is warm, which is
    // what this ground wants.
    rehypeCodeOptions: {
      themes: { light: "vesper", dark: "vesper" },
      defaultColor: "light",
    },
  },
});
