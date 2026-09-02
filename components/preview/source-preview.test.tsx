import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesignSession } from "@/lib/domain";
import { createFreshSession } from "@/lib/session";

import { SourceEditor } from "@/components/source/source-editor";
import { SourcePreview } from "./source-preview";

const sessionControl = vi.hoisted(() => ({
  session: undefined as unknown as DesignSession,
  update: vi.fn(),
}));

vi.mock("@/lib/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session")>(
    "@/lib/session",
  );

  return {
    ...actual,
    useSession: () => ({
      session: sessionControl.session,
      update: sessionControl.update,
    }),
  };
});

beforeEach(() => {
  sessionControl.session = createFreshSession(() => "preview-session");
  sessionControl.update.mockReset();
  sessionControl.update.mockImplementation(
    (updater: (session: DesignSession) => DesignSession) => {
      sessionControl.session = updater(sessionControl.session);
    },
  );
});

afterEach(() => {
  cleanup();
});

describe("Source preview", () => {
  it("renders an empty state without an iframe for a null source", () => {
    render(<SourcePreview />);

    expect(screen.getByText("No saved source yet")).toBeVisible();
    expect(screen.queryByTitle("Saved source site preview")).not.toBeInTheDocument();
  });

  it("renders saved source in a locked-down iframe", () => {
    sessionControl.session = {
      ...sessionControl.session,
      sourceSite: {
        html: "<main>Saved preview</main>",
        css: "main { color: teal; }",
      },
    };

    render(<SourcePreview />);
    const iframe = screen.getByTitle("Saved source site preview");
    const sandbox = iframe.getAttribute("sandbox");

    expect(iframe).toBeVisible();
    expect(iframe.getAttribute("srcdoc")).toContain("Saved preview");
    expect(iframe.getAttribute("srcdoc")).toContain("main { color: teal; }");
    expect(sandbox).toBe("");
    expect(sandbox).not.toMatch(
      /allow-scripts|allow-forms|allow-popups|allow-top-navigation|allow-same-origin/,
    );
    expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("ignores editor drafts until Save source updates the session", () => {
    sessionControl.session = {
      ...sessionControl.session,
      sourceSite: {
        html: "<main>Saved version</main>",
        css: "main { color: black; }",
      },
    };
    const view = render(
      <>
        <SourceEditor />
        <SourcePreview />
      </>,
    );
    const originalPreview = screen
      .getByTitle("Saved source site preview")
      .getAttribute("srcdoc");

    fireEvent.change(screen.getByLabelText("HTML"), {
      target: { value: "<main>Unsaved draft</main>" },
    });
    fireEvent.change(screen.getByLabelText("CSS"), {
      target: { value: "main { color: orange; }" },
    });

    expect(
      screen.getByTitle("Saved source site preview").getAttribute("srcdoc"),
    ).toBe(originalPreview);
    expect(
      screen.getByTitle("Saved source site preview").getAttribute("srcdoc"),
    ).not.toContain("Unsaved draft");

    fireEvent.click(screen.getByRole("button", { name: "Save source" }));
    view.rerender(
      <>
        <SourceEditor />
        <SourcePreview />
      </>,
    );

    expect(
      screen.getByTitle("Saved source site preview").getAttribute("srcdoc"),
    ).toContain("Unsaved draft");
    expect(
      screen.getByTitle("Saved source site preview").getAttribute("srcdoc"),
    ).toContain("main { color: orange; }");
  });
});
