# Demo Login CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing public Demo entry visually prominent with the approved option D treatment while preserving its current position and behavior.

**Architecture:** Keep the change inside the shared `DemoLoginButton` client component and the existing `demo.login` message namespace. A focused source/message contract test will lock the selected primary variant, two-line copy, icon accessibility, and bilingual metadata before the minimal presentation change is implemented.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, next-intl, Tailwind CSS 4, shadcn Button, Lucide React, Vitest 4.

## Global Constraints

- Keep `DemoLoginButton` in its existing document position after configured formal sign-in controls.
- Preserve the existing form action, pending state, error display, disabled behavior, and Demo lifecycle behavior.
- Use a darker surface derived from existing schema-aware primary tokens and fully opaque contrasting text; both text lines must reach at least `4.5:1` in every supported light and dark color schema. Do not add gradients, glow, decorative animation, a nested card, or a dependency.
- Use localized English and Traditional Chinese strings; do not hard-code user-facing component text.
- Both `start` and `restart` variants receive the same option D visual treatment while keeping their existing localized action labels.
- Keep the decorative play/spinner icon and secondary metadata out of the accessible button name.
- Follow TDD: observe a focused RED failure before editing production code.

---

### Task 1: Implement the Option D Demo CTA

**Files:**

- Modify: `tests/unit/public-demo-ui-contract.test.ts`
- Modify: `src/components/demo/demo-login-button.tsx`
- Modify: `messages/en-US.json`
- Modify: `messages/zh-TW.json`

**Interfaces:**

- Consumes: `DemoLoginButton({ variant?: "start" | "restart" })`, `startPublicDemoAction`, and the existing `demo.login` translation namespace.
- Produces: a new `demo.login.metadata: string` message in both locales and an unchanged exported `DemoLoginButton` interface.

- [ ] **Step 1: Write the failing option D contract test**

Add this test to `tests/unit/public-demo-ui-contract.test.ts` inside `describe("public Demo shell contract", ...)`:

```ts
it("renders the prominent two-line Demo CTA with bilingual metadata", () => {
  const source = read("src/components/demo/demo-login-button.tsx");
  const en = JSON.parse(read("messages/en-US.json")) as {
    demo: { login: Record<string, string> };
  };
  const zh = JSON.parse(read("messages/zh-TW.json")) as typeof en;

  expect(source).toContain("CirclePlay");
  expect(source).toContain('variant="default"');
  expect(source).toContain('t("metadata")');
  expect(source).toContain('aria-hidden="true"');
  expect(source).toContain("bg-[var(--primary-ink)]");
  expect(source).toContain("text-background");
  expect(source).not.toContain("text-background/");
  expect(en.demo.login.metadata).toBe("No sign-up · Isolated data for 24 hours");
  expect(zh.demo.login.metadata).toBe("免註冊 · 獨立資料空間保留 24 小時");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run tests/unit/public-demo-ui-contract.test.ts
```

Expected: the new test fails because `CirclePlay`, `variant="default"`, `t("metadata")`, `bg-[var(--primary-ink)]`, the fully opaque `text-background` treatment, and both metadata messages do not exist yet. Existing tests remain green.

- [ ] **Step 3: Add localized metadata**

Add this key next to the existing Demo login button messages in `messages/en-US.json`:

```json
"metadata": "No sign-up · Isolated data for 24 hours"
```

Add the matching key in `messages/zh-TW.json`:

```json
"metadata": "免註冊 · 獨立資料空間保留 24 小時"
```

- [ ] **Step 4: Implement the option D component treatment**

In `src/components/demo/demo-login-button.tsx`, import `CirclePlay` alongside `Loader2`, then replace only the existing `Button` contents and presentation with this structure:

```tsx
<Button
  type="submit"
  variant="default"
  disabled={pending}
  className="h-auto min-h-14 w-full rounded-xl bg-[var(--primary-ink)] px-4 py-2.5 text-background shadow-sm shadow-primary/30 hover:bg-[color-mix(in_oklab,var(--primary-ink)_90%,var(--foreground))]"
>
  {pending ? (
    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
  ) : (
    <CirclePlay className="size-5" aria-hidden="true" />
  )}
  <span className="flex min-w-0 flex-col items-start text-left leading-tight">
    <span>{pending ? t("preparing") : t(variant === "restart" ? "restartButton" : "button")}</span>
    <span aria-hidden="true" className="mt-1 text-xs font-normal text-background">
      {t("metadata")}
    </span>
  </span>
</Button>
```

Do not change the form action, initial action state, helper description, error handling, exported props, or the component's position in `src/app/login/page.tsx`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/unit/public-demo-ui-contract.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 6: Run static verification**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
git diff --check
```

Expected: every command exits 0. If Prettier reports only the four task files, run `pnpm exec prettier --write` on those exact files and repeat all four commands.

- [ ] **Step 7: Verify rendered login-page hierarchy**

Use the repository's existing local/Playwright setup with public Demo enabled. Check desktop and mobile widths in English and Traditional Chinese, including every supported light and dark color schema. Confirm the Demo CTA remains below the configured formal sign-in controls; its action label and metadata do not overflow; keyboard focus, pending/disabled presentation, helper text, and error area remain legible. Capture computed foreground/background colors and verify both text lines reach at least `4.5:1` for every supported schema. If `--primary-ink` does not meet that threshold in any schema, adjust the token-derived background treatment and the focused contract before implementation is accepted. Do not submit the form against a shared or production database.

- [ ] **Step 8: Commit the implementation**

```bash
git add tests/unit/public-demo-ui-contract.test.ts src/components/demo/demo-login-button.tsx messages/en-US.json messages/zh-TW.json
git commit -m "feat: emphasize public demo login CTA"
```
