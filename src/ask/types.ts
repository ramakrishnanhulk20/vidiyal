import type { ChecklistItem, GradedTrade, PatternHit, Source } from "../review/types.js";

/**
 * Everything one review produced, in the shape the web app and the question answerer
 * read. It is the only thing either of them is allowed to read, so an answer can always
 * be traced back to a graded trade and a trade back to a record. The answerer itself
 * lands in part two.
 */
export interface ReviewBundle {
  source: Source;
  range: { fromTs: number; toTs: number };
  graded: GradedTrade[];
  patterns: PatternHit[];
  checklist: ChecklistItem[];
  equityCurve: Array<{ ts: number; equity: number }>;
}
