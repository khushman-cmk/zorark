import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") return Response.json({ error: "Unauthorized" }, { status: 401 });
    const adminId = (session.user as any).id;

    const { action } = await request.json(); // "deactivate" | "delete"

    // Prevent if sole admin
    const admins = await db.select().from(users).where(and(eq(users.role, "admin"), eq(users.isActive, true)));
    if (admins.length <= 1) {
      return Response.json({ error: "Cannot deactivate or delete the sole active admin account." }, { status: 400 });
    }

    if (action === "deactivate") {
      await db.update(users).set({ isActive: false }).where(eq(users.id, adminId));
    } else if (action === "delete") {
      await db.update(users).set({ deletedAt: new Date(), isActive: false }).where(eq(users.id, adminId));
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
