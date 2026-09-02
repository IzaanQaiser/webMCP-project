import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesignSession } from "@/lib/domain";
import { createFreshSession } from "@/lib/session";

import { SAMPLE_SOURCE_SITE } from "./sample-site";
import { SourceEditor } from "./source-editor";

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

function renderEditor() {
  return render(<SourceEditor />);
}

function htmlEditor() {
  return screen.getByLabelText("HTML");
}

function cssEditor() {
  return screen.getByLabelText("CSS");
}

beforeEach(() => {
  sessionControl.session = createFreshSession(() => "session-1");
  sessionControl.update.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("Source editor", () => {
  it("renders clearly labeled HTML and CSS editors", () => {
    renderEditor();

    expect(htmlEditor()).toBeVisible();
    expect(cssEditor()).toBeVisible();
  });

  it("populates drafts from an existing source site", () => {
    sessionControl.session = {
      ...sessionControl.session,
      sourceSite: {
        html: "<main>Existing</main>",
        css: "main { color: navy; }",
      },
    };

    renderEditor();

    expect(htmlEditor()).toHaveValue("<main>Existing</main>");
    expect(cssEditor()).toHaveValue("main { color: navy; }");
  });

  it("keeps typed drafts local until explicitly saved", () => {
    renderEditor();

    fireEvent.change(htmlEditor(), { target: { value: "<main>Draft</main>" } });
    fireEvent.change(cssEditor(), { target: { value: "main { color: red; }" } });

    expect(sessionControl.update).not.toHaveBeenCalled();
  });

  it("saves trimmed source while preserving all other session fields", () => {
    const currentSession = {
      ...sessionControl.session,
      feedback: [
        {
          id: "feedback-1",
          targetId: "hero",
          polarity: "positive" as const,
          aspects: ["layout" as const],
          comment: "Keep this",
          status: "open" as const,
        },
      ],
    };
    sessionControl.session = currentSession;
    renderEditor();
    fireEvent.change(htmlEditor(), {
      target: { value: "  <main>Saved</main>  " },
    });
    fireEvent.change(cssEditor(), {
      target: { value: "  main { color: green; }  " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save source" }));

    expect(sessionControl.update).toHaveBeenCalledTimes(1);
    const updater = sessionControl.update.mock.calls[0][0] as (
      session: DesignSession,
    ) => DesignSession;
    expect(updater(currentSession)).toEqual({
      ...currentSession,
      sourceSite: {
        html: "<main>Saved</main>",
        css: "main { color: green; }",
      },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Source saved.");
  });

  it("rejects empty or whitespace-only HTML", () => {
    renderEditor();
    fireEvent.change(htmlEditor(), { target: { value: "   " } });
    fireEvent.change(cssEditor(), { target: { value: "body {}" } });

    fireEvent.click(screen.getByRole("button", { name: "Save source" }));

    expect(screen.getByRole("alert")).toHaveTextContent("HTML is required.");
    expect(sessionControl.update).not.toHaveBeenCalled();
  });

  it("rejects empty or whitespace-only CSS", () => {
    renderEditor();
    fireEvent.change(htmlEditor(), { target: { value: "<main />" } });
    fireEvent.change(cssEditor(), { target: { value: "\n  " } });

    fireEvent.click(screen.getByRole("button", { name: "Save source" }));

    expect(screen.getByRole("alert")).toHaveTextContent("CSS is required.");
    expect(sessionControl.update).not.toHaveBeenCalled();
  });

  it("imports an .html file into the HTML draft without saving", async () => {
    renderEditor();
    const file = new File(["<main>Imported HTML</main>"], "source.html", {
      type: "text/html",
    });

    fireEvent.change(screen.getByLabelText("Import HTML file"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(htmlEditor()).toHaveValue("<main>Imported HTML</main>");
    });
    expect(sessionControl.update).not.toHaveBeenCalled();
  });

  it("imports a .css file into the CSS draft without saving", async () => {
    renderEditor();
    const file = new File(["body { color: purple; }"], "source.css", {
      type: "text/css",
    });

    fireEvent.change(screen.getByLabelText("Import CSS file"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(cssEditor()).toHaveValue("body { color: purple; }");
    });
    expect(sessionControl.update).not.toHaveBeenCalled();
  });

  it("rejects a wrong extension without overwriting the editor", async () => {
    renderEditor();
    fireEvent.change(htmlEditor(), { target: { value: "<main>Keep me</main>" } });
    const file = new File(["console.log('no')"], "source.js", {
      type: "text/javascript",
    });

    fireEvent.change(screen.getByLabelText("Import HTML file"), {
      target: { files: [file] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a .html file",
    );
    expect(htmlEditor()).toHaveValue("<main>Keep me</main>");
  });

  it("loads the bundled sample into both drafts without saving", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Load sample site" }));

    expect(htmlEditor()).toHaveValue(SAMPLE_SOURCE_SITE.html);
    expect(cssEditor()).toHaveValue(SAMPLE_SOURCE_SITE.css);
    expect(sessionControl.update).not.toHaveBeenCalled();
  });

  it("bundles a plain sample without scripts, frameworks, or external assets", () => {
    const sample = `${SAMPLE_SOURCE_SITE.html}\n${SAMPLE_SOURCE_SITE.css}`;

    expect(sample).not.toMatch(/<script\b|https?:\/\/|@import|url\s*\(/i);
    expect(sample).not.toMatch(/\b(?:react|next|vue|angular|svelte)\b/i);
  });

  it("clears drafts when canonical reset supplies a new empty session", () => {
    sessionControl.session = {
      ...sessionControl.session,
      sourceSite: {
        html: "<main>Before reset</main>",
        css: "main { color: black; }",
      },
    };
    const { rerender } = renderEditor();
    fireEvent.change(htmlEditor(), { target: { value: "<main>Unsaved</main>" } });

    sessionControl.session = createFreshSession(() => "session-after-reset");
    rerender(<SourceEditor />);

    expect(htmlEditor()).toHaveValue("");
    expect(cssEditor()).toHaveValue("");
  });

  it("shows the static MVP limitation", () => {
    renderEditor();

    expect(
      screen.getByText(
        "Static single-page HTML + CSS only. JavaScript and framework projects are not supported in this MVP.",
      ),
    ).toBeVisible();
  });
});
