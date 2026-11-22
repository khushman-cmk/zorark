"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type Place = {
  placeId: string;
  description: string;
  name: string;
};

/**
 * A destination field with live place suggestions.
 *
 * Suggestions come from our own geocoding route rather than the browser
 * calling the upstream vendor directly, so the origin headers stay correct
 * and the client never learns who does the geocoding.
 */
export function PlaceField({
  label,
  placeholder,
  value,
  onChange,
  testId,
}: {
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  testId: string;
}) {
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Debounced search. The abort controller matters: typing quickly would
  // otherwise let an earlier, slower response overwrite a later one.
  const query = term.trim();
  const searchable = !value && query.length >= 2;

  useEffect(() => {
    // Nothing to search for. Suggestions are filtered out at render time
    // rather than cleared here, so this effect never sets state synchronously.
    if (!searchable) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/fares/geocode?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { data: Place[] };
        setSuggestions(json.data ?? []);
        setOpen(true);
        setActiveIndex(-1);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchable]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (place: Place) => {
    onChange(place);
    setTerm("");
    setSuggestions([]);
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setTerm("");
    setSuggestions([]);
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <label
        htmlFor={`${listId}-input`}
        className="mb-1.5 block text-xs font-semibold text-muted"
      >
        {label}
      </label>

      <div
        className={cn(
          "flex items-center gap-2.5 rounded-tile border border-line bg-surface px-3.5 py-2.5 transition-colors",
          open && "border-pink",
        )}
      >
        <MapPin className="size-4 shrink-0 text-pink" aria-hidden="true" />

        {value ? (
          <>
            <span
              className="min-w-0 flex-1 truncate text-sm font-medium text-ink"
              data-testid={`${testId}-selected`}
            >
              {value.description}
            </span>
            <button
              type="button"
              onClick={clear}
              aria-label={`Clear ${label.toLowerCase()}`}
              className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </>
        ) : (
          <>
            <input
              id={`${listId}-input`}
              data-testid={testId}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              autoComplete="off"
              placeholder={placeholder}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onFocus={() => suggestions.length > 0 && setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && activeIndex >= 0) {
                  e.preventDefault();
                  choose(suggestions[activeIndex]);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
            {loading && (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden="true" />
            )}
          </>
        )}
      </div>

      {open && searchable && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          data-testid={`${testId}-suggestions`}
          className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-tile border border-line bg-surface py-1 shadow-pill"
        >
          {suggestions.map((place, index) => (
            <li key={place.placeId} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(place)}
                className={cn(
                  "flex w-full min-w-0 items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors",
                  index === activeIndex ? "bg-sunken" : "hover:bg-sunken",
                )}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {place.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {place.description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
