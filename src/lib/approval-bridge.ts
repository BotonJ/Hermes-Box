import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export interface ApprovalRequest {
  id: string;
  tool_name: string;
  command: string;
  raw_json: string;
  timestamp?: number;
  source?: string;
}

export function listenForApprovals(
  callback: (request: ApprovalRequest) => void,
): Promise<() => void> {
  return listen<ApprovalRequest>("approval-request", (event) => {
    callback(event.payload);
  });
}

export function approveCommand(id: string): Promise<void> {
  return invoke("approve_command", { id });
}

export function denyCommand(id: string): Promise<void> {
  return invoke("deny_command", { id });
}

export function listPendingApprovals(): Promise<ApprovalRequest[]> {
  return invoke<ApprovalRequest[]>("list_pending_approvals");
}

export function generateApprovalConfig(
  configType: "claude" | "hermes",
  bridgeDir: string,
): Promise<void> {
  return invoke("generate_approval_config", {
    configType,
    bridgeDir,
  });
}
