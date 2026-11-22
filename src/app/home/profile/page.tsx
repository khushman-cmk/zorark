import { User } from "lucide-react";
import { ComingSoon } from "@/components/zippi/ComingSoon";

export const metadata = { title: "Your Profile | Zippi" };

export default function Page() {
  return (
    <ComingSoon
      icon={User}
      title="Your Profile"
      description="Manage your details, saved vehicles, payment methods and privacy settings."
    />
  );
}
