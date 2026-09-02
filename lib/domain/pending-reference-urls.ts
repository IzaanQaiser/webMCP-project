import { z } from "zod";

export const MAX_PENDING_REFERENCE_URLS = 3;

export function normalizePendingReferenceUrl(value: string): string {
  const trimmedValue = value.trim();
  let url: URL;

  try {
    url = new URL(trimmedValue);
  } catch {
    throw new TypeError("Reference must be a valid HTTPS URL");
  }

  if (url.protocol !== "https:") {
    throw new TypeError("Reference URL must use HTTPS");
  }

  return url.toString();
}

export const PendingReferenceUrlSchema = z.string().transform((value, context) => {
  try {
    return normalizePendingReferenceUrl(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message:
        error instanceof Error
          ? error.message
          : "Reference must be a valid HTTPS URL",
    });
    return z.NEVER;
  }
});

export const PendingReferenceUrlsSchema = z
  .array(PendingReferenceUrlSchema)
  .max(
    MAX_PENDING_REFERENCE_URLS,
    `A session can contain at most ${MAX_PENDING_REFERENCE_URLS} pending references`,
  )
  .superRefine((urls, context) => {
    const seen = new Set<string>();

    urls.forEach((url, index) => {
      if (seen.has(url)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate reference URLs are not allowed",
          path: [index],
        });
      }
      seen.add(url);
    });
  });

export type PendingReferenceUrl = z.infer<typeof PendingReferenceUrlSchema>;
