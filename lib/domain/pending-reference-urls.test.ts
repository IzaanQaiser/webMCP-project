import { describe, expect, it } from "vitest";

import { PendingReferenceUrlsSchema } from "./pending-reference-urls";

describe("pending reference URL contract", () => {
  it("accepts and canonicalizes one HTTPS URL", () => {
    expect(
      PendingReferenceUrlsSchema.parse(["  https://Example.com  "]),
    ).toEqual(["https://example.com/"]);
  });

  it("accepts three HTTPS URLs", () => {
    expect(
      PendingReferenceUrlsSchema.parse([
        "https://one.example/",
        "https://two.example/path",
        "https://three.example/?view=grid",
      ]),
    ).toHaveLength(3);
  });

  it("rejects a fourth URL", () => {
    expect(() =>
      PendingReferenceUrlsSchema.parse([
        "https://one.example/",
        "https://two.example/",
        "https://three.example/",
        "https://four.example/",
      ]),
    ).toThrow();
  });

  it.each(["http://example.com", "ftp://example.com", "mailto:a@example.com"])(
    "rejects non-HTTPS scheme %s",
    (url) => {
      expect(() => PendingReferenceUrlsSchema.parse([url])).toThrow();
    },
  );

  it("rejects duplicates after URL normalization", () => {
    expect(() =>
      PendingReferenceUrlsSchema.parse([
        "https://EXAMPLE.com:443/path",
        "  https://example.com/path  ",
      ]),
    ).toThrow("Duplicate reference URLs");
  });
});
