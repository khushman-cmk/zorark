import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import bcrypt from "bcryptjs";

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") return Response.json({ error: "Unauthorized" }, { status: 401 });
    const adminId = (session.user as any).id;

    const { currentPassword, newPassword } = await request.json();

    const [user] = await db.select().from(users).where(eq(users.id, adminId)).limit(1);
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return Response.json({ error: "Invalid current password" }, { status: 400 });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash: hash }).where(eq(users.id, adminId));

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
