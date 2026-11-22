import { z } from "zod";
import { streamFares } from "@/lib/fares/orchestrator/stream";
import type { Coord } from "@/lib/fares/types";

/**
 * Server-sent fares.
 *
 * Fares take ten to thirty seconds and some arrive instantly from cache, so
 * the client gets each provider as it resolves rather than waiting for the
 * slowest. SSE rather than per-provider Suspense because Suspense gives
 * exactly one state transition per boundary and cannot push a later update,
 * which is precisely what the stale-then-refresh flow needs.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);

  const parsed = z
    .object({
      pickupLat: z.coerce.number().min(-90).max(90),
      pickupLng: z.coerce.number().min(-180).max(180),
      pickupAddress: z.string().max(400).optional(),
      pickupName: z.string().max(200).optional(),
      dropLat: z.coerce.number().min(-90).max(90),
      dropLng: z.coerce.number().min(-180).max(180),
      dropAddress: z.string().max(400).optional(),
      dropName: z.string().max(200).optional(),
    })
    .safeParse(params);

  if (!parsed.success) {
    return Response.json({ error: "Invalid pickup or drop" }, { status: 400 });
  }

  const pickup: Coord = {
    latitude: parsed.data.pickupLat,
    longitude: parsed.data.pickupLng,
    address: parsed.data.pickupAddress,
    name: parsed.data.pickupName,
  };
  const drop: Coord = {
    latitude: parsed.data.dropLat,
    longitude: parsed.data.dropLng,
    address: parsed.data.dropAddress,
    name: parsed.data.dropName,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Comment-only heartbeat, so an idle connection is not reaped by a
      // proxy while the first provider is still being fetched.
      const heartbeat = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);

      const finish = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // An abandoned tab must not hold a queue slot open.
      request.signal.addEventListener("abort", finish, { once: true });

      // Deliberately not awaited. Awaiting the producer here defers the first
      // flush until everything is done and silently defeats streaming.
      void (async () => {
        try {
          for await (const event of streamFares(pickup, drop, {
            signal: request.signal,
          })) {
            const { type, ...data } = event;
            send(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
          }
        } catch (err) {
          console.error("[fares/stream]", err);
          send(
            `event: error\ndata: ${JSON.stringify({
              reason: "Fare lookup failed",
            })}\n\n`,
          );
        } finally {
          finish();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops nginx buffering the stream into uselessness.
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
