// Copied from kaaval/src/brain/types.ts on 2026-09-11; edit there first. Only the two
// shapes the news feed produces are copied, because Vidiyal has no brain to feed.

export interface NewsItem {
  id: string;
  ts: number;
  source: string;
  headline: string;
  summary: string | null;
  url: string | null;
  symbols: string[];
}

export interface CalendarEvent {
  ts: number;
  kind: "earnings" | "macro";
  title: string;
  symbol: string | null;
  timing: "before-open" | "after-close" | "during" | "unknown";
}
