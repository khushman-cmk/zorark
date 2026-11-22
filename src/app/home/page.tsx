import { getFirstName } from "@/lib/session";
import { greetingFor } from "@/lib/home-data";
import { Hero } from "./_components/Hero";
import { QuickActions } from "./_components/QuickActions";
import { FuelPromo } from "./_components/FuelPromo";
import { PopularDestinations } from "./_components/PopularDestinations";
import { RecentRide } from "./_components/RecentRide";
import { WalletCard } from "./_components/WalletCard";

/**
 * The customer dashboard.
 *
 * A server component. The only client islands underneath it are the fuel-type
 * tabs and the shell chrome; everything else, including all the artwork,
 * renders to HTML and ships no JavaScript.
 *
 * Content comes from src/lib/home-data.ts. Swapping any one section to a real
 * query is a change in that module plus the section that reads it.
 */
export default async function HomePage() {
  const firstName = await getFirstName();

  return (
    <div className="flex flex-col gap-5">
      <Hero greeting={greetingFor(new Date())} firstName={firstName} />

      <div className="zp-rise" style={{ animationDelay: "60ms" }}>
        <QuickActions />
      </div>

      <div
        className="zp-rise grid gap-4 xl:grid-cols-2"
        style={{ animationDelay: "120ms" }}
      >
        <FuelPromo />
        <PopularDestinations />
      </div>

      <div
        className="zp-rise grid gap-4 xl:grid-cols-[1.9fr_1fr]"
        style={{ animationDelay: "180ms" }}
      >
        <RecentRide />
        <WalletCard />
      </div>
    </div>
  );
}
