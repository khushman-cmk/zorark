"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Clock, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/fares/money";
import type { FareOption, ProviderId, ProviderState } from "@/lib/fares/types";

type Row = {
  provider: ProviderId;
  label: string;
  state: ProviderState;
  options: FareOption[];
  ageSec?: number;
  reason?: string;
  needsLogin?: boolean;
};

type StreamQuery = {
  pickupLat: string;
  pickupLng: string;
  pickupAddress: string;
  pickupName: string;
  dropLat: string;
  dropLng: string;
  dropAddress: string;
  dropName: string;
};

const ORDER: ProviderId[] = ["uber", "ola", "rapido"];

/** Human wording for how a row's numbers were obtained. */
function stateLabel(row: Row): string | null {
  switch (row.state) {
    case "queued":
      return "Waiting";
    case "fetching":
      return "Checking live prices";
    case "cached":
      return "Just now";
    case "fresh":
      return "Live";
    case "stale":
      return row.ageSec != null ? `${Math.round(row.ageSec / 60)} min old` : "Older prices";
    case "unavailable":
      return null;
  }
}

export function FareResults({
  query,
  initialRows,
}: {
  query: StreamQuery;
  initialRows: Row[];
}) {
  const [rows, setRows] = useState<Map<ProviderId, Row>>(
    () => new Map(initialRows.map((r) => [r.provider, r])),
  );
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  // Elapsed time is captured when the stream finishes, not read during
  // render: Date.now() and ref reads are both impure there.
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
    const params = new URLSearchParams(query as unknown as Record<string, string>);
    const source = new EventSource(`/api/fares/stream?${params.toString()}`);

    const upgrade = (incoming: Row) => {
      setRows((prev) => {
        const next = new Map(prev);
        const existing = next.get(incoming.provider);

        // Monotonicity: a row that already has prices must never regress to an
        // empty error state. Only accept a downgrade when the new event
        // actually carries data of its own.
        const hadPrices = (existing?.options?.length ?? 0) > 0;
        const bringsPrices = (incoming.options?.length ?? 0) > 0;
        if (hadPrices && !bringsPrices) {
          next.set(incoming.provider, {
            ...existing!,
            options: existing!.options,
            // Keep the prices, but surface why they are not being refreshed.
            reason: incoming.reason ?? existing!.reason,
            needsLogin: incoming.needsLogin ?? existing!.needsLogin,
            state: incoming.state === "unavailable" ? "stale" : incoming.state,
          });
          return next;
        }

        next.set(incoming.provider, {
          ...existing,
          ...incoming,
          // The stream omits `options` for queued and unavailable rows, so it
          // is normalised here rather than guarded at every read site.
          options: incoming.options ?? existing?.options ?? [],
        });
        return next;
      });
    };

    source.addEventListener("provider", (event) => {
      upgrade(JSON.parse((event as MessageEvent).data) as Row);
    });
    source.addEventListener("done", () => {
      setElapsedMs(Date.now() - (startedAt.current ?? Date.now()));
      setDone(true);
      source.close();
    });
    source.addEventListener("error", () => {
      setFailed(true);
      setDone(true);
      source.close();
    });

    return () => source.close();
  }, [query]);

  const ordered = useMemo(() => {
    const list = [...rows.values()];
    list.sort((a, b) => ORDER.indexOf(a.provider) - ORDER.indexOf(b.provider));
    return list;
  }, [rows]);

  // The single cheapest bookable option across every provider.
  const cheapest = useMemo(() => {
    let best: { provider: ProviderId; option: FareOption } | null = null;
    for (const row of ordered) {
      for (const option of row.options ?? []) {
        if (!best || option.price < best.option.price) {
          best = { provider: row.provider, option };
        }
      }
    }
    return best;
  }, [ordered]);

  const working = ordered.some((r) => r.state === "queued" || r.state === "fetching");

  return (
    <section className="flex flex-col gap-4" data-testid="fare-results">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[0.95rem] font-bold tracking-tight text-ink">
          Fares across providers
        </h2>
        {working && !done ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Loader2 className="size-3.5 animate-spin" />
            Checking live prices
          </span>
        ) : (
          done &&
          elapsedMs !== null && (
            <span className="text-xs text-muted">
              Updated in {(elapsedMs / 1000).toFixed(1)}s
            </span>
          )
        )}
      </div>

      {failed && (
        <p
          role="alert"
          className="rounded-tile border border-line bg-sunken px-4 py-3 text-sm text-ink-soft"
        >
          The live lookup stopped early. Any prices below are the most recent we have.
        </p>
      )}

      {ordered.map((row) => (
        <ProviderCard
          key={row.provider}
          row={row}
          cheapestFor={cheapest?.provider === row.provider ? cheapest.option : null}
        />
      ))}
    </section>
  );
}

function ProviderCard({
  row,
  cheapestFor,
}: {
  row: Row;
  cheapestFor: FareOption | null;
}) {
  const busy = row.state === "queued" || row.state === "fetching";
  const label = stateLabel(row);

  return (
    <article
      data-testid={`provider-${row.provider}`}
      data-state={row.state}
      className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h3 className="truncate text-sm font-bold text-ink">{row.label}</h3>
          {label && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.68rem] font-semibold",
                row.state === "fresh" || row.state === "cached"
                  ? "bg-success-soft text-success"
                  : "bg-sunken text-muted",
              )}
            >
              {label}
            </span>
          )}
        </div>
        {busy && <Loader2 className="size-4 shrink-0 animate-spin text-muted" />}
      </header>

      {row.reason && (
        <p className="flex items-start gap-2 border-b border-line bg-sunken px-5 py-2.5 text-xs text-ink-soft">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0">
            {row.reason}
            {row.needsLogin && (
              <>
                {" "}
                <Link href="/admin/connections" className="font-semibold text-pink-ink underline">
                  Reconnect
                </Link>
              </>
            )}
          </span>
        </p>
      )}

      {(row.options?.length ?? 0) > 0 ? (
        <ul className="divide-y divide-line">
          {(row.options ?? []).map((option) => (
            <li
              key={`${row.provider}-${option.name}`}
              className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">
                    {option.name}
                  </span>
                  {cheapestFor === option && (
                    <span className="shrink-0 rounded-full bg-pink-soft px-2 py-0.5 text-[0.65rem] font-bold text-pink-ink">
                      Cheapest
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[0.7rem] text-muted">
                  {option.etaText && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" /> {option.etaText}
                    </span>
                  )}
                  {option.capacity != null && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" /> {option.capacity}
                    </span>
                  )}
                  {option.priceNote && <span>{option.priceNote}</span>}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-ink">{formatINR(option.price)}</p>
                {option.accountPrice != null && option.accountPrice !== option.price && (
                  <p className="text-[0.65rem] text-muted" title={option.discountNote ?? undefined}>
                    {formatINR(option.accountPrice)} on our account
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-muted">
          {busy
            ? "Fetching prices…"
            : row.state === "unavailable"
              ? "No prices available right now."
              : "No rides on this route."}
        </p>
      )}
    </article>
  );
}
