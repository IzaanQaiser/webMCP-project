import { lookup } from "node:dns/promises";

import ipaddr from "ipaddr.js";

export const REFERENCE_URL_SAFE_MESSAGE = "Reference URL is not allowed.";

export const ReferenceUrlErrorCode = {
  INVALID_URL: "INVALID_URL",
  HTTPS_REQUIRED: "HTTPS_REQUIRED",
  CREDENTIALS_FORBIDDEN: "CREDENTIALS_FORBIDDEN",
  HOST_FORBIDDEN: "HOST_FORBIDDEN",
  NON_PUBLIC_ADDRESS: "NON_PUBLIC_ADDRESS",
  DNS_RESOLUTION_FAILED: "DNS_RESOLUTION_FAILED",
} as const;

export type ReferenceUrlErrorCode =
  (typeof ReferenceUrlErrorCode)[keyof typeof ReferenceUrlErrorCode];

export class ReferenceUrlSecurityError extends Error {
  readonly code: ReferenceUrlErrorCode;

  constructor(code: ReferenceUrlErrorCode, cause?: unknown) {
    super(REFERENCE_URL_SAFE_MESSAGE, cause === undefined ? undefined : { cause });
    this.name = "ReferenceUrlSecurityError";
    this.code = code;
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type ReferenceHostnameResolver = (
  hostname: string,
) => Promise<readonly ResolvedAddress[]>;

export interface ReferenceUrlValidationDependencies {
  resolveHostname?: ReferenceHostnameResolver;
}

const FORBIDDEN_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.azure.internal",
  "instance-data.ec2.internal",
]);

const defaultResolver: ReferenceHostnameResolver = async (hostname) => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });

  return addresses.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
};

function fail(code: ReferenceUrlErrorCode, cause?: unknown): never {
  throw new ReferenceUrlSecurityError(code, cause);
}

function hostnameForValidation(hostname: string): string {
  const withoutTrailingDot = hostname.toLowerCase().replace(/\.$/, "");

  if (
    withoutTrailingDot.startsWith("[") &&
    withoutTrailingDot.endsWith("]")
  ) {
    return withoutTrailingDot.slice(1, -1);
  }

  return withoutTrailingDot;
}

function isForbiddenHostname(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return true;
  }

  return Array.from(FORBIDDEN_HOSTNAMES).some(
    (forbidden) =>
      hostname === forbidden || hostname.endsWith(`.${forbidden}`),
  );
}

function parseIpAddress(address: string): ipaddr.IPv4 | ipaddr.IPv6 {
  try {
    return ipaddr.parse(address);
  } catch (error) {
    fail(ReferenceUrlErrorCode.DNS_RESOLUTION_FAILED, error);
  }
}

function isPublicIpAddress(address: string): boolean {
  const parsed = parseIpAddress(address);

  if (parsed.kind() === "ipv6") {
    const ipv6 = parsed as ipaddr.IPv6;

    if (ipv6.isIPv4MappedAddress()) {
      return ipv6.toIPv4Address().range() === "unicast";
    }
  }

  return parsed.range() === "unicast";
}

function isLiteralIpAddress(hostname: string): boolean {
  return ipaddr.isValid(hostname);
}

export async function validatePublicReferenceUrl(
  input: string | URL,
  dependencies: ReferenceUrlValidationDependencies = {},
): Promise<URL> {
  let url: URL;

  try {
    url = new URL(input.toString());
  } catch (error) {
    fail(ReferenceUrlErrorCode.INVALID_URL, error);
  }

  if (url.protocol !== "https:") {
    fail(ReferenceUrlErrorCode.HTTPS_REQUIRED);
  }

  if (url.username || url.password) {
    fail(ReferenceUrlErrorCode.CREDENTIALS_FORBIDDEN);
  }

  if (!url.hostname) {
    fail(ReferenceUrlErrorCode.INVALID_URL);
  }

  const hostname = hostnameForValidation(url.hostname);

  if (isForbiddenHostname(hostname)) {
    fail(ReferenceUrlErrorCode.HOST_FORBIDDEN);
  }

  if (isLiteralIpAddress(hostname)) {
    if (!isPublicIpAddress(hostname)) {
      fail(ReferenceUrlErrorCode.NON_PUBLIC_ADDRESS);
    }

    return url;
  }

  const resolveHostname = dependencies.resolveHostname ?? defaultResolver;
  let addresses: readonly ResolvedAddress[];

  try {
    addresses = await resolveHostname(hostname);
  } catch (error) {
    fail(ReferenceUrlErrorCode.DNS_RESOLUTION_FAILED, error);
  }

  if (addresses.length === 0) {
    fail(ReferenceUrlErrorCode.DNS_RESOLUTION_FAILED);
  }

  for (const { address } of addresses) {
    if (!isPublicIpAddress(address)) {
      fail(ReferenceUrlErrorCode.NON_PUBLIC_ADDRESS);
    }
  }

  return url;
}

/** Redirects intentionally reuse the complete initial-URL validation boundary. */
export async function validatePublicReferenceRedirect(
  input: string | URL,
  dependencies: ReferenceUrlValidationDependencies = {},
): Promise<URL> {
  return validatePublicReferenceUrl(input, dependencies);
}
