import type {
  BrowserType,
  Request as PlaywrightRequest,
  Route,
} from "playwright";
import { describe, expect, it, vi } from "vitest";

import {
  ReferenceUrlErrorCode,
  ReferenceUrlSecurityError,
  validatePublicReferenceUrl,
} from "./url-security";
import {
  REFERENCE_CAPTURE_SAFE_MESSAGE,
  REFERENCE_METADATA_ELEMENT_LIMIT,
  REFERENCE_REDIRECT_LIMIT,
  REFERENCE_SCREENSHOT_BYTE_LIMIT,
  REFERENCE_TEXT_SNIPPET_LIMIT,
  REFERENCE_VIEWPORT,
  ReferenceCaptureErrorCode,
  captureReference,
  type CaptureUrlValidator,
} from "./capture";

interface RequestSpec {
  url: string;
  navigation?: boolean;
  redirectDepth?: number;
}

interface HarnessOptions {
  finalUrl?: string;
  gotoError?: Error;
  metadata?: unknown[];
  metadataError?: Error;
  requests?: RequestSpec[];
  screenshot?: Buffer;
  screenshotError?: Error;
}

function metadataEntry(text = "Visible heading") {
  return {
    tag: "H1",
    text,
    boundingRegion: { x: 20, y: 30, width: 400, height: 80 },
    selectedStyles: {
      fontFamily: "Arial",
      fontSize: "48px",
      color: "rgb(0, 0, 0)",
      unsupportedProperty: "must be dropped",
    },
  };
}

function createRequest(
  spec: RequestSpec,
  mainFrame: object,
): PlaywrightRequest {
  let previous: PlaywrightRequest | null = null;

  for (let index = 0; index < (spec.redirectDepth ?? 0); index += 1) {
    const redirectedFrom = previous;
    previous = {
      redirectedFrom: () => redirectedFrom,
    } as unknown as PlaywrightRequest;
  }

  return {
    frame: () => mainFrame,
    isNavigationRequest: () => spec.navigation ?? false,
    redirectedFrom: () => previous,
    url: () => spec.url,
  } as unknown as PlaywrightRequest;
}

function createHarness(options: HarnessOptions = {}) {
  const mainFrame = {};
  const routeRecords: Array<{
    request: RequestSpec;
    abort: ReturnType<typeof vi.fn>;
    continueRequest: ReturnType<typeof vi.fn>;
  }> = [];
  let routeHandler: ((route: Route) => Promise<void>) | undefined;
  const requests = options.requests ?? [
    { url: "https://public.example/", navigation: true },
  ];
  const page = {
    close: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => {
      if (options.metadataError) throw options.metadataError;
      return options.metadata ?? [metadataEntry()];
    }),
    goto: vi.fn(async () => {
      for (const requestSpec of requests) {
        const abort = vi.fn(async () => undefined);
        const continueRequest = vi.fn(async () => undefined);
        const request = createRequest(requestSpec, mainFrame);
        routeRecords.push({ request: requestSpec, abort, continueRequest });
        await routeHandler?.({
          abort,
          continue: continueRequest,
          request: () => request,
        } as unknown as Route);

        if (requestSpec.navigation && abort.mock.calls.length > 0) {
          throw new Error("navigation request aborted");
        }
      }

      if (options.gotoError) throw options.gotoError;
      return null;
    }),
    mainFrame: () => mainFrame,
    on: vi.fn(),
    screenshot: vi.fn(async () => {
      if (options.screenshotError) throw options.screenshotError;
      return options.screenshot ?? Buffer.from("jpeg-image");
    }),
    setDefaultNavigationTimeout: vi.fn(),
    setDefaultTimeout: vi.fn(),
    url: () => options.finalUrl ?? "https://public.example/final",
  };
  const context = {
    clearPermissions: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    newPage: vi.fn(async () => page),
    route: vi.fn(
      async (_pattern: string, handler: (route: Route) => Promise<void>) => {
        routeHandler = handler;
      },
    ),
  };
  const browser = {
    close: vi.fn(async () => undefined),
    newContext: vi.fn(async () => context),
  };
  const launcher = {
    launch: vi.fn(async () => browser),
  };

  return {
    browser,
    context,
    launcher: launcher as unknown as BrowserType,
    launcherSpy: launcher,
    page,
    routeRecords,
  };
}

const allowingValidator = () =>
  vi.fn<CaptureUrlValidator>(async (input) => new URL(input.toString()));

describe("reference capture", () => {
  it("captures one bounded JPEG result with hardened fixed context settings", async () => {
    const harness = createHarness();
    const validateUrl = allowingValidator();

    const result = await captureReference("https://public.example/", {
      browserLauncher: harness.launcher,
      validateUrl,
    });

    expect(result.url).toBe("https://public.example/final");
    expect(result.screenshotDataUrl).toBe(
      `data:image/jpeg;base64,${Buffer.from("jpeg-image").toString("base64")}`,
    );
    expect(result.elementMetadata).toHaveLength(1);
    expect(result.elementMetadata[0]).toMatchObject({
      tag: "h1",
      text: "Visible heading",
    });
    expect(result.elementMetadata[0].selectedStyles).not.toHaveProperty(
      "unsupportedProperty",
    );
    expect(harness.browser.newContext).toHaveBeenCalledWith({
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      serviceWorkers: "block",
      viewport: REFERENCE_VIEWPORT,
    });
    expect(harness.context.clearPermissions).toHaveBeenCalledOnce();
    expect(harness.page.screenshot).toHaveBeenCalledWith({
      fullPage: false,
      quality: 75,
      type: "jpeg",
    });
    expect(harness.context.route.mock.invocationCallOrder[0]).toBeLessThan(
      harness.page.goto.mock.invocationCallOrder[0],
    );
    expect(harness.context.close).toHaveBeenCalledOnce();
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it("caps metadata count and normalized text snippets", async () => {
    const metadata = Array.from(
      { length: REFERENCE_METADATA_ELEMENT_LIMIT + 5 },
      () => metadataEntry(`  ${"word ".repeat(100)}  `),
    );
    const harness = createHarness({ metadata });

    const result = await captureReference("https://public.example/", {
      browserLauncher: harness.launcher,
      validateUrl: allowingValidator(),
    });

    expect(result.elementMetadata).toHaveLength(
      REFERENCE_METADATA_ELEMENT_LIMIT,
    );
    expect(result.elementMetadata[0].text?.length).toBe(
      REFERENCE_TEXT_SNIPPET_LIMIT,
    );
    expect(result.elementMetadata[0].text).not.toMatch(/\s{2,}/);
  });

  it("never launches or navigates when initial validation rejects", async () => {
    const harness = createHarness();
    const validateUrl = vi.fn<CaptureUrlValidator>(async () => {
      throw new ReferenceUrlSecurityError(ReferenceUrlErrorCode.HOST_FORBIDDEN);
    });

    await expect(
      captureReference("https://localhost/", {
        browserLauncher: harness.launcher,
        validateUrl,
      }),
    ).rejects.toMatchObject({
      code: ReferenceCaptureErrorCode.INVALID_REFERENCE,
      message: REFERENCE_CAPTURE_SAFE_MESSAGE,
    });
    expect(harness.launcherSpy.launch).not.toHaveBeenCalled();
    expect(harness.page.goto).not.toHaveBeenCalled();
  });

  it.each([
    ["private literal", "https://127.0.0.1/"],
    ["privately resolved hostname", "https://private.example/image.png"],
  ])("aborts a %s subresource through the public URL validator", async (_, url) => {
    const harness = createHarness({
      requests: [
        { url: "https://public.example/", navigation: true },
        { url },
      ],
    });
    const validateUrl: CaptureUrlValidator = (input) =>
      validatePublicReferenceUrl(input, {
        resolveHostname: async (hostname) => [
          {
            address: hostname === "private.example" ? "10.0.0.8" : "93.184.216.34",
            family: 4,
          },
        ],
      });

    await captureReference("https://public.example/", {
      browserLauncher: harness.launcher,
      validateUrl,
    });

    expect(harness.routeRecords[1].abort).toHaveBeenCalledOnce();
    expect(harness.routeRecords[1].continueRequest).not.toHaveBeenCalled();
  });

  it("revalidates every redirect target", async () => {
    const harness = createHarness({
      requests: [
        { url: "https://public.example/", navigation: true },
        {
          url: "https://redirect.example/landing",
          navigation: true,
          redirectDepth: 1,
        },
      ],
      finalUrl: "https://redirect.example/landing",
    });
    const validateUrl = allowingValidator();

    await captureReference("https://public.example/", {
      browserLauncher: harness.launcher,
      validateUrl,
    });

    expect(validateUrl).toHaveBeenCalledWith(
      new URL("https://redirect.example/landing"),
    );
    expect(harness.routeRecords[1].continueRequest).toHaveBeenCalledOnce();
  });

  it.each([
    ["private literal", "https://127.0.0.1/"],
    ["privately resolved hostname", "https://private.example/"],
  ])("rejects a redirect to a %s", async (_, redirectUrl) => {
    const harness = createHarness({
      requests: [
        { url: "https://safe.example/", navigation: true },
        { url: redirectUrl, navigation: true, redirectDepth: 1 },
      ],
    });
    const validateUrl: CaptureUrlValidator = (input) =>
      validatePublicReferenceUrl(input, {
        resolveHostname: async (hostname) => [
          {
            address:
              hostname === "private.example" ? "192.168.1.5" : "93.184.216.34",
            family: 4,
          },
        ],
      });

    await expect(
      captureReference("https://safe.example/", {
        browserLauncher: harness.launcher,
        validateUrl,
      }),
    ).rejects.toMatchObject({
      code: ReferenceCaptureErrorCode.INVALID_REFERENCE,
      message: REFERENCE_CAPTURE_SAFE_MESSAGE,
    });
    expect(harness.routeRecords[1].abort).toHaveBeenCalledOnce();
    expect(harness.context.close).toHaveBeenCalledOnce();
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it("rejects a top-level redirect chain beyond the configured limit", async () => {
    const harness = createHarness({
      requests: [
        {
          url: "https://redirect.example/too-far",
          navigation: true,
          redirectDepth: REFERENCE_REDIRECT_LIMIT + 1,
        },
      ],
    });

    await expect(
      captureReference("https://public.example/", {
        browserLauncher: harness.launcher,
        validateUrl: allowingValidator(),
      }),
    ).rejects.toMatchObject({
      code: ReferenceCaptureErrorCode.REDIRECT_LIMIT,
      message: REFERENCE_CAPTURE_SAFE_MESSAGE,
    });
    expect(harness.routeRecords[0].abort).toHaveBeenCalledOnce();
    expect(harness.context.close).toHaveBeenCalledOnce();
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it("rejects an oversized raw screenshot and closes resources", async () => {
    const harness = createHarness({
      screenshot: Buffer.alloc(REFERENCE_SCREENSHOT_BYTE_LIMIT + 1),
    });

    await expect(
      captureReference("https://public.example/", {
        browserLauncher: harness.launcher,
        validateUrl: allowingValidator(),
      }),
    ).rejects.toMatchObject({
      code: ReferenceCaptureErrorCode.SCREENSHOT_TOO_LARGE,
      message: REFERENCE_CAPTURE_SAFE_MESSAGE,
    });
    expect(harness.context.close).toHaveBeenCalledOnce();
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it("maps navigation timeout safely and closes resources", async () => {
    const timeout = new Error("private infrastructure timeout at 10.0.0.4");
    timeout.name = "TimeoutError";
    const harness = createHarness({ gotoError: timeout });

    await expect(
      captureReference("https://public.example/", {
        browserLauncher: harness.launcher,
        validateUrl: allowingValidator(),
      }),
    ).rejects.toMatchObject({
      code: ReferenceCaptureErrorCode.NAVIGATION_TIMEOUT,
      message: REFERENCE_CAPTURE_SAFE_MESSAGE,
    });
    expect(harness.context.close).toHaveBeenCalledOnce();
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it("maps generic browser errors without leaking details", async () => {
    const harness = createHarness({
      gotoError: new Error("connect ECONNREFUSED 192.168.0.10"),
    });

    try {
      await captureReference("https://public.example/", {
        browserLauncher: harness.launcher,
        validateUrl: allowingValidator(),
      });
      throw new Error("Expected capture to reject");
    } catch (error) {
      expect(error).toMatchObject({
        code: ReferenceCaptureErrorCode.NAVIGATION_FAILED,
        message: REFERENCE_CAPTURE_SAFE_MESSAGE,
      });
      expect((error as Error).message).not.toContain("192.168.0.10");
    }
    expect(harness.context.close).toHaveBeenCalledOnce();
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });

  it.each([
    ["metadata", { metadataError: new Error("metadata failed") }],
    ["screenshot", { screenshotError: new Error("screenshot failed") }],
  ])("closes resources after %s failure", async (_, options) => {
    const harness = createHarness(options);

    await expect(
      captureReference("https://public.example/", {
        browserLauncher: harness.launcher,
        validateUrl: allowingValidator(),
      }),
    ).rejects.toMatchObject({
      code: ReferenceCaptureErrorCode.CAPTURE_FAILED,
      message: REFERENCE_CAPTURE_SAFE_MESSAGE,
    });
    expect(harness.context.close).toHaveBeenCalledOnce();
    expect(harness.browser.close).toHaveBeenCalledOnce();
  });
});
