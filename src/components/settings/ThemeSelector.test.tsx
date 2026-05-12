import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("localStorage", {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
});

// Mock i18n
vi.mock("../../lib/i18n", () => ({
  t: vi.fn((key: string) => {
    const map: Record<string, string> = {
      "theme.dark": "Dark",
      "theme.grass": "Grass",
      "theme.system": "System",
      "theme.gruvbox-dark": "Gruvbox Dark",
    };
    return map[key] ?? key;
  }),
}));

import { ThemeSelector } from "./ThemeSelector";
import { THEME_PRESETS } from "../../lib/theme";
import { render } from "preact";
import { fireEvent } from "@testing-library/preact";

function mount(props: { choice: string; onChange: (c: string) => void }) {
  const container = document.createElement("div");
  render(<ThemeSelector choice={props.choice as any} onChange={props.onChange} />, container);
  return container;
}

describe("ThemeSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a select with all theme presets", () => {
    const container = mount({ choice: "dark", onChange: vi.fn() });
    const select = container.querySelector("select")!;
    const options = select.querySelectorAll("option");
    expect(options.length).toBe(THEME_PRESETS.length);
  });

  it("shows the current choice as selected", () => {
    const container = mount({ choice: "grass", onChange: vi.fn() });
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("grass");
  });

  it("calls onChange when selection changes", () => {
    const onChange = vi.fn();
    const container = mount({ choice: "dark", onChange });
    const select = container.querySelector("select")!;

    fireEvent.change(select, { target: { value: "ocean" } });
    expect(onChange).toHaveBeenCalledWith("ocean");
  });
});
