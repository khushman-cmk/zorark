"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { ArrowRight, ChevronRight } from "lucide-react";
import { FuelBrandMark } from "@/components/zippi/art/FuelBrandMark";
import { Card, LocationChip } from "@/components/zippi/Primitives";
import { FUEL_LOCATION, FUEL_PUMPS, FUEL_TABS, formatPrice } from "@/lib/home-data";

/**
 * Nearby pumps with a fuel-type switcher.
 *
 * A client island because of the tab state. All three fuel types' rows are
 * handed over up front, so switching tabs never needs a round trip.
 */
export function FuelPricesNearby() {
  return (
    <Card data-testid="card-fuel">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-[0.95rem] font-bold tracking-tight text-ink">
          Fuel Prices Near You
        </h2>
        <LocationChip label={FUEL_LOCATION} />
      </div>

      <Tabs.Root defaultValue="petrol">
        <Tabs.List
          aria-label="Fuel type"
          className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-sunken p-1"
        >
          {FUEL_TABS.map((tab) => (
            <Tabs.Trigger
              key={tab.key}
              value={tab.key}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition-colors data-[state=active]:bg-[var(--zp-pink-strong)] data-[state=active]:bg-[image:var(--zp-grad-pink)] data-[state=active]:text-white data-[state=active]:shadow-pink"
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {FUEL_TABS.map((tab) => (
          <Tabs.Content key={tab.key} value={tab.key} className="focus-visible:outline-none">
            <ul className="flex flex-col gap-1">
              {FUEL_PUMPS.map((pump) => (
                <li key={pump.id}>
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-center gap-3 rounded-tile px-2 py-2.5 text-left transition-colors hover:bg-sunken"
                  >
                    <FuelBrandMark brand={pump.mark} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.85rem] font-semibold text-ink">
                        {pump.brand}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.7rem] text-muted">
                        {pump.distanceKm} km &bull; {pump.hours}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="text-[0.85rem] font-bold text-ink">
                        {formatPrice(pump.prices[tab.key])}
                      </span>
                      <span className="text-[0.68rem] font-medium text-muted">/L</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          </Tabs.Content>
        ))}
      </Tabs.Root>

      <a
        href="/home/fuel"
        className="group mt-3 inline-flex items-center gap-1 text-xs font-semibold text-pink-ink"
      >
        View all nearby pumps
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </a>
    </Card>
  );
}
