import { Wallet } from "lucide-react";
import { ComingSoon } from "@/components/zippi/ComingSoon";

export const metadata = { title: "Zippi Wallet | Zippi" };

export default function Page() {
  return (
    <ComingSoon
      icon={Wallet}
      title="Zippi Wallet"
      description="Top up once, pay for rides and fuel anywhere, and collect cashback as you go."
    />
  );
}
