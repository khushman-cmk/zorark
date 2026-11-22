"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, Loader2, Search } from "lucide-react";
import { PlaceField, type Place } from "./PlaceField";

/**
 * Pickup and drop entry.
 *
 * On submit each place ID is resolved to coordinates and the result lands in
 * the URL, so a comparison is shareable, reloadable and server-renderable
 * from cache on the way back in.
 */
export function RideSearch({
  initialPickup,
  initialDrop,
}: {
  initialPickup?: Place | null;
  initialDrop?: Place | null;
}) {
  const router = useRouter();
  const [pickup, setPickup] = useState<Place | null>(initialPickup ?? null);
  const [drop, setDrop] = useState<Place | null>(initialDrop ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const swap = () => {
    setPickup(drop);
    setDrop(pickup);
  };

  const resolve = async (place: Place) => {
    const res = await fetch(
      `/api/fares/geocode?placeId=${encodeURIComponent(place.placeId)}&name=${encodeURIComponent(place.name)}`,
    );
    if (!res.ok) throw new Error("Could not resolve that place");
    const json = (await res.json()) as {
      data: { latitude: number; longitude: number; address?: string; name?: string };
    };
    return json.data;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pickup || !drop || busy) return;

    setBusy(true);
    setError(null);
    try {
      const [from, to] = await Promise.all([resolve(pickup), resolve(drop)]);
      const params = new URLSearchParams({
        pickupLat: String(from.latitude),
        pickupLng: String(from.longitude),
        pickupAddress: from.address ?? pickup.description,
        pickupName: from.name ?? pickup.name,
        dropLat: String(to.latitude),
        dropLng: String(to.longitude),
        dropAddress: to.address ?? drop.description,
        dropName: to.name ?? drop.name,
      });
      router.push(`/home/ride?${params.toString()}`);
    } catch {
      setError("We could not look up those places. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      data-testid="ride-search"
      className="rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <PlaceField
          label="Pickup"
          placeholder="Where from?"
          value={pickup}
          onChange={setPickup}
          testId="pickup"
        />

        <button
          type="button"
          onClick={swap}
          aria-label="Swap pickup and drop"
          className="mx-auto inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-pink hover:text-pink sm:mb-1"
        >
          <ArrowDownUp className="size-4" />
        </button>

        <PlaceField
          label="Drop"
          placeholder="Where to?"
          value={drop}
          onChange={setDrop}
          testId="drop"
        />
      </div>

      <button
        type="submit"
        disabled={!pickup || !drop || busy}
        data-testid="compare-fares"
        className="zp-fill-pink mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold shadow-pink transition-all disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:px-7"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Looking up places
          </>
        ) : (
          <>
            <Search className="size-4" /> Compare fares
          </>
        )}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-sm text-pink-ink">
          {error}
        </p>
      )}
    </form>
  );
}
