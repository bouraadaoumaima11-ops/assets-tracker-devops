import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("public Demo shell contract", () => {
  it("keeps reset, sign-in, confirmation, expiry, and stale-entity recovery in the banner", () => {
    const source = read("src/components/demo/demo-mode-banner.tsx");

    expect(source).toContain("AlertDialog");
    expect(source).toContain("resetPublicDemoAction");
    expect(source).toContain('href="/login?from=demo"');
    expect(source).toContain("exitPublicDemoAction");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('router.replace("/demo/expired")');
    expect(source).toContain('router.replace("/")');
    expect(source).toContain("router.refresh()");
  });

  it("provides each Demo shell message namespace in both locales", () => {
    const en = JSON.parse(read("messages/en-US.json")) as { demo: Record<string, unknown> };
    const zh = JSON.parse(read("messages/zh-TW.json")) as { demo: Record<string, unknown> };
    const expectedKeys = ["login", "banner", "reset", "expired", "apiErrors"];

    expect(Object.keys(en.demo).sort()).toEqual(Object.keys(zh.demo).sort());
    for (const key of expectedKeys) {
      expect(en.demo[key]).toBeDefined();
      expect(zh.demo[key]).toBeDefined();
    }
  });
});
