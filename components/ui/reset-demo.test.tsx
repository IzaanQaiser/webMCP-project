import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceContent } from "@/app/page";
import { AssetCleanupError } from "@/lib/session";

const { reset } = vi.hoisted(() => ({
  reset: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session")>(
    "@/lib/session",
  );

  return {
    ...actual,
    useSession: () => ({ reset }),
  };
});

function deferredPromise() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function renderWorkspace() {
  return render(<WorkspaceContent initialStep="References" />);
}

function currentStep() {
  const progress = screen.getByRole("navigation", {
    name: "Workflow progress",
  });
  return within(progress).getByRole("listitem", { current: "step" });
}

async function openResetDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Reset Demo" }));
  return screen.findByRole("alertdialog");
}

beforeEach(() => {
  reset.mockReset();
  reset.mockResolvedValue();
});

afterEach(() => {
  cleanup();
});

describe("Reset Demo", () => {
  it("renders the compact reset control", () => {
    renderWorkspace();

    expect(screen.getByRole("button", { name: "Reset Demo" })).toBeVisible();
  });

  it("opens confirmation without changing workflow state", async () => {
    renderWorkspace();
    const stepBeforeOpening = currentStep();

    await openResetDialog();

    expect(stepBeforeOpening).toHaveTextContent("References");
    expect(reset).not.toHaveBeenCalled();
  });

  it("cancels without invoking reset or changing state", async () => {
    renderWorkspace();
    await openResetDialog();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(currentStep()).toHaveTextContent("References");
    expect(reset).not.toHaveBeenCalled();
  });

  it("confirms through the canonical reset exactly once and returns to Source", async () => {
    renderWorkspace();
    const dialog = await openResetDialog();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reset Demo" }),
    );

    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(currentStep()).toHaveTextContent("Source");
  });

  it("disables confirmation while pending and prevents duplicate reset", async () => {
    const pending = deferredPromise();
    reset.mockReturnValue(pending.promise);
    renderWorkspace();
    const dialog = await openResetDialog();
    const confirm = within(dialog).getByRole("button", { name: "Reset Demo" });

    fireEvent.click(confirm);

    expect(within(dialog).getByRole("button", { name: "Resetting…" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Resetting…" }));
    expect(reset).toHaveBeenCalledTimes(1);

    pending.resolve();
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("reports partial cleanup failure while keeping the reset Source state", async () => {
    reset.mockRejectedValue(
      new AssetCleanupError(new Error("asset cleanup failed")),
    );
    renderWorkspace();
    const dialog = await openResetDialog();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reset Demo" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "some saved image assets could not be removed",
    );
    expect(reset).toHaveBeenCalledTimes(1);
    expect(currentStep()).toHaveTextContent("Source");
  });

  it("reports a generic reset failure without moving to Source", async () => {
    reset.mockRejectedValue(new Error("structured reset failed"));
    renderWorkspace();
    const dialog = await openResetDialog();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reset Demo" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Demo reset failed. Please try again.",
    );
    expect(reset).toHaveBeenCalledTimes(1);
    expect(currentStep()).toHaveTextContent("References");
  });
});
