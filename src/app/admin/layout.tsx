import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { redirect } from "next/navigation";
import AdminSidebar from "./_components/AdminSidebar";
import { SessionProvider } from "next-auth/react";
import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "Zorark Admin",
  description: "Admin control panel",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Server-side guard — proxy.ts handles the redirect for page navigations,
  // but we check here too for direct server renders (defense-in-depth).
  if (!session || session.user?.role !== "admin") {
    redirect("/home");
  }

  return (
    <SessionProvider session={session}>
      <div className="admin-shell">
        <AdminSidebar />
        <main className="admin-main">
          <div className="admin-content">{children}</div>
        </main>
      </div>
    </SessionProvider>
  );
}
