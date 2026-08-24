import { db } from "@/lib/db";
import { userSessions } from "@/lib/schema";
import { eq, and, desc } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") return Response.json({ error: "Unauthorized" }, { status: 401 });
    const adminId = (session.user as any).id;

    const sessions = await db.select().from(userSessions).where(and(eq(userSessions.userId, adminId), eq(userSessions.isActive, true))).orderBy(desc(userSessions.lastActive));
    return Response.json({ sessions, currentSessionId: (session.user as any).sessionId });
  } catch (err) {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") return Response.json({ error: "Unauthorized" }, { status: 401 });
    const adminId = (session.user as any).id;

    const body = await request.json();
    const { sessionId, all } = body;

    if (all) {
      await db.update(userSessions).set({ isActive: false }).where(and(eq(userSessions.userId, adminId)));
    } else if (sessionId) {
      await db.update(userSessions).set({ isActive: false }).where(and(eq(userSessions.userId, adminId), eq(userSessions.id, sessionId)));
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

