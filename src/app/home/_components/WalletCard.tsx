import { Gift } from "lucide-react";
import { WalletWaves } from "@/components/zippi/art/CardDecor";
import { PillButton } from "@/components/zippi/Primitives";
import { WALLET_BALANCE, formatRupees } from "@/lib/home-data";

export function WalletCard() {
  return (
    <section
      data-testid="card-wallet"
      className="relative flex min-w-0 items-center gap-4 overflow-hidden rounded-card bg-panel p-5 shadow-card"
    >
      <WalletWaves className="pointer-events-none absolute inset-x-0 -bottom-3 h-12 opacity-80" />

      <span className="relative z-10 inline-flex size-12 shrink-0 items-center justify-center rounded-tile bg-white/[0.14] text-pink">
        <Gift className="size-6" />
      </span>

      <div className="relative z-10 min-w-0 flex-1">
        <p className="text-xs font-medium text-panel-muted">Wallet Balance</p>
        <p className="mt-0.5 truncate text-[1.7rem] font-extrabold leading-tight text-panel-fg">
          {formatRupees(WALLET_BALANCE)}
        </p>
      </div>

      <PillButton href="/home/wallet" size="sm" className="relative z-10">
        Add Money
      </PillButton>
    </section>
  );
}
