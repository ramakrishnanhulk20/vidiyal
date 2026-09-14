import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/docs-source";

// The index is built from the same MDX the pages render, so a result can never point at
// a line that is not on the page it names.
export const { GET } = createFromSource(source);
