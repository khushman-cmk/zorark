import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CarRear } from "@/components/zippi/art/CarRear";
import { StatusPill } from "@/components/zippi/Primitives";
import { RECENT_RIDE, formatKm, formatRupees } from "@/lib/home-data";

const STATUS_LABEL = {
  completed: "Completed",
  cancelled: "Cancelled",
  ongoing: "On the way",
} as const;

export function RecentRide() {
  const ride = RECENT_RIDE;

  return (
    <section
      data-testid="card-recent-ride"
      className="min-w-0 overflow-hidden rounded-card border border-pink-soft-2 bg-pink-soft p-5 shadow-card"
    >
      <h2 className="mb-4 text-[0.95rem] font-bold tracking-tight text-ink">
        Your Recent Ride
      </h2>

      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-4">
        {/* basis-full keeps the route on its own row on narrow screens instead
            of being squeezed to nothing by the figures beside it. */}
        <div className="flex min-w-0 basis-full items-center gap-4 sm:flex-1 sm:basis-auto">
          <span className="relative inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-panel">
            <span
              aria-hidden="true"
              className="absolute inset-0 opacity-60"
              style={{
                background:
                  "radial-gradient(circle at 50% 78%, var(--zp-pink) 0%, transparent 62%)",
              }}
            />
            <CarRear className="relative w-[96%] translate-y-[5px]" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-1.5 text-[0.95rem] font-bold text-ink">
              <span className="truncate">{ride.origin}</span>
              <ArrowRight className="size-4 shrink-0 text-pink" aria-hidden="true" />
              <span className="truncate">{ride.destination}</span>
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {ride.when} &bull; {ride.vehicle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:gap-x-6">
          <p className="text-[1.05rem] font-bold text-ink">{formatRupees(ride.fare)}</p>
          <p className="border-l border-line-strong pl-5 text-xs text-muted">
            {formatKm(ride.distanceKm)}
          </p>
          <StatusPill tone={ride.status === "completed" ? "success" : "muted"}>
            {STATUS_LABEL[ride.status]}
          </StatusPill>
        </div>

        <Link
          href="/home/trips"
          className="group ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-pink-ink"
        >
          View all trips
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}
