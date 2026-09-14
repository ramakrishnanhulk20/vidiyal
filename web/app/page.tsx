import { HeroFoot, HeroTitle } from "@/components/hero-copy";
import { Shelf } from "@/components/shelf";
import { Sources } from "@/components/sources";
import { loadReview, toDesk } from "@/lib/desk";

// The shelf is the record as it stands right now, so it is read on every request rather
// than baked into the build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const record = await loadReview();
  const desk = toDesk(record);

  return (
    <main className="relative">
      <section data-shelf-track className="relative md:h-[280svh]">
        <div className="relative flex min-h-[100svh] flex-col gap-8 px-6 pb-24 pt-[17svh] md:block md:h-[100svh] md:min-h-0 md:gap-0 md:overflow-hidden md:p-0 md:sticky md:top-0">
          <Shelf
            spines={desk.spines}
            className="relative order-2 h-[46svh] w-full md:absolute md:inset-0 md:order-none md:h-auto"
          />

          <HeroTitle className="relative order-1 z-20 md:absolute md:left-[5vw] md:top-[19svh] md:order-none" />

          <HeroFoot
            desk={desk}
            className="relative order-3 z-20 md:absolute md:bottom-[9svh] md:left-[5vw] md:order-none"
          />
        </div>
      </section>

      <Sources record={record} />
    </main>
  );
}
