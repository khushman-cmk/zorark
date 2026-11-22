import { ShieldCheck } from "lucide-react";
import { IconTile } from "@/components/zippi/Primitives";
import { getSession } from "@/lib/session";
import { DirectionsApp } from "./_components/DirectionsApp";
import { parsePoint } from "./_components/format";

export const metadata = { title: "Safe Directions | Zippi" };

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const [params, session] = await Promise.all([searchParams, getSession()]);
  const from = parsePoint(one(params.from), one(params.fromName));
  const to = parsePoint(one(params.to), one(params.toName));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start gap-4">
        <IconTile icon={ShieldCheck} />
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-ink">Safe Directions</h1>
          <p className="mt-1 text-sm text-muted">
            The safest route, not just the fastest: around broken lanes, waterlogged roads and reported potholes.
          </p>
        </div>
      </header>

      <DirectionsApp initialFrom={from} initialTo={to} signedIn={Boolean(session?.user?.id)} />
    </div>
  );
}
