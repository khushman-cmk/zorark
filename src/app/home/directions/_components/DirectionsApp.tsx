"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Loader2, ServerCrash } from "lucide-react";
import type { DirectionsResponse, LngLat, Stretch } from "@/lib/safety/types";
import { DirectionsForm } from "./DirectionsForm";
import { ExplainList } from "./ExplainList";
import { formatPoint, pinLabel, toLngLat, type Endpoint } from "./format";
import { Intro } from "./Intro";
import { MapControls } from "./MapControls";
import type { RouteKey } from "./map-layers";
import { ReportPothole, type ReportOutcome } from "./ReportPothole";
import { RouteCompare } from "./RouteCompare";
import { RouteSteps } from "./RouteSteps";

// WebGL map: never server-rendered.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-card bg-sunken" />,
});

type Key = "from" | "to";
type ApiError = { code: string; message: string };
type Status = { engine: { up: boolean }; grid: { loaded: boolean }; stale: boolean };

const FRIENDLY: Record<string, string> = {
  OUT_OF_AREA: "Safe Directions covers Delhi NCR for now. Pick points inside the region.",
  NO_SNAP: "One of the points is too far from a road. Try a spot on or near a street.",
  NO_ROUTE: "No drivable route connects these two points.",
  ENGINE_OFFLINE: "The routing engine is offline right now.",
  TIMEOUT: "Routing took too long. Please try again.",
};

export function DirectionsApp({
  initialFrom,
  initialTo,
  signedIn,
}: {
  initialFrom: Endpoint | null;
  initialTo: Endpoint | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [result, setResult] = useState<DirectionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<RouteKey>("safest");
  const [focus, setFocus] = useState<Stretch | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [pickTarget, setPickTarget] = useState<Key | null>(null);
  const [reportMode, setReportMode] = useState(false);
  const [reportAt, setReportAt] = useState<LngLat | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const run = useCallback(
    async (a: Endpoint, b: Endpoint) => {
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/directions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ from: { lat: a.lat, lng: a.lng }, to: { lat: b.lat, lng: b.lng } }),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => ({}))) as { data?: DirectionsResponse; error?: string; code?: string };
        if (!res.ok || !json.data) {
          const code = json.code ?? "ENGINE_ERROR";
          setResult(null);
          setError({ code, message: FRIENDLY[code] ?? json.error ?? "Something went wrong" });
          return;
        }
        setResult(json.data);
        setSelected("safest");
        setFocus(null);
        const params = new URLSearchParams({ from: formatPoint(a), fromName: a.label, to: formatPoint(b), toName: b.label });
        router.replace(`/home/directions?${params.toString()}`, { scroll: false });
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          setError({ code: "NETWORK", message: "Could not reach the server. Check your connection." });
        }
      } finally {
        if (inflight.current === controller) setLoading(false);
      }
    },
    [router],
  );

  // Status banner + a route from a shared link, once on mount. The route
  // request starts from a timer so it is not a synchronous effect update.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/safety/status", { signal: controller.signal })
      .then((r) => r.json())
      .then((json: { data?: Status }) => json.data && setStatus(json.data))
      .catch(() => {});
    const timer = initialFrom && initialTo ? window.setTimeout(() => void run(initialFrom, initialTo), 0) : undefined;
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // Mount only: later changes go through setEndpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEndpoint = (key: Key, value: Endpoint | null) => {
    const next = { from, to, [key]: value };
    if (key === "from") setFrom(value);
    else setTo(value);
    if (next.from && next.to) void run(next.from, next.to);
    else {
      inflight.current?.abort();
      setResult(null);
      setFocus(null);
    }
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    if (from && to) void run(to, from);
  };

  const onPick = (at: LngLat) => {
    if (reportMode) return setReportAt(at);
    const point = { lng: at[0], lat: at[1], label: pinLabel(at) };
    const key: Key = pickTarget ?? (!from ? "from" : "to");
    setPickTarget(null);
    setEndpoint(key, point);
  };

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? null : current)), 6000);
  };

  const onReported = (outcome: ReportOutcome) => {
    setReportAt(null);
    setReportMode(false);
    flash(
      outcome.alreadyConfirmed
        ? "You have already reported this pothole."
        : outcome.deduped
          ? `Thanks — that confirms an existing report (${outcome.pothole.confirmations} riders).`
          : "Thanks — pothole reported. Safe routes will avoid it.",
    );
    if (from && to) void run(from, to);
  };

  const route = result ? (result.sameRoute ? result.safest : result[selected]) : null;
  const engineDown = status !== null && !status.engine.up;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
      <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
        {(engineDown || status?.stale) && (
          <p role="status" className="flex items-start gap-2 rounded-card border border-line bg-risk-med-soft px-4 py-3 text-sm text-ink">
            <ServerCrash className="mt-0.5 size-4 shrink-0 text-risk-med" />
            {engineDown
              ? "Safe routing is offline at the moment. Start the routing engine with npm run gh:start."
              : "Safety data is out of date. Rebuild with npm run safety:build, then npm run gh:import."}
          </p>
        )}

        <DirectionsForm
          from={from}
          to={to}
          onChange={setEndpoint}
          onSwap={swap}
          pickTarget={pickTarget}
          onPickTarget={(key) => {
            setReportMode(false);
            setPickTarget(key);
          }}
        />

        {notice && (
          <p role="status" className="rounded-card border border-line bg-success-soft px-4 py-3 text-sm font-medium text-success">
            {notice}
          </p>
        )}

        {loading && (
          <p className="flex items-center gap-2 rounded-card border border-line bg-surface px-4 py-4 text-sm text-muted shadow-card" aria-live="polite">
            <Loader2 className="size-4 animate-spin" /> Finding the safest route…
          </p>
        )}

        {error && !loading && (
          <p role="alert" data-testid="directions-error" className="rounded-card border border-line bg-risk-high-soft px-4 py-3 text-sm text-ink">
            {error.message}
          </p>
        )}

        {result && route && !loading && (
          <>
            <RouteCompare
              result={result}
              selected={selected}
              onSelect={(key) => {
                setSelected(key);
                setFocus(null);
              }}
            />
            <ExplainList route={route} which={result.sameRoute ? "safest" : selected} focus={focus} onFocus={setFocus} />
            <RouteSteps route={route} />
          </>
        )}

        {!result && !loading && !error && (
          <Intro
            onExample={(a, b) => {
              setFrom(a);
              setTo(b);
              void run(a, b);
            }}
          />
        )}
      </div>

      <div className="relative order-1 h-[52vh] min-h-[320px] lg:sticky lg:top-4 lg:order-2 lg:h-[calc(100dvh-10.5rem)]">
        <MapView
          theme={theme}
          from={toLngLat(from)}
          to={toLngLat(to)}
          result={result}
          selected={result?.sameRoute ? "safest" : selected}
          focus={focus}
          overlay={overlay}
          picking={reportMode || pickTarget !== null || !from || !to}
          onPick={onPick}
        />
        <MapControls
          overlay={overlay}
          onOverlay={setOverlay}
          reportMode={reportMode}
          onReportMode={(on) => {
            setPickTarget(null);
            setReportMode(on);
          }}
          hasRoute={Boolean(result)}
        />
      </div>

      <ReportPothole at={reportAt} signedIn={signedIn} onClose={() => setReportAt(null)} onReported={onReported} />
    </div>
  );
}
