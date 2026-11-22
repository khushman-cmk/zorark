"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The operator's window onto the browser running on the server.
 *
 * The frame is rendered at exactly the viewport size the screencast was
 * capped to, so a click's offsetX/offsetY map straight onto page coordinates
 * with no scaling maths. mousemove is deliberately never sent: it would be
 * the only chatty event and hover states do not matter for an OTP form.
 *
 * The browser is started once and torn down only on an explicit Cancel or
 * Save. It is deliberately *not* stopped from an effect cleanup: React strict
 * mode remounts effects in development, and stopping there killed the very
 * session the component had just been given a token for.
 */

const VIEWPORT = { width: 420, height: 880 };

type Props = {
  provider: string;
  label: string;
  onSaved: () => void;
  onClose: () => void;
};

export default function RemoteLogin({ provider, label, onSaved, onClose }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting the browser…");
  const [error, setError] = useState<string | null>(null);
  const [expiresInSec, setExpiresInSec] = useState<number | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  // Strict mode invokes the effect twice; the browser must start once.
  const startedRef = useRef(false);

  const endpoint = `/api/admin/connections/${provider}/remote`;

  const begin = useCallback(
    async (restart: boolean) => {
      setError(null);
      setGone(false);
      setStatus(restart ? "Restarting the browser…" : "Starting the browser…");
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", restart }),
        });
        const json = (await res.json()) as { token?: string; error?: string };
        if (!res.ok || !json.token) throw new Error(json.error ?? "start failed");
        setToken(json.token);
        setStatus("Connected. Log in as you normally would, then press Save session.");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not start the remote browser.",
        );
        setStatus("Not connected.");
      }
    },
    [endpoint],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void begin(false);
  }, [begin]);

  // Frames arrive over SSE as base64 JPEG.
  useEffect(() => {
    if (!token) return;
    const source = new EventSource(`${endpoint}?token=${encodeURIComponent(token)}`);
    source.onmessage = (event) => setFrame(event.data as string);
    source.onerror = () => {
      // EventSource retries on its own; only say something if nothing has
      // arrived at all, which means the token was rejected.
      setFrame((current) => {
        if (current === null) setError("The frame stream could not be opened.");
        return current;
      });
    };
    return () => source.close();
  }, [token, endpoint]);

  // Countdown, so the hard ten-minute cap is never a surprise.
  useEffect(() => {
    if (!token || gone) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", token }),
        });
        if (cancelled) return;
        if (res.status === 401) {
          setGone(true);
          setStatus("The remote browser has closed.");
          return;
        }
        const json = (await res.json()) as { expiresInSec?: number };
        if (typeof json.expiresInSec === "number") setExpiresInSec(json.expiresInSec);
      } catch {
        /* transient */
      }
    };
    const timer = setInterval(tick, 10_000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, endpoint, gone]);

  const send = useCallback(
    async (event: Record<string, unknown>) => {
      if (!token || gone) return;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "input", token, event }),
      }).catch(() => null);
      if (res && res.status === 401) {
        setGone(true);
        setStatus("The remote browser has closed.");
      }
    },
    [token, endpoint, gone],
  );

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    void send({
      type: "click",
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top),
    });
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    void send({ type: "wheel", dx: Math.round(e.deltaX), dy: Math.round(e.deltaY) });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Printable characters go through insertText so pasting an OTP works;
    // everything else is a named key press.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      void send({ type: "text", text: e.key });
      return;
    }
    if (
      ["Backspace", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape"].includes(
        e.key,
      )
    ) {
      e.preventDefault();
      void send({ type: "key", key: e.key });
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    e.preventDefault();
    void send({ type: "text", text: text.slice(0, 200) });
  };

  const stopRemote = useCallback(async () => {
    if (!token) return;
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop", token }),
      keepalive: true,
    }).catch(() => {});
  }, [token, endpoint]);

  const cancel = async () => {
    await stopRemote();
    onClose();
  };

  const saveSession = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    setStatus("Capturing the session…");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", token }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        cookies?: number;
        error?: string;
      };
      if (res.status === 401) {
        setGone(true);
        throw new Error(
          "The remote browser had already closed, so there was nothing to capture.",
        );
      }
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Save failed");
      setStatus(`Saved ${json.cookies} cookies.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the session.");
      setStatus("Not saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ overflowY: "auto" }}>
      <div
        className="modal-content"
        style={{ maxWidth: `${VIEWPORT.width + 64}px`, width: "auto" }}
      >
        <h2 className="modal-title">Connect {label}</h2>
        <p className="modal-description">
          {status}
          {expiresInSec !== null && !gone && (
            <>
              {" "}
              <span style={{ color: "var(--text-muted)" }}>
                Closes automatically in {Math.floor(expiresInSec / 60)}m{" "}
                {expiresInSec % 60}s.
              </span>
            </>
          )}
        </p>

        {error && (
          <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {gone && (
          <div className="alert alert--info" style={{ marginBottom: "1rem" }}>
            The remote browser is no longer running.{" "}
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => void begin(true)}
              style={{ marginLeft: "0.5rem" }}
            >
              Start a new one
            </button>
          </div>
        )}

        <div
          ref={surfaceRef}
          role="application"
          aria-label={`${label} remote browser`}
          tabIndex={0}
          onClick={onClick}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          style={{
            width: VIEWPORT.width,
            height: VIEWPORT.height,
            maxWidth: "100%",
            margin: "0 auto",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            overflow: "hidden",
            cursor: "pointer",
            outline: "none",
          }}
        >
          {frame ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/jpeg;base64,${frame}`}
              alt=""
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                objectFit: "contain",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                padding: "1rem",
                textAlign: "center",
              }}
            >
              {error ? "No frames." : "Waiting for the first frame…"}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn--ghost" onClick={() => void cancel()} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={saveSession}
            disabled={busy || !token || gone}
          >
            {busy ? "Saving…" : "Save session"}
          </button>
        </div>
      </div>
    </div>
  );
}
