import { Car } from "lucide-react";
import { IconTile } from "@/components/zippi/Primitives";
import { readCachedFares } from "@/lib/fares/orchestrator/stream";
import type { Coord } from "@/lib/fares/types";
import { FareResults } from "./_components/FareResults";
import { RideSearch } from "./_components/RideSearch";

export const metadata = { title: "Book a Ride | Zippi" };

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function coordFrom(params: Search, prefix: "pickup" | "drop"): Coord | null {
  const lat = Number(one(params[`${prefix}Lat`]));
  const lng = Number(one(params[`${prefix}Lng`]));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng,
    address: one(params[`${prefix}Address`]),
    name: one(params[`${prefix}Name`]),
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const pickup = coordFrom(params, "pickup");
  const drop = coordFrom(params, "drop");
  const hasRoute = pickup !== null && drop !== null;

  // Whatever is already cached renders on the server with zero provider
  // contact, then the client upgrades it over SSE.
  const cached = hasRoute ? await readCachedFares(pickup, drop) : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start gap-4">
        <IconTile icon={Car} />
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-ink">
            Book a Ride
          </h1>
          <p className="mt-1 text-sm text-muted">
            Live fares from Uber, Ola and Rapido, side by side.
          </p>
        </div>
      </header>

      <RideSearch
        initialPickup={
          pickup?.name
            ? {
                placeId: "",
                name: pickup.name,
                description: pickup.address ?? pickup.name,
              }
            : null
        }
        initialDrop={
          drop?.name
            ? { placeId: "", name: drop.name, description: drop.address ?? drop.name }
            : null
        }
      />

      {hasRoute ? (
        <FareResults
          query={{
            pickupLat: String(pickup.latitude),
            pickupLng: String(pickup.longitude),
            pickupAddress: pickup.address ?? "",
            pickupName: pickup.name ?? "",
            dropLat: String(drop.latitude),
            dropLng: String(drop.longitude),
            dropAddress: drop.address ?? "",
            dropName: drop.name ?? "",
          }}
          initialRows={(cached?.results ?? []).map((r) => ({
            provider: r.provider,
            label: r.label,
            state: r.state,
            options: r.options,
            ageSec: r.ageSec,
          }))}
        />
      ) : (
        <p className="rounded-card border border-line bg-surface px-5 py-8 text-center text-sm text-muted shadow-card">
          Enter a pickup and a drop to compare live fares.
        </p>
      )}
    </div>
  );
}
