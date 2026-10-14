import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { DEFAULT_SOURCE, parseSourceUrl, probeSource } from "./source-store";

describe("parseSourceUrl", () => {
  test("takes a bare host for an https site", () => {
    expect(parseSourceUrl("mempool.space")).toEqual({
      api: "https://mempool.space/api",
      label: "mempool.space",
      web: "https://mempool.space",
      ws: "wss://mempool.space/api/v1/ws",
    });
  });

  test("reads the same site however it is written", () => {
    const site = parseSourceUrl("mempool.space");
    expect(parseSourceUrl("https://mempool.space/")).toEqual(site);
    expect(parseSourceUrl("https://mempool.space/api")).toEqual(site);
    expect(parseSourceUrl("  https://mempool.space/api//  ")).toEqual(site);
  });

  test("matches the default source", () => {
    expect({ ...parseSourceUrl("mempool.space"), kind: "mempool" }).toEqual(
      DEFAULT_SOURCE
    );
  });

  test("keeps a network's path", () => {
    expect(parseSourceUrl("https://mempool.space/testnet4/api/")).toEqual({
      api: "https://mempool.space/testnet4/api",
      label: "mempool.space/testnet4",
      web: "https://mempool.space/testnet4",
      ws: "wss://mempool.space/testnet4/api/v1/ws",
    });
  });

  test("takes an Esplora API by its address", () => {
    expect(parseSourceUrl("https://mempool.second.tech/api")).toEqual({
      api: "https://mempool.second.tech/api",
      label: "mempool.second.tech",
      web: "https://mempool.second.tech",
      ws: "wss://mempool.second.tech/api/v1/ws",
    });
  });

  test("keeps plain http, and its port", () => {
    expect(parseSourceUrl("http://umbrel.local:3006/api")).toEqual({
      api: "http://umbrel.local:3006/api",
      label: "umbrel.local:3006",
      web: "http://umbrel.local:3006",
      ws: "ws://umbrel.local:3006/api/v1/ws",
    });
  });

  test("turns down anything but a web address", () => {
    expect(parseSourceUrl("ftp://x")).toBeUndefined();
    expect(parseSourceUrl("wss://mempool.space/api/v1/ws")).toBeUndefined();
    expect(parseSourceUrl("not a url")).toBeUndefined();
    expect(parseSourceUrl("https://")).toBeUndefined();
    expect(parseSourceUrl("   ")).toBeUndefined();
  });
});

/** Answers like a server that has only these paths. */
const serve = (routes: Record<string, string>) =>
  spyOn(globalThis, "fetch").mockImplementation(((input: RequestInfo | URL) => {
    const body = routes[String(input)];
    return Promise.resolve(
      body === undefined
        ? new Response("Not found", { status: 404 })
        : new Response(body)
    );
  }) as typeof fetch);

describe("probeSource", () => {
  afterEach(() => {
    mock.restore();
  });

  test("finds a mempool backend by its recommended fees", async () => {
    serve({
      "https://mempool.space/api/v1/fees/recommended": JSON.stringify({
        fastestFee: 2,
      }),
    });
    expect(await probeSource("mempool.space")).toEqual(DEFAULT_SOURCE);
  });

  test("falls back to a bare Esplora API, which has no websocket", async () => {
    serve({ "https://mempool.second.tech/api/blocks/tip/height": "971474" });
    const source = await probeSource("https://mempool.second.tech/api");
    expect(source).toEqual({
      api: "https://mempool.second.tech/api",
      kind: "esplora",
      label: "mempool.second.tech",
      web: "https://mempool.second.tech",
    });
  });

  test("says so when neither answers", async () => {
    serve({ "https://example.com/api/blocks/tip/height": "<html>" });
    await expect(probeSource("example.com")).rejects.toThrow(
      "Could not reach example.com"
    );
  });

  test("says so when the address is no address", async () => {
    await expect(probeSource("ftp://x")).rejects.toThrow("not a web address");
  });
});
