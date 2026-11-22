import { HeroScene } from "@/components/zippi/art/HeroScene";
import { SearchBar } from "./SearchBar";

export function Hero({
  greeting,
  firstName,
}: {
  greeting: string;
  firstName: string;
}) {
  return (
    <section className="relative isolate lg:min-h-[17rem]">
      {/* Illustration. Bleeds past the page padding to the right so it meets
          the edge of the viewport rather than sitting in a visible box, but
          stops short of the header so the sun never sits under the bell and
          avatar. Decorative, so it is dropped rather than squeezed on narrow
          screens where there is no room for it to read. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 -mr-4 hidden w-[56%] max-w-[760px] overflow-hidden sm:-mr-6 lg:-mr-8 lg:block">
        <HeroScene className="h-full w-full" />
      </div>

      <p className="pointer-events-none absolute right-2 top-1 hidden max-w-[12rem] text-right font-script text-[1.7rem] leading-tight text-pink-ink lg:block">
        Better rides.
        <br />
        Brighter journeys.
      </p>

      <div className="relative z-10 max-w-xl pb-2 pt-1">
        <p className="text-base font-medium text-ink-soft">{greeting}</p>
        <h1 className="mt-1 flex items-center gap-2.5 text-[2.6rem] font-extrabold leading-[1.1] tracking-tight text-ink sm:text-[3rem]">
          <span className="min-w-0 truncate">{firstName}</span>
          <span aria-hidden="true" className="shrink-0 text-[1.7rem] text-pink">
            &#9829;
          </span>
        </h1>
        <p className="mt-2 text-[0.95rem] text-muted">Where are you headed today?</p>

        <SearchBar className="mt-6" />
      </div>
    </section>
  );
}
