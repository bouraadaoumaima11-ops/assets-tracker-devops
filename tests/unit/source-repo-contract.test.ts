import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const readJson = (p: string) => JSON.parse(read(p)) as Record<string, unknown>;

describe("source-repo link contract", () => {
  it("login page links to the GitHub repository with safe external-link semantics", () => {
    const source = read("src/app/login/page.tsx");
    expect(source).toContain("REPO_URL");
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain("GitHubMark");
    expect(source).toContain('getTranslations("nav")');
  });

  it("changelog page links to the GitHub releases page with safe external-link semantics", () => {
    const source = read("src/app/(main)/changelog/page.tsx");
    expect(source).toContain("REPO_URL");
    expect(source).toContain("/releases");
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain("ArrowUpRightIcon");
    expect(source).toContain('t("viewReleases")');
  });

  it("keeps changelog.viewReleases and nav.sourceCode bilingual with matching key sets", () => {
    const en = readJson("messages/en-US.json") as {
      changelog: Record<string, string>;
      nav: Record<string, string>;
    };
    const zh = readJson("messages/zh-TW.json") as typeof en;

    expect(en.changelog.viewReleases).toBeTypeOf("string");
    expect(zh.changelog.viewReleases).toBeTypeOf("string");
    expect(zh.changelog.viewReleases.length).toBeGreaterThan(0);
    expect(zh.changelog.viewReleases).not.toBe(en.changelog.viewReleases);
    expect(Object.keys(en.changelog).sort()).toEqual(Object.keys(zh.changelog).sort());
    expect(en.nav.sourceCode).toBeTypeOf("string");
    expect(zh.nav.sourceCode).toBeTypeOf("string");
    expect(zh.nav.sourceCode).not.toBe(en.nav.sourceCode);
  });
});
