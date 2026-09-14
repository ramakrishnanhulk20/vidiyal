import Link from "next/link";
import { Rise } from "@/components/editorial";

const PROGRAM = "https://bitget-ai.gitbook.io/bitgetai_hackathons2";
const AGENT_HUB = "https://github.com/Bitget-AI/agent_hub";

const LINK =
  "group inline-flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-bone/45 transition-colors duration-500 hover:text-dawn";

function Arrow() {
  return (
    <span
      aria-hidden
      className="inline-block text-[10px] transition-transform duration-500 group-hover:translate-x-1"
    >
      &rarr;
    </span>
  );
}

/**
 * The address of the night watch. lib/story has the same reader, but that module pulls the
 * whole review engine in behind it and this footer now stands under every page, so it reads
 * the one setting it needs for itself.
 */
function kaavalUrl(): string {
  const raw = process.env.KAAVAL_URL;
  return raw === undefined || raw.trim() === ""
    ? "http://localhost:3000"
    : raw.trim().replace(/\/+$/, "");
}

export function Footer() {
  const kaaval = kaavalUrl();

  return (
    <footer className="mt-32 border-t border-bone/10 pt-12">
      <Rise>
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          <div>
            <Link href="/" className="group block">
              <span className="block font-display text-[1.5rem] font-semibold leading-[0.95] tracking-[-0.03em] text-bone transition-opacity duration-500 group-hover:opacity-80">
                Vidiyal
              </span>
              <span className="mt-1 block font-display text-[0.85rem] font-light italic tracking-[0.01em] text-dawn transition-all duration-500 group-hover:tracking-[0.05em]">
                the morning after the trade
              </span>
            </Link>
          </div>

          <nav aria-label="elsewhere" className="flex flex-col gap-4 md:items-end">
            <Link href="/docs" className={LINK}>
              documentation <Arrow />
            </Link>
            <a href={kaaval} className={LINK}>
              kaaval, the night watch <Arrow />
            </a>
            <a href={PROGRAM} target="_blank" rel="noreferrer" className={LINK}>
              bitget program <Arrow />
            </a>
            <a href={AGENT_HUB} target="_blank" rel="noreferrer" className={LINK}>
              bitget agent hub <Arrow />
            </a>
          </nav>
        </div>

        <p className="mt-14 max-w-[52ch] border-t border-bone/[0.07] pt-6 font-mono text-[10px] uppercase leading-[1.9] tracking-[0.14em] text-bone/30">
          simulated record or read-only account, as the review says
        </p>
      </Rise>
    </footer>
  );
}
