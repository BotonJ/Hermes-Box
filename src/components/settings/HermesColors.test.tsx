import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";

vi.mock("../../lib/hermes-colors", () => ({
  applyHermesColors: vi.fn().mockResolvedValue("Hermes colors → dark mode"),
  resetHermesColors: vi.fn().mockResolvedValue("Hermes colors → reset"),
  resolveHermesCliDir: vi.fn().mockResolvedValue("/fake/hermes_cli"),
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
  resolveHermesCliDir,
} from "../../lib/hermes-colors";

describe("HermesColors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Apply and Reset buttons", async () => {
    render(<HermesColors effectiveTheme="dark" />);

    await waitFor(() => {
      expect(screen.getByText("settings.applyColors")).toBeDefined();
      expect(screen.getByText("settings.resetColors")).toBeDefined();
    });
  });

  it("shows not-found status when Hermes CLI is not detected", async () => {
    vi.mocked(resolveHermesCliDir).mockResolvedValue("");

    render(<HermesColors effectiveTheme="dark" />);

    await waitFor(() => {
      expect(screen.getByText("settings.hermesNotDetected")).toBeDefined();
    });
  });

  it("does not show not-found status when Hermes CLI is found", async () => {
    vi.mocked(resolveHermesCliDir).mockResolvedValue("/fake/hermes_cli");

    render(<HermesColors effectiveTheme="dark" />);

    await waitFor(() => {
      expect(screen.queryByText("settings.hermesNotDetected")).toBeNull();
    });
  });

  it("calls applyHermesColors with effective theme on Apply click", async () => {
    render(<HermesColors effectiveTheme="light" />);

    await waitFor(() => {
      expect(screen.getByText("settings.applyColors")).toBeDefined();
    });

    await fireEvent.click(screen.getByText("settings.applyColors"));

    expect(applyHermesColors).toHaveBeenCalledWith("light");
  });

  it("calls resetHermesColors on Reset click", async () => {
    render(<HermesColors effectiveTheme="dark" />);

    await waitFor(() => {
      expect(screen.getByText("settings.resetColors")).toBeDefined();
    });

    await fireEvent.click(screen.getByText("settings.resetColors"));

    expect(resetHermesColors).toHaveBeenCalled();
  });

  it("shows success message after Apply", async () => {
    render(<HermesColors effectiveTheme="dark" />);

    await waitFor(() => {
      expect(screen.getByText("settings.applyColors")).toBeDefined();
    });

    await fireEvent.click(screen.getByText("settings.applyColors"));

    await waitFor(() => {
      expect(screen.getByText("Hermes colors → dark mode")).toBeDefined();
    });
  });

  it("shows success message after Reset", async () => {
    render(<HermesColors effectiveTheme="dark" />);

    await waitFor(() => {
      expect(screen.getByText("settings.resetColors")).toBeDefined();
    });

    await fireEvent.click(screen.getByText("settings.resetColors"));

    await waitFor(() => {
      expect(screen.getByText("Hermes colors → reset")).toBeDefined();
    });
  });
});
