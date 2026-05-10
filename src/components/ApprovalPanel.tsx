import { useState, useEffect, useRef } from "preact/hooks";
import type { ApprovalRequest } from "../lib/approval-bridge";
import styles from "./ApprovalPanel.module.css";

interface ApprovalPanelProps {
  requests: ApprovalRequest[];
  error?: string | null;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  timeoutMs?: number;
}

function formatCountdown(ms: number): string {
  return `${Math.ceil(ms / 1000)}s`;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

export function ApprovalPanel({
  requests,
  error,
  onApprove,
  onDeny,
  timeoutMs = 120_000,
}: ApprovalPanelProps) {
  const [processing, setProcessing] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<Record<string, number>>({});
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const onDenyRef = useRef(onDeny);
  onDenyRef.current = onDeny;
  const processingRef = useRef(processing);
  processingRef.current = processing;

  // Sync remaining state with current requests
  useEffect(() => {
    setRemaining((prev) => {
      if (requests.length === 0) return {};
      const next = { ...prev };
      for (const req of requests) {
        if (!(req.id in prev)) {
          next[req.id] = timeoutMs;
        }
      }
      const currentIds = new Set(requests.map((r) => r.id));
      for (const key of Object.keys(next)) {
        if (!currentIds.has(key)) delete next[key];
      }
      return next;
    });
  }, [requests, timeoutMs]);

  // Tick countdown every second while requests are pending
  useEffect(() => {
    if (requests.length === 0) return;

    const tick = setInterval(() => {
      setRemaining((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key] <= 0) continue;
          next[key] = Math.max(next[key] - 1000, 0);
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [requests.length > 0]);

  // Auto-deny via setTimeout per request
  useEffect(() => {
    const currentIds = new Set(requests.map((r) => r.id));

    // Clear timeouts for requests no longer present
    for (const [id, timer] of timersRef.current) {
      if (!currentIds.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }

    // Schedule timeouts for new requests
    for (const req of requests) {
      if (!timersRef.current.has(req.id)) {
        const timer = setTimeout(() => {
          if (processingRef.current === req.id) return;
          onDenyRef.current(req.id);
        }, timeoutMs);
        timersRef.current.set(req.id, timer);
      }
    }
  }, [requests, timeoutMs]);

  // Reset processing state when error changes
  useEffect(() => {
    if (error) {
      setProcessing(null);
    }
  }, [error]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  if (requests.length === 0) {
    return null;
  }

  function handleAction(id: string, action: "approve" | "deny") {
    setProcessing(id);
    if (action === "approve") {
      onApprove(id);
    } else {
      onDeny(id);
    }
  }

  return (
    <div class={`${styles.backdrop} ${styles.fadeIn}`} data-testid="approval-backdrop">
      {requests.map((req) => (
        <div class={`${styles.panel} ${styles.slideUp}`} key={req.id} data-testid="approval-panel">
          <div class={styles.header}>
            <span class={styles.badge}>{req.tool_name}</span>
            {req.source && (
              <span class={styles.sourceBadge} data-testid="approval-source">
                {req.source}
              </span>
            )}
            <h2 class={styles.title}>Approval Required</h2>
          </div>
          {req.timestamp != null && (
            <div class={styles.timestamp} data-testid="approval-timestamp">
              {formatTimestamp(req.timestamp)}
            </div>
          )}
          <pre class={styles.command}>{req.command}</pre>
          <div class={styles.countdown}>
            {formatCountdown(remaining[req.id] ?? timeoutMs)}
          </div>
          {error && <p class={styles.error}>{error}</p>}
          <div class={styles.actions}>
            <button
              class={styles.denyButton}
              disabled={processing === req.id}
              onClick={() => handleAction(req.id, "deny")}
            >
              Deny
            </button>
            <button
              class={styles.approveButton}
              disabled={processing === req.id}
              onClick={() => handleAction(req.id, "approve")}
            >
              Approve
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
