import { z } from "zod";
import { db } from "@/lib/db";
import { adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { invalidateContext } from "@/lib/fares/browser";
import { writeSession } from "@/lib/fares/sessions/store";
import { PROVIDER_IDS, type ProviderId } from "@/lib/fares/types";
import {
  authorise,
  relayInput,
  save,
  start,
  status,
  stop,
  subscribe,
  VIEWPORT,
} from "@/lib/fares/remote/screencast";

/**
 * Remote-login control surface.
 *
 * The admin cookie gates `start` only. Everything that drives the live
 * browser additionally requires the ephemeral token minted by `start`, so a
 * stolen cookie alone cannot puppet a running session.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ provider: string }>;
}

const providerSchema = z.enum(PROVIDER_IDS);

const inputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("click"),
    x: z.number().min(0).max(VIEWPORT.width),
    y: z.number().min(0).max(VIEWPORT.height),
    button: z.enum(["left", "right", "middle"]).optional(),
  }),
  z.object({ type: z.literal("wheel"), dx: z.number(), dy: z.number() }),
  z.object({ type: z.literal("text"), text: z.string().max(500) }),
  z.object({ type: z.literal("key"), key: z.string().max(40) }),
]);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), restart: z.boolean().optional() }),
  z.object({ action: z.literal("status"), token: z.string() }),
  z.object({ action: z.literal("stop"), token: z.string() }),
  z.object({ action: z.literal("save"), token: z.string() }),
  z.object({ action: z.literal("input"), token: z.string(), event: inputSchema }),
]);

async function resolveProvider(ctx: RouteContext): Promise<ProviderId | null> {
  const { provider } = await ctx.params;
  const parsed = providerSchema.safeParse(provider);
  return parsed.success ? parsed.data : null;
}

/** SSE frame stream. Requires the ephemeral token, not just the admin cookie. */
export async function GET(request: Request, ctx: RouteContext) {
  try {
    await requireAdmin();

    const provider = await resolveProvider(ctx);
    if (!provider) return Response.json({ error: "Unknown provider" }, { status: 404 });

    const token = new URL(request.url).searchParams.get("token") ?? "";
    const session = authorise(provider, token);
    if (!session) {
      return Response.json({ error: "No live session" }, { status: 401 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const push = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        };

        const unsubscribe = subscribe(session, (frame) => {
          push(`data: ${frame}\n\n`);
        });

        const heartbeat = setInterval(() => push(`: ping\n\n`), 15_000);

        const finish = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        request.signal.addEventListener("abort", finish, { once: true });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[connections/remote GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: RouteContext) {
  try {
    await ensureDatabaseSetup();
    const admin = await requireAdmin();

    const provider = await resolveProvider(ctx);
    if (!provider) return Response.json({ error: "Unknown provider" }, { status: 404 });

    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }
    const body = parsed.data;

    if (body.action === "start") {
      const { token, url } = await start(provider, { restart: body.restart });
      await db.insert(adminLogs).values({
        adminId: admin.user.id,
        action: "START_REMOTE_LOGIN",
        targetTable: "provider_session",
        targetId: provider,
        details: { url } as Record<string, unknown>,
      });
      return Response.json({ token, url, viewport: VIEWPORT });
    }

    const session = authorise(provider, body.token);
    if (!session) {
      // Distinguished from a plain 401 so the client can offer a restart
      // rather than leaving the operator staring at a dead frame.
      return Response.json(
        { error: "No live session", code: "SESSION_GONE" },
        { status: 401 },
      );
    }

    if (body.action === "status") {
      return Response.json({ ok: true, ...status(provider) });
    }

    if (body.action === "input") {
      try {
        await relayInput(session, body.event);
      } catch (err) {
        if (err instanceof Error && err.message === "Too many input events") {
          return Response.json({ error: err.message }, { status: 429 });
        }
        throw err;
      }
      return Response.json({ ok: true });
    }

    if (body.action === "save") {
      const captured = await save(session);
      await writeSession(provider, {
        storageState: captured.storageState,
        deviceProfileId: captured.deviceProfileId,
        userAgent: captured.userAgent,
      });
      await invalidateContext(provider);
      await db.insert(adminLogs).values({
        adminId: admin.user.id,
        action: "SAVE_REMOTE_LOGIN",
        targetTable: "provider_session",
        targetId: provider,
        details: { cookies: captured.cookies } as Record<string, unknown>,
      });
      return Response.json({ ok: true, cookies: captured.cookies });
    }

    await stop(provider);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[connections/remote POST]", err);
    return Response.json({ error: "Remote session failed" }, { status: 500 });
  }
}

/** Whether a remote browser is currently running for this provider. */
export async function HEAD(request: Request, ctx: RouteContext) {
  try {
    await requireAdmin();
    const provider = await resolveProvider(ctx);
    if (!provider) return new Response(null, { status: 404 });
    return new Response(null, {
      status: status(provider).running ? 200 : 204,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(null, { status: 500 });
  }
}
