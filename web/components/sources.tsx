import { Label, Rise } from "@/components/editorial";
import type { ReviewRecord } from "@/lib/desk";
import { reviewName } from "@/lib/desk";
import { utcDay, utcStamp } from "@/lib/format";

/**
 * Where every number on the desk came from, at the foot of the shelf.
 *
 * A review of a Kaaval brain is a simulated record and a review of a Bitget account is a
 * read-only read of a real one. The difference is the first thing this panel says,
 * because a grade means something different in each case.
 */
/**
 * `published` is the base URL of the public record when the desk reads over HTTP, so the
 * paths shown are ones a reader can open, not the folders on the machine that wrote them.
 */
export function Sources({ record, published }: { record: ReviewRecord; published: string | null }) {
  const { bundle, verification } = record;
  const source = bundle.source;
  const ledger = source.kind === "ledger";
  const dated = bundle.range.fromTs > 0;

  return (
    <section className="relative border-t border-bone/12 px-6 py-24 md:px-[5vw] md:py-32">
      <div className="grid gap-14 md:grid-cols-12 md:gap-x-10">
        <Rise className="md:col-span-5">
          <Label>sources</Label>
          <h2 className="mt-5 max-w-[14ch] font-display text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-bone">
            Where this
            <span className="block font-light italic text-bone/80">comes from.</span>
          </h2>
          <p className="mt-7 max-w-[40ch] font-mono text-[11px] uppercase leading-[1.9] tracking-[0.16em] text-bone/50">
            {ledger
              ? "simulated record: a Kaaval brain traded this, and every fill it made is signed"
              : "read-only account: real fills, read with a key that cannot place an order"}
          </p>
          <p className="mt-7 max-w-[46ch] font-body text-[1rem] font-light leading-[1.6] text-bone/60">
            The desk reads one file the engine wrote. It never calls Bitget from your browser, so
            every spine on the shelf is a trade that already happened and was already graded.
          </p>
        </Rise>

        <Rise delay={0.06} className="md:col-span-7">
          <dl className="font-mono text-[11px] leading-[1.75] text-bone/70">
            <Fact label="record">
              {source.kind !== "ledger"
                ? `Bitget account ${source.accountId}`
                : published === null
                  ? `Kaaval ledger at ${source.dir}, brain ${source.brain}`
                  : `Kaaval ledger at ${browsable(published)}/kaaval/ledger, brain ${source.brain}`}
            </Fact>
            <Fact label="range">
              {dated
                ? `${utcDay(bundle.range.fromTs)} to ${utcDay(bundle.range.toTs)}`
                : "no dated trade in this record"}
              <span className="mx-2.5 text-bone/20">&middot;</span>
              {bundle.graded.length} round trips
              <span className="mx-2.5 text-bone/20">&middot;</span>
              {bundle.equityCurve.length} equity marks
            </Fact>
            <Fact label="ledger check">
              {verification.verified
                ? `chain and signatures verified: ${verification.fills} fills, ${verification.decisions} decisions and ${verification.marks} marks`
                : `refused: ${verification.reason ?? "the chain did not verify"}`}
            </Fact>
            <Fact label="public key">
              <span className="break-all">{record.publicKeyHex}</span>
            </Fact>
            <Fact label="the public half sits at">
              <span className="break-all">
                {published !== null
                  ? `${published}/kaaval/ledger-key.pub.hex`
                  : (record.publicKeyPath ??
                    "no file: the key came from KAAVAL_LEDGER_PUBLIC_KEY_HEX in the environment")}
              </span>
            </Fact>
            <Fact label="bundle written">{utcStamp(record.generatedAt)}</Fact>
            <Fact label="rebuild it">
              <span className="break-all">npm run review -- --source kaaval --brain claude --out {reviewName()}</span>
            </Fact>
          </dl>
        </Rise>
      </div>
    </section>
  );
}

/**
 * A raw GitHub base does not list folders, so the ledger folder is named by the page that
 * does; any other host is shown as it was given.
 */
function browsable(base: string): string {
  const raw = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(base);
  return raw === null ? base : `https://github.com/${raw[1]}/${raw[2]}/tree/${raw[3]}`;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 border-t border-bone/10 py-5 md:grid-cols-[13rem_1fr] md:gap-6">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-bone/30">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
