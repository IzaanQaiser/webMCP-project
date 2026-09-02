import { describe, expect, it } from "vitest";

import {
  DesignSessionSchema,
  FeedbackSchema,
  PreferenceAspectSchema,
  PreferenceSchema,
  ReferenceAssetSchema,
  SiteVersionSchema,
  SourceSiteSchema,
  type DesignSession,
  type ReferenceAsset,
} from "./contracts";

const sourceSite = {
  html: "<main><h1>Studio</h1></main>",
  css: "main { max-width: 64rem; }",
};

const reference: ReferenceAsset = {
  id: "reference-1",
  url: "https://example.com/inspiration",
  screenshotAssetId: "screenshot-asset-1",
  elementMetadata: [
    {
      tag: "section",
      text: "A restrained hero",
      boundingRegion: { x: 24, y: 48, width: 960, height: 520 },
      selectedStyles: {
        display: "grid",
        "font-size": "48px",
      },
    },
  ],
};

const validSession: DesignSession = {
  id: "session-1",
  sourceSite,
  references: [reference],
  preferences: [
    {
      id: "preference-1",
      referenceId: "reference-1",
      region: { x: 24, y: 48, width: 960, height: 520 },
      polarity: "positive",
      aspects: ["layout", "typography"],
      comment: "Clear hierarchy and generous spacing.",
      interpretation: "Use a restrained editorial layout.",
      status: "interpreted",
    },
  ],
  unresolvedIntents: [
    {
      id: "intent-1",
      preferenceId: "preference-1",
      aspect: "background",
      question: "Should the background remain neutral?",
      answer: null,
      status: "open",
    },
  ],
  designContract: {
    preserve: ["Core page content"],
    hero: "Editorial and concise",
    navigation: "Quiet and easy to scan",
    components: ["Crisp cards", "Compact controls"],
    avoid: ["Decorative gradients"],
    notes: "Maintain strong spacing rhythm.",
  },
  feedback: [
    {
      id: "feedback-1",
      targetId: "hero",
      polarity: "positive",
      aspects: ["layout"],
      comment: "Keep the header compact.",
      status: "open",
    },
  ],
  lockedElements: [
    {
      id: "locked-1",
      targetId: "header",
      reason: "Approved navigation structure",
    },
  ],
  versions: [
    {
      id: "version-1",
      reason: "Original source",
      sourceSite,
    },
  ],
};

describe("domain contracts", () => {
  it("accepts a fresh session without a source or design contract", () => {
    const freshSession: DesignSession = {
      id: "session-fresh",
      sourceSite: null,
      references: [],
      preferences: [],
      unresolvedIntents: [],
      designContract: null,
      feedback: [],
      lockedElements: [],
      versions: [],
    };

    expect(DesignSessionSchema.parse(freshSession)).toEqual(freshSession);
  });

  it("constructs a valid design session", () => {
    expect(DesignSessionSchema.parse(validSession)).toEqual(validSession);
  });

  it("survives a JSON serialize and parse round-trip", () => {
    const serialized = JSON.stringify(validSession);
    const parsed = JSON.parse(serialized) as unknown;

    expect(DesignSessionSchema.parse(parsed)).toEqual(validSession);
  });

  it("rejects an invalid preference polarity", () => {
    const invalidSession = structuredClone(validSession) as Record<
      string,
      unknown
    >;
    const preferences = invalidSession.preferences as Array<
      Record<string, unknown>
    >;
    preferences[0].polarity = "neutral";

    expect(() => DesignSessionSchema.parse(invalidSession)).toThrow();
  });

  it("ties a preference to reference evidence and a bounded region", () => {
    expect(
      PreferenceSchema.parse(validSession.preferences[0]),
    ).toMatchObject({
      id: "preference-1",
      referenceId: "reference-1",
      region: { x: 24, y: 48, width: 960, height: 520 },
    });

    const { referenceId, ...withoutReference } = validSession.preferences[0];
    expect(referenceId).toBe("reference-1");
    expect(() => PreferenceSchema.parse(withoutReference)).toThrow();

    expect(
      PreferenceSchema.parse({
        ...validSession.preferences[0],
        interpretation: null,
        status: "pending",
      }),
    ).toMatchObject({ interpretation: null, status: "pending" });
  });

  it("supports exactly the MVP preference aspects", () => {
    expect(PreferenceAspectSchema.options).toEqual([
      "layout",
      "typography",
      "colors",
      "background",
      "animation",
      "spacing",
      "everything",
    ]);
    expect(() => PreferenceAspectSchema.parse("color")).toThrow();
  });

  it("requires targeted feedback with a polarity", () => {
    expect(FeedbackSchema.parse(validSession.feedback[0])).toMatchObject({
      targetId: "hero",
      polarity: "positive",
    });

    const { targetId, ...withoutTarget } = validSession.feedback[0];
    expect(targetId).toBe("hero");
    expect(() => FeedbackSchema.parse(withoutTarget)).toThrow();

    const { polarity, ...withoutPolarity } = validSession.feedback[0];
    expect(polarity).toBe("positive");
    expect(() => FeedbackSchema.parse(withoutPolarity)).toThrow();
  });

  it("requires a feedback comment field but permits an empty comment", () => {
    expect(
      FeedbackSchema.parse({ ...validSession.feedback[0], comment: "" }),
    ).toMatchObject({ comment: "" });

    const { comment, ...withoutComment } = validSession.feedback[0];
    expect(comment).toBe("Keep the header compact.");
    expect(() => FeedbackSchema.parse(withoutComment)).toThrow();
  });

  it("requires a reason for each site version", () => {
    expect(SiteVersionSchema.parse(validSession.versions[0])).toMatchObject({
      reason: "Original source",
    });

    const { reason, ...withoutReason } = validSession.versions[0];
    expect(reason).toBe("Original source");
    expect(() => SiteVersionSchema.parse(withoutReason)).toThrow();
  });

  it("rejects more than three references", () => {
    const references = Array.from({ length: 4 }, (_, index) => ({
      ...reference,
      id: `reference-${index + 1}`,
      screenshotAssetId: `screenshot-asset-${index + 1}`,
    }));

    expect(() =>
      DesignSessionSchema.parse({ ...validSession, references }),
    ).toThrow();
  });

  it.each([
    { html: "", css: "main {}" },
    { html: "<main />", css: "   " },
  ])("rejects empty required source fields", (invalidSource) => {
    expect(() => SourceSiteSchema.parse(invalidSource)).toThrow();
  });

  it("rejects a reference with a missing or empty screenshot asset ID", () => {
    const missingId: Partial<ReferenceAsset> = { ...reference };
    delete missingId.screenshotAssetId;

    expect(() => ReferenceAssetSchema.parse(missingId)).toThrow();
    expect(() =>
      ReferenceAssetSchema.parse({ ...reference, screenshotAssetId: " " }),
    ).toThrow();
  });

  it("accepts only HTTPS reference URLs", () => {
    expect(ReferenceAssetSchema.parse(reference).url).toBe(
      "https://example.com/inspiration",
    );
    expect(() =>
      ReferenceAssetSchema.parse({
        ...reference,
        url: "http://example.com/inspiration",
      }),
    ).toThrow();
    expect(() =>
      ReferenceAssetSchema.parse({
        ...reference,
        url: "ftp://example.com/inspiration",
      }),
    ).toThrow();
  });

  it("contains screenshot references by ID only", () => {
    expect(Object.keys(ReferenceAssetSchema.shape)).toEqual([
      "id",
      "url",
      "screenshotAssetId",
      "elementMetadata",
    ]);

    const serialized = JSON.stringify(validSession);
    expect(serialized).not.toMatch(
      /"(?:screenshotBytes|screenshotDataUrl|screenshotBase64|blob|base64)"/i,
    );
    expect(() =>
      ReferenceAssetSchema.parse({
        ...reference,
        screenshotDataUrl: "data:image/png;base64,AAAA",
      }),
    ).toThrow();
  });
});
