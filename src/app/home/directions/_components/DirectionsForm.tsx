"use client";

import { useState } from "react";
import { ArrowDownUp, Crosshair } from "lucide-react";
import { PlaceField, type Place } from "@/app/home/ride/_components/PlaceField";
import { cn } from "@/lib/cn";
import type { Endpoint } from "./format";

/**
 * From / To. Places come from the same search the ride page uses; a place is
 * resolved to coordinates as soon as it is picked. Either end can also be set
 * by clicking the map ("Pick on map").
 */

type Key = "from" | "to";

async function resolvePlace(place: Place): Promise<Endpoint> {
  const res = await fetch(
    `/api/fares/geocode?placeId=${encodeURIComponent(place.placeId)}&name=${encodeURIComponent(place.name)}`,
  );
  if (!res.ok) throw new Error("Could not resolve that place");
  const json = (await res.json()) as { data: { latitude: number; longitude: number; name?: string } };
  return { lat: json.data.latitude, lng: json.data.longitude, label: place.name || place.description };
}

const asPlace = (e: Endpoint | null): Place | null => (e ? { placeId: "", name: e.label, description: e.label } : null);

export function DirectionsForm({
  from,
  to,
  onChange,
  onSwap,
  pickTarget,
  onPickTarget,
}: {
  from: Endpoint | null;
  to: Endpoint | null;
  onChange: (key: Key, value: Endpoint | null) => void;
  onSwap: () => void;
  pickTarget: Key | null;
  onPickTarget: (key: Key | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Key | null>(null);

  const choose = (key: Key) => async (place: Place | null) => {
    setError(null);
    if (!place) return onChange(key, null);
    setResolving(key);
    try {
      onChange(key, await resolvePlace(place));
    } catch {
      setError("We could not look up that place. Try another search or pick it on the map.");
    } finally {
      setResolving(null);
    }
  };

  const pickButton = (key: Key) => (
    <button
      type="button"
      onClick={() => onPickTarget(pickTarget === key ? null : key)}
      aria-pressed={pickTarget === key}
      aria-label={`Pick ${key === "from" ? "start" : "destination"} on the map`}
      className={cn(
        "mb-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors",
        pickTarget === key
          ? "border-pink bg-pink-soft text-pink-ink"
          : "border-line text-muted hover:border-pink hover:text-pink",
      )}
    >
      <Crosshair className="size-4" />
    </button>
  );

  return (
    <section
      aria-label="Route search"
      data-testid="directions-form"
      className="rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <PlaceField label="From" placeholder="Start point" value={asPlace(from)} onChange={choose("from")} testId="dir-from" />
        </div>
        {pickButton("from")}
      </div>

      <div className="my-1.5 flex justify-center">
        <button
          type="button"
          onClick={onSwap}
          disabled={!from && !to}
          aria-label="Swap start and destination"
          className="inline-flex size-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-pink hover:text-pink disabled:opacity-40"
        >
          <ArrowDownUp className="size-3.5" />
        </button>
      </div>

      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <PlaceField label="To" placeholder="Destination" value={asPlace(to)} onChange={choose("to")} testId="dir-to" />
        </div>
        {pickButton("to")}
      </div>

      {(resolving || pickTarget) && (
        <p className="mt-3 text-xs text-muted" aria-live="polite">
          {resolving ? "Finding that place…" : `Click the map to set the ${pickTarget === "from" ? "start" : "destination"}.`}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-pink-ink">
          {error}
        </p>
      )}
    </section>
  );
}
