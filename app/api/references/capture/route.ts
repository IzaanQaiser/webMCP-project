import { NextResponse } from "next/server";

import {
  ReferenceCaptureError,
  ReferenceCaptureErrorCode,
  captureReference,
} from "@/server/reference/capture";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: "A reference URL is required." } },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("url" in body) ||
    typeof body.url !== "string" ||
    body.url.trim().length === 0
  ) {
    return NextResponse.json(
      { error: { message: "A reference URL is required." } },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await captureReference(body.url));
  } catch (error) {
    if (error instanceof ReferenceCaptureError) {
      let status = 502;

      if (error.code === ReferenceCaptureErrorCode.INVALID_REFERENCE) {
        status = 400;
      } else if (error.code === ReferenceCaptureErrorCode.NAVIGATION_TIMEOUT) {
        status = 504;
      } else if (
        error.code === ReferenceCaptureErrorCode.SCREENSHOT_TOO_LARGE
      ) {
        status = 422;
      }

      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status },
      );
    }

    return NextResponse.json(
      { error: { message: "Reference capture failed." } },
      { status: 500 },
    );
  }
}
