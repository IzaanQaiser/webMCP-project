import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  REFERENCE_CAPTURE_SAFE_MESSAGE,
  ReferenceCaptureError,
  ReferenceCaptureErrorCode,
} from "@/server/reference/capture";

import { POST } from "./route";

const { captureReference } = vi.hoisted(() => ({
  captureReference: vi.fn(),
}));

vi.mock("@/server/reference/capture", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/reference/capture")
  >("@/server/reference/capture");

  return { ...actual, captureReference };
});

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/references/capture", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
}

beforeEach(() => {
  captureReference.mockReset();
});

describe("POST /api/references/capture", () => {
  it("returns a transient capture result", async () => {
    const result = {
      url: "https://example.com/",
      screenshotDataUrl: "data:image/jpeg;base64,anBlZw==",
      elementMetadata: [],
    };
    captureReference.mockResolvedValue(result);

    const response = await post({ url: "https://example.com" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(captureReference).toHaveBeenCalledWith("https://example.com");
  });

  it("rejects an invalid request body without capturing", async () => {
    const response = await post({ url: "" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { message: "A reference URL is required." },
    });
    expect(captureReference).not.toHaveBeenCalled();
  });

  it("returns only the safe capture error contract", async () => {
    captureReference.mockRejectedValue(
      new ReferenceCaptureError(
        ReferenceCaptureErrorCode.NAVIGATION_FAILED,
        new Error("private address 10.0.0.4"),
      ),
    );

    const response = await post({ url: "https://example.com" });
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: {
        code: ReferenceCaptureErrorCode.NAVIGATION_FAILED,
        message: REFERENCE_CAPTURE_SAFE_MESSAGE,
      },
    });
    expect(JSON.stringify(body)).not.toContain("10.0.0.4");
  });
});
