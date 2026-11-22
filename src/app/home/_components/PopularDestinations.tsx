import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, SectionHeader } from "@/components/zippi/Primitives";
import { Monument } from "@/components/zippi/art/monuments/Monument";
import { DESTINATIONS } from "@/lib/home-data";

export function PopularDestinations() {
  return (
    <Card data-testid="card-destinations">
      <SectionHeader
        title="Popular Destinations"
        action={{ label: "See all", href: "/home/travel" }}
      />

      <ul className="grid grid-cols-2 gap-3">
        {DESTINATIONS.map((destination) => (
          <li key={destination.key} className="min-w-0">
            <Link
              href={destination.href}
              className="group relative flex h-28 min-w-0 items-end overflow-hidden rounded-tile md:h-32 xl:h-[6.5rem]"
            >
              {/* Sky wash behind the landmark. */}
              <span
                aria-hidden="true"
                className="absolute inset-0"
                style={{ background: "var(--zp-sky)" }}
              />
              <Monument
                variant={destination.art}
                className="absolute inset-x-0 bottom-0 h-[70%] text-[color:var(--zp-pink-ink)] transition-transform duration-500 group-hover:scale-105"
              />
              {/* Scrim so the label keeps its contrast over any silhouette. */}
              <span
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgb(0 0 0 / 0) 30%, rgb(0 0 0 / 0.35) 58%, rgb(0 0 0 / 0.86) 100%)",
                }}
              />
              <span className="relative flex w-full min-w-0 items-end justify-between gap-1 p-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[0.82rem] font-bold text-white">
                    {destination.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.7rem] text-white/75">
                    {destination.travelTime}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-white/80 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
