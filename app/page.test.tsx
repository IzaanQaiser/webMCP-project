import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the workspace shell and all workflow steps", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Shape a clear visual direction." }),
    ).toBeInTheDocument();

    const progress = screen.getByRole("navigation", {
      name: "Workflow progress",
    });

    for (const step of [
      "Source",
      "References",
      "Calibrate",
      "Contract",
      "Redesign",
      "Refine",
    ]) {
      expect(within(progress).getByText(step)).toBeVisible();
    }
  });
});
