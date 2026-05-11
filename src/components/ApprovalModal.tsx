import { invoke } from "@tauri-apps/api/core";
import styles from "./ApprovalModal.module.css";

export interface ApprovalRequest {
  id: string;
  tool_name: string;
  command: string;
  raw_json: string;
  source: string;
}

interface Props {
  request: ApprovalRequest;
  onResolved: () => void;
}

export function ApprovalModal({ request, onResolved }: Props) {
  async function handleDeny() {
    try {
      await invoke("deny_command", { id: request.id });
    } catch (e) {
      console.error("[approval] deny failed:", e);
    }
    onResolved();
  }

  async function handleApprove() {
    try {
      await invoke("approve_command", { id: request.id });
    } catch (e) {
      console.error("[approval] approve failed:", e);
    }
    onResolved();
  }

  return (
    <div class={styles.overlay}>
      <div class={styles.modal}>
        <div class={styles.header}>
          <span class={`${styles.source} ${styles[request.source] || ""}`}>
            {request.source}
          </span>
          <span class={styles.tool}>{request.tool_name}</span>
        </div>
        <div class={styles.command}>
          <pre>{request.command || "(no command)"}</pre>
        </div>
        <div class={styles.actions}>
          <button
            class={`${styles.btn} ${styles.deny}`}
            onClick={handleDeny}
          >
            Deny
          </button>
          <button
            class={`${styles.btn} ${styles.approve}`}
            onClick={handleApprove}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
