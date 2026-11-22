import { Fuel } from "lucide-react";
import { ComingSoon } from "@/components/zippi/ComingSoon";

export const metadata = { title: "Fuel Prices | Zippi" };

export default function Page() {
  return (
    <ComingSoon
      icon={Fuel}
      title="Fuel Prices"
      description="Live petrol, diesel and E20 prices at every pump near you, sorted by what you will actually pay."
    />
  );
}
