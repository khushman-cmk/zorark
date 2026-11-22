import { Clock } from "lucide-react";
import { ComingSoon } from "@/components/zippi/ComingSoon";

export const metadata = { title: "My Trips | Zippi" };

export default function Page() {
  return (
    <ComingSoon
      icon={Clock}
      title="My Trips"
      description="Every ride and journey you have taken with Zippi, with fuel and toll costs broken down."
    />
  );
}
