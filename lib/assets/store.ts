import {
  ASSET_DATABASE_NAME,
  ASSET_DATABASE_VERSION,
  ASSET_OBJECT_STORE_NAME,
  MAX_IMAGE_ASSET_BYTES,
  createAssetKey,
} from "./constants";

function requireIdentifier(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
}

function validateAsset(sessionId: string, assetId: string, blob: Blob): void {
  requireIdentifier(sessionId, "sessionId");
  requireIdentifier(assetId, "assetId");

  if (!(blob instanceof Blob) || !blob.type.startsWith("image/")) {
    throw new TypeError("Asset must be an image Blob");
  }

  if (blob.size > MAX_IMAGE_ASSET_BYTES) {
    throw new RangeError(
      `Image asset exceeds the ${MAX_IMAGE_ASSET_BYTES}-byte limit`,
    );
  }
}

function getIndexedDbBoundary(): IDBFactory {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("IndexedDB is unavailable in this environment");
  }

  return window.indexedDB;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function openAssetDatabase(): Promise<IDBDatabase> {
  const indexedDB = getIndexedDbBoundary();
  const request = indexedDB.open(
    ASSET_DATABASE_NAME,
    ASSET_DATABASE_VERSION,
  );

  request.onupgradeneeded = () => {
    const database = request.result;

    if (!database.objectStoreNames.contains(ASSET_OBJECT_STORE_NAME)) {
      database.createObjectStore(ASSET_OBJECT_STORE_NAME);
    }
  };

  return requestResult(request);
}

export async function putAsset(
  sessionId: string,
  assetId: string,
  blob: Blob,
): Promise<void> {
  validateAsset(sessionId, assetId, blob);
  const database = await openAssetDatabase();

  try {
    const transaction = database.transaction(
      ASSET_OBJECT_STORE_NAME,
      "readwrite",
    );
    transaction
      .objectStore(ASSET_OBJECT_STORE_NAME)
      .put(blob, createAssetKey(sessionId, assetId));
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function getAsset(
  sessionId: string,
  assetId: string,
): Promise<Blob | null> {
  requireIdentifier(sessionId, "sessionId");
  requireIdentifier(assetId, "assetId");
  const database = await openAssetDatabase();

  try {
    const transaction = database.transaction(
      ASSET_OBJECT_STORE_NAME,
      "readonly",
    );
    const request = transaction
      .objectStore(ASSET_OBJECT_STORE_NAME)
      .get(createAssetKey(sessionId, assetId));
    const blob = (await requestResult(request)) as Blob | undefined;
    await transactionComplete(transaction);

    return blob ?? null;
  } finally {
    database.close();
  }
}

export async function deleteAsset(
  sessionId: string,
  assetId: string,
): Promise<void> {
  requireIdentifier(sessionId, "sessionId");
  requireIdentifier(assetId, "assetId");
  const database = await openAssetDatabase();

  try {
    const transaction = database.transaction(
      ASSET_OBJECT_STORE_NAME,
      "readwrite",
    );
    transaction
      .objectStore(ASSET_OBJECT_STORE_NAME)
      .delete(createAssetKey(sessionId, assetId));
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function clearSessionAssets(sessionId: string): Promise<void> {
  requireIdentifier(sessionId, "sessionId");
  const database = await openAssetDatabase();

  try {
    const transaction = database.transaction(
      ASSET_OBJECT_STORE_NAME,
      "readwrite",
    );
    const store = transaction.objectStore(ASSET_OBJECT_STORE_NAME);
    const request = store.openKeyCursor();

    request.onsuccess = () => {
      const cursor = request.result;

      if (cursor) {
        const key = cursor.primaryKey;

        if (Array.isArray(key) && key[0] === sessionId) {
          store.delete(key);
        }

        cursor.continue();
      }
    };

    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}
