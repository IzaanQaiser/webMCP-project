import { describe, expect, it, vi } from "vitest";

import {
  REFERENCE_URL_SAFE_MESSAGE,
  ReferenceUrlErrorCode,
  ReferenceUrlSecurityError,
  validatePublicReferenceRedirect,
  validatePublicReferenceUrl,
  type ReferenceHostnameResolver,
  type ResolvedAddress,
} from "./url-security";

const answer = (address: string): ResolvedAddress => ({
  address,
  family: address.includes(":") ? 6 : 4,
});

const resolverReturning = (...addresses: string[]): ReferenceHostnameResolver =>
  vi.fn(async () => addresses.map(answer));

async function expectRejection(
  input: string,
  code: ReferenceUrlErrorCode,
  resolver: ReferenceHostnameResolver = resolverReturning("93.184.216.34"),
) {
  try {
    await validatePublicReferenceUrl(input, { resolveHostname: resolver });
    throw new Error("Expected URL validation to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(ReferenceUrlSecurityError);
    expect(error).toMatchObject({
      code,
      message: REFERENCE_URL_SAFE_MESSAGE,
    });
  }
}

describe("public reference URL security", () => {
  it("accepts a public HTTPS hostname resolving only to public IPv4", async () => {
    const resolver = resolverReturning("93.184.216.34");

    const url = await validatePublicReferenceUrl("https://example.com/page", {
      resolveHostname: resolver,
    });

    expect(url.href).toBe("https://example.com/page");
    expect(resolver).toHaveBeenCalledWith("example.com");
  });

  it("accepts a public IPv6 DNS answer", async () => {
    const url = await validatePublicReferenceUrl("https://ipv6.example/", {
      resolveHostname: resolverReturning("2606:4700:4700::1111"),
    });

    expect(url.hostname).toBe("ipv6.example");
  });

  it("returns the URL in canonical serialized form", async () => {
    const url = await validatePublicReferenceUrl(
      "  https://EXAMPLE.com:443/a/../b?view=full#hero  ",
      { resolveHostname: resolverReturning("93.184.216.34") },
    );

    expect(url.href).toBe("https://example.com/b?view=full#hero");
  });

  it("rejects malformed URLs and missing hostnames", async () => {
    await expectRejection("not a url", ReferenceUrlErrorCode.INVALID_URL);
    await expectRejection("https://", ReferenceUrlErrorCode.INVALID_URL);
  });

  it.each(["http://example.com", "ftp://example.com/file"])(
    "rejects non-HTTPS URL %s",
    async (url) => {
      await expectRejection(url, ReferenceUrlErrorCode.HTTPS_REQUIRED);
    },
  );

  it("rejects URL credentials", async () => {
    await expectRejection(
      "https://user:secret@example.com/",
      ReferenceUrlErrorCode.CREDENTIALS_FORBIDDEN,
    );
  });

  it.each([
    "https://localhost/",
    "https://foo.localhost/",
    "https://printer.local/",
    "https://metadata.google.internal/",
  ])("rejects forbidden hostname %s", async (url) => {
    await expectRejection(url, ReferenceUrlErrorCode.HOST_FORBIDDEN);
  });

  it.each([
    "https://127.0.0.1/",
    "https://10.20.30.40/",
    "https://172.16.0.1/",
    "https://172.31.255.254/",
    "https://192.168.1.1/",
    "https://169.254.1.1/",
    "https://169.254.169.254/",
    "https://0.0.0.0/",
    "https://100.64.0.1/",
    "https://100.127.255.254/",
    "https://224.0.0.1/",
    "https://255.255.255.255/",
  ])("rejects non-public literal IPv4 %s", async (url) => {
    const resolver = resolverReturning("93.184.216.34");
    await expectRejection(
      url,
      ReferenceUrlErrorCode.NON_PUBLIC_ADDRESS,
      resolver,
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it.each([
    "https://[::1]/",
    "https://[::]/",
    "https://[fc00::1]/",
    "https://[fd12:3456::1]/",
    "https://[fe80::1]/",
    "https://[ff02::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:10.0.0.1]/",
  ])("rejects non-public literal IPv6 %s", async (url) => {
    const resolver = resolverReturning("2606:4700:4700::1111");
    await expectRejection(
      url,
      ReferenceUrlErrorCode.NON_PUBLIC_ADDRESS,
      resolver,
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it("rejects a hostname resolving only to a private address", async () => {
    await expectRejection(
      "https://private.example/",
      ReferenceUrlErrorCode.NON_PUBLIC_ADDRESS,
      resolverReturning("10.0.0.4"),
    );
  });

  it("rejects a mixed public and private DNS answer", async () => {
    await expectRejection(
      "https://mixed.example/",
      ReferenceUrlErrorCode.NON_PUBLIC_ADDRESS,
      resolverReturning("93.184.216.34", "10.0.0.4"),
    );
  });

  it("rejects an empty DNS answer", async () => {
    await expectRejection(
      "https://empty.example/",
      ReferenceUrlErrorCode.DNS_RESOLUTION_FAILED,
      resolverReturning(),
    );
  });

  it("rejects resolver failure", async () => {
    const resolver = vi.fn(async () => {
      throw new Error("resolver unavailable");
    });

    await expectRejection(
      "https://failure.example/",
      ReferenceUrlErrorCode.DNS_RESOLUTION_FAILED,
      resolver,
    );
  });

  it("does not expose a rejected resolved address in its safe message", async () => {
    try {
      await validatePublicReferenceUrl("https://mixed.example/", {
        resolveHostname: resolverReturning("93.184.216.34", "10.0.0.4"),
      });
      throw new Error("Expected URL validation to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ReferenceUrlSecurityError);
      expect((error as Error).message).toBe(REFERENCE_URL_SAFE_MESSAGE);
      expect((error as Error).message).not.toContain("10.0.0.4");
    }
  });

  it("fully validates a redirect to a private literal IP", async () => {
    const resolver = resolverReturning("93.184.216.34");
    await validatePublicReferenceUrl("https://safe.example/", {
      resolveHostname: resolver,
    });

    await expect(
      validatePublicReferenceRedirect("https://127.0.0.1/", {
        resolveHostname: resolver,
      }),
    ).rejects.toMatchObject({
      code: ReferenceUrlErrorCode.NON_PUBLIC_ADDRESS,
      message: REFERENCE_URL_SAFE_MESSAGE,
    });
  });

  it("fully validates a redirect hostname resolving privately", async () => {
    const resolver: ReferenceHostnameResolver = vi.fn(async (hostname) =>
      hostname === "safe.example"
        ? [answer("93.184.216.34")]
        : [answer("192.168.1.10")],
    );
    await validatePublicReferenceUrl("https://safe.example/", {
      resolveHostname: resolver,
    });

    await expect(
      validatePublicReferenceRedirect("https://redirect.example/", {
        resolveHostname: resolver,
      }),
    ).rejects.toMatchObject({
      code: ReferenceUrlErrorCode.NON_PUBLIC_ADDRESS,
      message: REFERENCE_URL_SAFE_MESSAGE,
    });
  });
});
