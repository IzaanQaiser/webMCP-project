import { chromium, errors, type Browser, type BrowserContext, type BrowserType, type Page } from "playwright";

import {
  ReferenceElementMetadataSchema,
  type ReferenceElementMetadata,
} from "@/lib/domain";

import {
  ReferenceUrlSecurityError,
  validatePublicReferenceUrl,
} from "./url-security";

export const REFERENCE_VIEWPORT = { width: 1440, height: 900 } as const;
export const REFERENCE_NAVIGATION_TIMEOUT_MS = 15_000;
export const REFERENCE_CAPTURE_TIMEOUT_MS = 20_000;
export const REFERENCE_REDIRECT_LIMIT = 5;
export const REFERENCE_METADATA_ELEMENT_LIMIT = 200;
export const REFERENCE_TEXT_SNIPPET_LIMIT = 240;
export const REFERENCE_SCREENSHOT_BYTE_LIMIT = 5 * 1024 * 1024;
export const REFERENCE_SCREENSHOT_QUALITY = 75;

export const REFERENCE_CAPTURE_SAFE_MESSAGE = "Reference capture failed.";

export const ReferenceCaptureErrorCode = {
  INVALID_REFERENCE: "INVALID_REFERENCE",
  NAVIGATION_TIMEOUT: "NAVIGATION_TIMEOUT",
  NAVIGATION_FAILED: "NAVIGATION_FAILED",
  REDIRECT_LIMIT: "REDIRECT_LIMIT",
  SCREENSHOT_TOO_LARGE: "SCREENSHOT_TOO_LARGE",
  CAPTURE_FAILED: "CAPTURE_FAILED",
} as const;

export type ReferenceCaptureErrorCode =
  (typeof ReferenceCaptureErrorCode)[keyof typeof ReferenceCaptureErrorCode];

export class ReferenceCaptureError extends Error {
  readonly code: ReferenceCaptureErrorCode;

  constructor(code: ReferenceCaptureErrorCode, cause?: unknown) {
    super(
      REFERENCE_CAPTURE_SAFE_MESSAGE,
      cause === undefined ? undefined : { cause },
    );
    this.name = "ReferenceCaptureError";
    this.code = code;
  }
}

export interface ReferenceCaptureResult {
  url: string;
  screenshotDataUrl: string;
  elementMetadata: ReferenceElementMetadata[];
}

export type CaptureUrlValidator = (input: string | URL) => Promise<URL>;

export interface ReferenceCaptureDependencies {
  browserLauncher?: BrowserType;
  validateUrl?: CaptureUrlValidator;
}

const SELECTED_STYLE_PROPERTIES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "color",
  "backgroundColor",
  "borderRadius",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
  "rowGap",
  "columnGap",
  "animationName",
  "animationDuration",
  "transitionProperty",
  "transitionDuration",
] as const;

function captureError(
  code: ReferenceCaptureErrorCode,
  cause?: unknown,
): ReferenceCaptureError {
  return new ReferenceCaptureError(code, cause);
}

function redirectCount(request: import("playwright").Request): number {
  let count = 0;
  let previous = request.redirectedFrom();

  while (previous) {
    count += 1;
    previous = previous.redirectedFrom();
  }

  return count;
}

function isNavigationTimeout(error: unknown): boolean {
  return (
    error instanceof errors.TimeoutError ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}

async function withCaptureTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutFailure = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(captureError(ReferenceCaptureErrorCode.CAPTURE_FAILED)),
      REFERENCE_CAPTURE_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([operation, timeoutFailure]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizeMetadata(
  metadata: ReferenceElementMetadata[],
): ReferenceElementMetadata[] {
  return metadata.slice(0, REFERENCE_METADATA_ELEMENT_LIMIT).map((entry) => {
    const normalizedText = entry.text?.replace(/\s+/g, " ").trim() ?? "";
    const selectedStyles: Record<string, string> = {};

    for (const property of SELECTED_STYLE_PROPERTIES) {
      const value = entry.selectedStyles[property];
      if (typeof value === "string") {
        selectedStyles[property] = value;
      }
    }

    return ReferenceElementMetadataSchema.parse({
      tag: entry.tag.toLowerCase(),
      text: normalizedText
        ? normalizedText.slice(0, REFERENCE_TEXT_SNIPPET_LIMIT)
        : null,
      boundingRegion: entry.boundingRegion,
      selectedStyles,
    });
  });
}

async function collectElementMetadata(
  page: Page,
): Promise<ReferenceElementMetadata[]> {
  const metadata = await page.evaluate(
    ({ elementLimit, textLimit, styleProperties }) => {
      const results: ReferenceElementMetadata[] = [];

      for (const element of document.querySelectorAll("*")) {
        if (results.length >= elementLimit) {
          break;
        }

        const style = getComputedStyle(element);
        const region = element.getBoundingClientRect();
        const opacity = Number.parseFloat(style.opacity);
        const intersectsViewport =
          region.bottom > 0 &&
          region.right > 0 &&
          region.top < window.innerHeight &&
          region.left < window.innerWidth;

        if (
          region.width <= 0 ||
          region.height <= 0 ||
          !intersectsViewport ||
          style.display === "none" ||
          style.visibility === "hidden" ||
          opacity === 0
        ) {
          continue;
        }

        const normalizedText = (element.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
        const selectedStyles: Record<string, string> = {};

        for (const property of styleProperties) {
          selectedStyles[property] = style[property as keyof CSSStyleDeclaration] as string;
        }

        results.push({
          tag: element.tagName.toLowerCase(),
          text: normalizedText ? normalizedText.slice(0, textLimit) : null,
          boundingRegion: {
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
          },
          selectedStyles,
        });
      }

      return results;
    },
    {
      elementLimit: REFERENCE_METADATA_ELEMENT_LIMIT,
      textLimit: REFERENCE_TEXT_SNIPPET_LIMIT,
      styleProperties: SELECTED_STYLE_PROPERTIES,
    },
  );

  return normalizeMetadata(metadata);
}

async function closeResources(
  context: BrowserContext | undefined,
  browser: Browser | undefined,
): Promise<void> {
  if (context) {
    await context.close().catch(() => undefined);
  }
  if (browser) {
    await browser.close().catch(() => undefined);
  }
}

export async function captureReference(
  input: string,
  dependencies: ReferenceCaptureDependencies = {},
): Promise<ReferenceCaptureResult> {
  const validateUrl = dependencies.validateUrl ?? validatePublicReferenceUrl;
  let initialUrl: URL;

  try {
    initialUrl = await validateUrl(input);
  } catch (error) {
    throw captureError(ReferenceCaptureErrorCode.INVALID_REFERENCE, error);
  }

  const browserLauncher = dependencies.browserLauncher ?? chromium;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let requestFailure: ReferenceCaptureError | undefined;

  try {
    browser = await browserLauncher.launch({
      headless: true,
      timeout: REFERENCE_CAPTURE_TIMEOUT_MS,
    });
    context = await browser.newContext({
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      serviceWorkers: "block",
      viewport: REFERENCE_VIEWPORT,
    });
    await context.clearPermissions();

    await context.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      let parsedRequestUrl: URL;

      try {
        parsedRequestUrl = new URL(requestUrl);
      } catch {
        await route.abort("blockedbyclient");
        return;
      }

      if (
        parsedRequestUrl.protocol !== "http:" &&
        parsedRequestUrl.protocol !== "https:"
      ) {
        await route.abort("blockedbyclient");
        return;
      }

      const isTopLevelNavigation =
        request.isNavigationRequest() &&
        page !== undefined &&
        request.frame() === page.mainFrame();

      if (
        isTopLevelNavigation &&
        redirectCount(request) > REFERENCE_REDIRECT_LIMIT
      ) {
        requestFailure = captureError(ReferenceCaptureErrorCode.REDIRECT_LIMIT);
        await route.abort("blockedbyclient");
        return;
      }

      try {
        await validateUrl(parsedRequestUrl);
        await route.continue();
      } catch (error) {
        if (isTopLevelNavigation) {
          requestFailure = captureError(
            ReferenceCaptureErrorCode.INVALID_REFERENCE,
            error,
          );
        }
        await route.abort("blockedbyclient");
      }
    });

    page = await context.newPage();
    page.setDefaultTimeout(REFERENCE_CAPTURE_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(REFERENCE_NAVIGATION_TIMEOUT_MS);
    page.on("popup", (popup) => {
      void popup.close();
    });
    page.on("download", (download) => {
      void download.cancel();
    });

    try {
      await page.goto(initialUrl.href, {
        timeout: REFERENCE_NAVIGATION_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
      });
    } catch (error) {
      if (requestFailure) {
        throw requestFailure;
      }
      if (isNavigationTimeout(error)) {
        throw captureError(ReferenceCaptureErrorCode.NAVIGATION_TIMEOUT, error);
      }
      throw captureError(ReferenceCaptureErrorCode.NAVIGATION_FAILED, error);
    }

    const finalUrl = await validateUrl(page.url()).catch((error) => {
      throw captureError(ReferenceCaptureErrorCode.INVALID_REFERENCE, error);
    });
    const elementMetadata = await withCaptureTimeout(
      collectElementMetadata(page),
    );
    const screenshot = await withCaptureTimeout(
      page.screenshot({
        fullPage: false,
        quality: REFERENCE_SCREENSHOT_QUALITY,
        type: "jpeg",
      }),
    );

    if (screenshot.byteLength > REFERENCE_SCREENSHOT_BYTE_LIMIT) {
      throw captureError(ReferenceCaptureErrorCode.SCREENSHOT_TOO_LARGE);
    }

    return {
      url: finalUrl.href,
      screenshotDataUrl: `data:image/jpeg;base64,${screenshot.toString("base64")}`,
      elementMetadata,
    };
  } catch (error) {
    if (error instanceof ReferenceCaptureError) {
      throw error;
    }
    if (error instanceof ReferenceUrlSecurityError) {
      throw captureError(ReferenceCaptureErrorCode.INVALID_REFERENCE, error);
    }
    throw captureError(ReferenceCaptureErrorCode.CAPTURE_FAILED, error);
  } finally {
    await closeResources(context, browser);
  }
}
