import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";

vi.mock("../../lib/hermes-colors", () => ({
  applyHermesColors: vi.fn().mockResolvedValue("Hermes colors → dark mode"),
  resetHermesColors: vi.fn().mockResolvedValue("Hermes colors → reset"),
  getHermesCliPathStatus: vi.fn(),
}));

vi.mock("../../lib/i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("../../lib/use-locale", () => ({
  useLocale: () => {},
}));

import { HermesColors } from "./HermesColors";
import {
  applyHermesColors,
  resetHermesColors,
  getHermesCliPathStatus,
} from "../../lib/hermes-colors";

describe("HermesColors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Apply and Reset buttons", () => {
    vi.mocked(getHermesCliPathStatus).mockReturnValue("found");
    render(<HermesColors effectiveTheme="dark" />);

    expect(screen.getByText("settings.applyColors")).toBeDefined();
    expect(screen.getByText("settings.resetColors")).toBeDefined();
  });

  it("shows not-found status when Hermes CLI is not detected", () => {
    vi.mocked(getHermesCliPathStatus).mockReturnValue("not-found");
    render(<HermesColors effectiveTheme="dark" />);

    expect(screen.getByText("settings.hermesNotDetected")).toBeDefined();
  });

  it("does not show not-found status when Hermes CLI is found", () => {
    vi.mocked(getHermesCliPathStatus).mockReturnValue("found");
    render(<HermesColors effectiveTheme="dark" />);

    expect(screen.queryByText("settings.hermesNotDetected")).toBeNull();
  });

  it("calls applyHermesColors with effective theme on Apply click", async () => {
    vi.mocked(getHermesCliPathStatus).mockReturnValue("found");
    render(<HermesColors effectiveTheme="light" />);

    const applyBtn = screen.getByText("settings.applyColors");
    await fireEvent.click(applyBtn);

    expect(applyHermesColors).toHaveBeenCalledWith("light");
  });

  it("calls resetHermesColors on Reset click", async () => {
    vi.mocked(getHermesCliPathStatus).mockReturnValue("found");
    render(<HermesColors effectiveTheme="dark" />);

    const resetBtn = screen.getByText("settings.resetColors");
    await fireEvent.click(resetBtn);

    expect(resetHermesColors).toHaveBeenCalled();
  });

  it("shows success message after Apply", async () => {
    vi.mocked(getHermesCliPathStatus).mockReturnValue("found");
    render(<HermesColors effectiveTheme="dark" />);

    await fireEvent.click(screen.getByText("settings.applyColors"));

    await waitFor(() => {
      expect(screen.getByText("Hermes colors → dark mode")).toBeDefined();
    });
  });

  it("shows success message after Reset", async () => {
    vi.mocked(getHermesCliPathStatus).mockReturnValue("found");
    render(<HermesColors effectiveTheme="dark" />);

    await fireEvent.click(screen.getByText("settings.resetColors"));

    await waitFor(() => {
      expect(screen.getByText("Hermes colors → reset")).toBeDefined();
    });
  });
});
