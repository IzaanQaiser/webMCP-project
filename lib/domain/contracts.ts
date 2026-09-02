import { z } from "zod";

import { PendingReferenceUrlsSchema } from "./pending-reference-urls";

export const MAX_REFERENCES_PER_SESSION = 3;

const requiredString = z.string().trim().min(1);
const stringList = z.array(requiredString);

export const SourceSiteSchema = z
  .object({
    html: requiredString,
    css: requiredString,
  })
  .strict();

export type SourceSite = z.infer<typeof SourceSiteSchema>;

export const RegionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
  })
  .strict();

export type Region = z.infer<typeof RegionSchema>;

export const ReferenceElementMetadataSchema = z
  .object({
    tag: requiredString,
    text: z.string().nullable(),
    boundingRegion: RegionSchema,
    selectedStyles: z.record(z.string(), z.string()),
  })
  .strict();

export type ReferenceElementMetadata = z.infer<
  typeof ReferenceElementMetadataSchema
>;

export const ReferenceAssetSchema = z
  .object({
    id: requiredString,
    url: z.url().refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "https:";
    }, "Reference URL must use HTTPS"),
    screenshotAssetId: requiredString,
    elementMetadata: z.array(ReferenceElementMetadataSchema),
  })
  .strict();

export type ReferenceAsset = z.infer<typeof ReferenceAssetSchema>;

export const PreferencePolaritySchema = z.enum(["positive", "negative"]);
export type PreferencePolarity = z.infer<typeof PreferencePolaritySchema>;

export const PreferenceAspectSchema = z.enum([
  "layout",
  "typography",
  "colors",
  "background",
  "animation",
  "spacing",
  "everything",
]);
export type PreferenceAspect = z.infer<typeof PreferenceAspectSchema>;

export const PreferenceStatusSchema = z.enum([
  "pending",
  "interpreted",
  "resolved",
]);
export type PreferenceStatus = z.infer<typeof PreferenceStatusSchema>;

export const PreferenceSchema = z
  .object({
    id: requiredString,
    referenceId: requiredString,
    region: RegionSchema,
    polarity: PreferencePolaritySchema,
    aspects: z.array(PreferenceAspectSchema).min(1),
    comment: z.string(),
    interpretation: z.string().nullable(),
    status: PreferenceStatusSchema,
  })
  .strict();

export type Preference = z.infer<typeof PreferenceSchema>;

export const UnresolvedIntentSchema = z
  .object({
    id: requiredString,
    preferenceId: requiredString,
    aspect: PreferenceAspectSchema,
    question: requiredString,
    answer: z.string().nullable(),
    status: z.enum(["open", "resolved"]),
  })
  .strict();

export type UnresolvedIntent = z.infer<typeof UnresolvedIntentSchema>;

export const DesignContractSchema = z
  .object({
    preserve: stringList,
    hero: requiredString,
    navigation: requiredString,
    components: stringList,
    avoid: stringList,
    notes: z.string(),
  })
  .strict();

export type DesignContract = z.infer<typeof DesignContractSchema>;

export const FeedbackSchema = z
  .object({
    id: requiredString,
    targetId: requiredString,
    polarity: PreferencePolaritySchema,
    aspects: z.array(PreferenceAspectSchema).min(1),
    comment: z.string(),
    status: z.enum(["open", "resolved"]),
  })
  .strict();

export type Feedback = z.infer<typeof FeedbackSchema>;

export const LockedElementSchema = z
  .object({
    id: requiredString,
    targetId: requiredString,
    reason: z.string(),
  })
  .strict();

export type LockedElement = z.infer<typeof LockedElementSchema>;

export const SiteVersionSchema = z
  .object({
    id: requiredString,
    reason: requiredString,
    sourceSite: SourceSiteSchema,
  })
  .strict();

export type SiteVersion = z.infer<typeof SiteVersionSchema>;

export const DesignSessionSchema = z
  .object({
    id: requiredString,
    sourceSite: SourceSiteSchema.nullable(),
    pendingReferenceUrls: PendingReferenceUrlsSchema.default([]),
    references: z
      .array(ReferenceAssetSchema)
      .max(MAX_REFERENCES_PER_SESSION),
    preferences: z.array(PreferenceSchema),
    unresolvedIntents: z.array(UnresolvedIntentSchema),
    designContract: DesignContractSchema.nullable(),
    feedback: z.array(FeedbackSchema),
    lockedElements: z.array(LockedElementSchema),
    versions: z.array(SiteVersionSchema),
  })
  .strict();

export type DesignSession = z.infer<typeof DesignSessionSchema>;
