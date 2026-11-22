import { Bus } from "lucide-react";
import { ComingSoon } from "@/components/zippi/ComingSoon";

export const metadata = { title: "Book Travel | Zippi" };

export default function Page() {
  return (
    <ComingSoon
      icon={Bus}
      title="Book Travel"
      description="Buses, trains and flights across India in one search. This is next on the roadmap."
    />
  );
}
