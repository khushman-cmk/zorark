import { db } from "@/lib/db";
import { users, loginHistory } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { eq, desc } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") return Response.json({ error: "Unauthorized" }, { status: 401 });
    const adminId = (session.user as any).id;

    const [user] = await db.select().from(users).where(eq(users.id, adminId)).limit(1);
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    const history = await db.select().from(loginHistory).where(eq(loginHistory.userId, adminId)).orderBy(desc(loginHistory.timestamp)).limit(20);

    return Response.json({ user, history });
  } catch (err) {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") return Response.json({ error: "Unauthorized" }, { status: 401 });
    const adminId = (session.user as any).id;

    const body = await request.json();
    const { name, email, mobile, jobTitle, employeeId, recoveryEmail, recoveryPhone } = body;

    await db.update(users).set({
      name, email, mobile, jobTitle, employeeId, recoveryEmail, recoveryPhone, updatedAt: new Date()
    }).where(eq(users.id, adminId));

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

