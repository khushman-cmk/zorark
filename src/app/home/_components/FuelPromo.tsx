import { CarRear } from "@/components/zippi/art/CarRear";
import { PillButton } from "@/components/zippi/Primitives";

export function FuelPromo() {
  return (
    <section
      data-testid="card-promo"
      className="relative flex min-h-[15rem] min-w-0 flex-col justify-center overflow-hidden rounded-card bg-panel p-6 shadow-card"
    >
      {/* Glow behind the car. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -right-6 size-80 rounded-full opacity-55 blur-3xl"
        style={{ background: "var(--zp-pink)" }}
      />
      {/* A second, tighter glow so the car reads against the near-black card. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-8 right-4 h-40 w-56 rounded-full opacity-40 blur-2xl"
        style={{ background: "var(--zp-pink-400)" }}
      />
      <CarRear className="pointer-events-none absolute bottom-3 right-[-4%] w-[62%] max-w-[280px] sm:w-[58%]" />

      <div className="relative z-10 max-w-full pb-28 sm:max-w-[58%] sm:pb-0">
        <h2 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-panel-fg">
          Save on <span className="zp-grad-text">Fuel</span>
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-panel-muted">
          Compare prices at nearby pumps and choose the best deal.
        </p>
        <PillButton href="/home/fuel" size="sm" className="mt-5">
          Check Fuel Prices
        </PillButton>

        <div aria-hidden="true" className="mt-6 flex items-center gap-1.5">
          <span className="h-1.5 w-5 rounded-full bg-pink" />
          <span className="size-1.5 rounded-full bg-white/25" />
          <span className="size-1.5 rounded-full bg-white/25" />
        </div>
      </div>
    </section>
  );
}
