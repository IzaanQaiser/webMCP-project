import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesignSession } from "@/lib/domain";
import { createFreshSession } from "@/lib/session";

import { ReferencesStep } from "./references-step";

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

function renderReferences() {
  return render(<ReferencesStep onBack={vi.fn()} />);
}

function urlInput(index: number) {
  return screen.getByLabelText(`Inspiration URL ${index}`);
}

beforeEach(() => {
  sessionControl.session = createFreshSession(() => "reference-session");
  sessionControl.update.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("References step", () => {
  it("starts with one input and prevents adding a fourth", () => {
    renderReferences();
    const add = screen.getByRole("button", { name: "Add reference" });

    expect(urlInput(1)).toBeVisible();
    fireEvent.click(add);
    fireEvent.click(add);

    expect(urlInput(2)).toBeVisible();
    expect(urlInput(3)).toBeVisible();
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  it("saves normalized pending URLs while preserving unrelated state", () => {
    const currentSession: DesignSession = {
      ...sessionControl.session,
      sourceSite: {
        html: "<main>Keep source</main>",
        css: "main { display: block; }",
      },
      lockedElements: [
        { id: "lock-1", targetId: "hero", reason: "Keep lock" },
      ],
    };
    sessionControl.session = currentSession;
    renderReferences();
    fireEvent.change(urlInput(1), {
      target: { value: "  https://Example.com:443/inspiration  " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save references" }));

    expect(sessionControl.update).toHaveBeenCalledTimes(1);
    const updater = sessionControl.update.mock.calls[0][0] as (
      session: DesignSession,
    ) => DesignSession;
    expect(updater(currentSession)).toEqual({
      ...currentSession,
      pendingReferenceUrls: ["https://example.com/inspiration"],
    });
    expect(screen.getByRole("status")).toHaveTextContent("References saved.");
  });

  it("accepts three HTTPS URLs", () => {
    renderReferences();
    const add = screen.getByRole("button", { name: "Add reference" });
    fireEvent.click(add);
    fireEvent.click(add);
    ["one", "two", "three"].forEach((host, index) => {
      fireEvent.change(urlInput(index + 1), {
        target: { value: `https://${host}.example/` },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Save references" }));

    expect(sessionControl.update).toHaveBeenCalledTimes(1);
  });

  it.each(["http://example.com", "ftp://example.com"])(
    "rejects unsupported URL %s",
    (url) => {
      renderReferences();
      fireEvent.change(urlInput(1), { target: { value: url } });

      fireEvent.click(
        screen.getByRole("button", { name: "Save references" }),
      );

      expect(screen.getByRole("alert")).toHaveTextContent("must use HTTPS");
      expect(sessionControl.update).not.toHaveBeenCalled();
    },
  );

  it("rejects normalized duplicate URLs", () => {
    renderReferences();
    fireEvent.click(screen.getByRole("button", { name: "Add reference" }));
    fireEvent.change(urlInput(1), {
      target: { value: "https://EXAMPLE.com:443/path" },
    });
    fireEvent.change(urlInput(2), {
      target: { value: " https://example.com/path " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save references" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Duplicate reference URLs",
    );
    expect(sessionControl.update).not.toHaveBeenCalled();
  });

  it("populates existing pending URLs", () => {
    sessionControl.session = {
      ...sessionControl.session,
      pendingReferenceUrls: [
        "https://one.example/",
        "https://two.example/path",
      ],
    };

    renderReferences();

    expect(urlInput(1)).toHaveValue("https://one.example/");
    expect(urlInput(2)).toHaveValue("https://two.example/path");
  });

  it("returns to one empty input for a new reset session", () => {
    sessionControl.session = {
      ...sessionControl.session,
      pendingReferenceUrls: ["https://one.example/", "https://two.example/"],
    };
    const view = renderReferences();

    sessionControl.session = createFreshSession(() => "session-after-reset");
    view.rerender(<ReferencesStep onBack={vi.fn()} />);

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(urlInput(1)).toHaveValue("");
  });

  it("does not fetch or capture when saving URLs", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderReferences();
    fireEvent.change(urlInput(1), {
      target: { value: "https://example.com/" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save references" }));

    expect(fetch).not.toHaveBeenCalled();
  });
});
