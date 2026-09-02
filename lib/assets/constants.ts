/** IndexedDB database containing browser-owned binary image assets. */
export const ASSET_DATABASE_NAME = "webmcp-image-assets";

/** Object store keyed by the compound [sessionId, assetId] identity. */
export const ASSET_OBJECT_STORE_NAME = "assets";

/** Current IndexedDB schema version for the image asset store. */
export const ASSET_DATABASE_VERSION = 1;

/** Maximum size of one MVP screenshot asset: 8 MiB. */
export const MAX_IMAGE_ASSET_BYTES = 8 * 1024 * 1024;

export function createAssetKey(
  sessionId: string,
  assetId: string,
): [string, string] {
  return [sessionId, assetId];
}
