import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, userSessions, loginHistory } from "@/lib/schema";
import { headers } from "next/headers";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, req) => {
        const parsed = loginSchema.safeParse(credentials);
        
        let ipAddress = "unknown";
        let device = "unknown";
        try {
          const h = await headers();
          ipAddress = h.get("x-forwarded-for") || "unknown";
          device = h.get("user-agent") || "unknown";
        } catch(e) {}

        if (!parsed.success) {
          return null;
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, parsed.data.email))
          .limit(1);

        if (!user) {
          return null;
        }

        // Reject soft-deleted users
        if (user.deletedAt !== null) {
          await db.insert(loginHistory).values({ userId: user.id, ipAddress, device, status: "failed" });
          return null;
        }

        // Reject suspended/banned users
        if (!user.isActive) {
          await db.insert(loginHistory).values({ userId: user.id, ipAddress, device, status: "failed" });
          return null;
        }

        const validPassword = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );

        if (!validPassword) {
          await db.insert(loginHistory).values({ userId: user.id, ipAddress, device, status: "failed" });
          return null;
        }

        await db.insert(loginHistory).values({ userId: user.id, ipAddress, device, status: "success" });

        const [session] = await db.insert(userSessions).values({
          userId: user.id,
          ipAddress,
          device,
          location: "Unknown", // Location requires GeoIP which we skip for now
          isActive: true
        }).returning();

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as "user" | "admin",
          sessionId: session.id,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = ((user as any).role ?? "user");
        token.id = user.id;
        token.sessionId = (user as any).sessionId;
      }

      // Check DB to ensure session is still active
      if (token.sessionId) {
        const [session] = await db.select().from(userSessions).where(eq(userSessions.id, token.sessionId as string)).limit(1);
        if (!session || !session.isActive) {
          throw new Error("Session terminated"); // Invalidates token
        }
        // Update lastActive (fire and forget to avoid blocking)
        db.update(userSessions).set({ lastActive: new Date() }).where(eq(userSessions.id, token.sessionId as string)).catch(() => {});
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role ?? "user";
        (session.user as any).id = token.id;
        (session.user as any).sessionId = token.sessionId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
