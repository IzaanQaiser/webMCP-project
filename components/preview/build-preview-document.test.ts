import { describe, expect, it } from "vitest";

import type { SourceSite } from "@/lib/domain";

import {
  SOURCE_PREVIEW_CSP,
  buildSourcePreviewDocument,
} from "./build-preview-document";

function parsePreview(source: SourceSite) {
  const srcDoc = buildSourcePreviewDocument(source);
  return {
    document: new DOMParser().parseFromString(srcDoc, "text/html"),
    srcDoc,
  };
}

describe("source preview document builder", () => {
  it("creates a complete document with normal HTML and provided CSS", () => {
    const css = "main { color: rebeccapurple; }";
    const { document, srcDoc } = parsePreview({
      html: "<main><h1>Preview heading</h1></main>",
      css,
    });

    expect(srcDoc.toLowerCase().startsWith("<!doctype html>")).toBe(true);
    expect(document.documentElement).not.toBeNull();
    expect(document.head).not.toBeNull();
    expect(document.body).not.toBeNull();
    expect(document.querySelector("h1")?.textContent).toBe("Preview heading");
    expect(
      document.querySelector("style[data-source-preview='styles']")?.textContent,
    ).toBe(css);
    expect(srcDoc).toContain(css);
  });

  it("removes script elements structurally", () => {
    const { document, srcDoc } = parsePreview({
      html: "<main>Safe</main><script>window.evil = true</script>",
      css: "main {}",
    });

    expect(document.querySelector("script")).toBeNull();
    expect(srcDoc).not.toContain("window.evil");
  });

  it("removes all inline event handlers including mixed-case names", () => {
    const { document, srcDoc } = parsePreview({
      html: '<main onclick="evil()"><img src="data:,x" oNeRrOr="bad()"><p ONLOAD="run()">Safe</p></main>',
      css: "main {}",
    });

    for (const element of document.querySelectorAll("*")) {
      expect(
        Array.from(element.attributes).some((attribute) =>
          attribute.name.toLowerCase().startsWith("on"),
        ),
      ).toBe(false);
    }
    expect(srcDoc).not.toMatch(/onclick|onerror|onload/i);
  });

  it("does not mutate the original SourceSite", () => {
    const source: SourceSite = {
      html: '<main onclick="evil()">Original</main>',
      css: "main { color: black; }",
    };
    const snapshot = structuredClone(source);

    buildSourcePreviewDocument(source);

    expect(source).toEqual(snapshot);
  });

  it("injects the restrictive static-preview CSP", () => {
    const { document } = parsePreview({
      html: "<main>Safe</main>",
      css: "main {}",
    });
    const csp = document.querySelector(
      'meta[http-equiv="Content-Security-Policy"]',
    );

    expect(csp?.getAttribute("content")).toBe(SOURCE_PREVIEW_CSP);
    expect(SOURCE_PREVIEW_CSP).toContain("default-src 'none'");
    expect(SOURCE_PREVIEW_CSP).toContain("script-src 'none'");
    expect(SOURCE_PREVIEW_CSP).toContain("style-src 'unsafe-inline'");
    expect(SOURCE_PREVIEW_CSP).toContain("form-action 'none'");
    expect(SOURCE_PREVIEW_CSP).toContain("frame-src 'none'");
    expect(SOURCE_PREVIEW_CSP).toContain("connect-src 'none'");
  });
});
