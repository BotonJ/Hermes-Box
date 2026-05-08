import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { Welcome } from "./Welcome";

describe("Welcome", () => {
  it("renders welcome title and subtitle", () => {
    render(<Welcome onContinue={vi.fn()} />);

    expect(screen.getByText("Welcome to HermesBox")).not.toBeNull();
  });

  it("calls onContinue when button is clicked", () => {
    const onContinue = vi.fn();
    render(<Welcome onContinue={onContinue} />);

    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("has a descriptive intro text for non-technical users", () => {
    render(<Welcome onContinue={vi.fn()} />);

    expect(screen.getByText(/choose an AI assistant/i)).not.toBeNull();
  });
});
