import type { SourceSite } from "@/lib/domain";

export const SOURCE_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src 'none'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

function makeStyleSafeForEmbedding(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

export function buildSourcePreviewDocument(source: SourceSite): string {
  if (typeof DOMParser === "undefined") {
    throw new Error("Source previews require a browser DOM parser");
  }

  const document = new DOMParser().parseFromString(source.html, "text/html");

  for (const script of document.querySelectorAll("script")) {
    script.remove();
  }

  for (const element of document.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  const contentSecurityPolicy = document.createElement("meta");
  contentSecurityPolicy.httpEquiv = "Content-Security-Policy";
  contentSecurityPolicy.content = SOURCE_PREVIEW_CSP;
  document.head.prepend(contentSecurityPolicy);

  const sourceStyles = document.createElement("style");
  sourceStyles.dataset.sourcePreview = "styles";
  sourceStyles.textContent = makeStyleSafeForEmbedding(source.css);
  document.head.append(sourceStyles);

  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}
