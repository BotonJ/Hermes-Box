import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { ApprovalModal, type ApprovalRequest } from "./ApprovalModal";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const mockRequest: ApprovalRequest = {
  id: "test-001",
  tool_name: "Bash",
  command: "git push origin main",
  raw_json: '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}',
  source: "claude-code",
};

describe("ApprovalModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders approval request details", () => {
    render(<ApprovalModal request={mockRequest} onResolved={() => {}} />);
    expect(screen.getByText("claude-code")).toBeTruthy();
    expect(screen.getByText("Bash")).toBeTruthy();
    expect(screen.getByText("git push origin main")).toBeTruthy();
  });

  it("shows approve and deny buttons", () => {
    render(<ApprovalModal request={mockRequest} onResolved={() => {}} />);
    expect(screen.getByText("Approve")).toBeTruthy();
    expect(screen.getByText("Deny")).toBeTruthy();
  });

  it("calls approve_command on approve click", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const onResolved = vi.fn();
    render(<ApprovalModal request={mockRequest} onResolved={onResolved} />);
    await fireEvent.click(screen.getByText("Approve"));
    expect(invoke).toHaveBeenCalledWith("approve_command", { id: "test-001" });
    expect(onResolved).toHaveBeenCalled();
  });

  it("calls deny_command on deny click", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const onResolved = vi.fn();
    render(<ApprovalModal request={mockRequest} onResolved={onResolved} />);
    await fireEvent.click(screen.getByText("Deny"));
    expect(invoke).toHaveBeenCalledWith("deny_command", { id: "test-001" });
    expect(onResolved).toHaveBeenCalled();
  });

  it("renders hermes source", () => {
    const hermesReq = { ...mockRequest, source: "hermes", tool_name: "terminal" };
    render(<ApprovalModal request={hermesReq} onResolved={() => {}} />);
    expect(screen.getByText("hermes")).toBeTruthy();
    expect(screen.getByText("terminal")).toBeTruthy();
  });

  it("shows placeholder when command is empty", () => {
    const noCmd = { ...mockRequest, command: "" };
    render(<ApprovalModal request={noCmd} onResolved={() => {}} />);
    expect(screen.getByText("(no command)")).toBeTruthy();
  });
});
