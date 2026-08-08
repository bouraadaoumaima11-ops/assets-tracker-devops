import type { ErrorEvent, EventHint } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { beforeSend } from "@/lib/sentry-config";

describe("Sentry privacy sanitization", () => {
  it("removes Demo forwarding identifiers and raw error text from the full event payload", () => {
    const rawIp = "203.0.113.77";
    const headerSentinel = "FORWARDING_HEADER_SENTINEL";
    const accountId = "acct-DEMO_ACCOUNT_SENTINEL";
    const transactionId = "txn-DEMO_TRANSACTION_SENTINEL";
    const demoId = "demo-DEMO_WORKSPACE_SENTINEL";
    const throwSentinel = "DEMO_THROW_SENTINEL";
    const rawUrl = `https://asset-tracker.example/demo/${demoId}/accounts/${accountId}/transactions/${transactionId}?token=DEMO_URL_QUERY_SENTINEL#fragment`;
    const event = {
      level: "error",
      message: `Demo message ${throwSentinel} ${rawUrl}`,
      logentry: {
        message: `Demo log ${throwSentinel} ${rawUrl}`,
        params: [throwSentinel],
      },
      exception: {
        values: [
          {
            type: "Error",
            value: `Demo exception ${throwSentinel} ${rawUrl}`,
          },
        ],
      },
      request: {
        url: rawUrl,
        query_string: "token=DEMO_URL_QUERY_SENTINEL",
        headers: {
          "x-forwarded-for": `${rawIp}, ${headerSentinel}`,
          "cf-connecting-ip": rawIp,
          "x-real-ip": rawIp,
          forwarded: `for=${rawIp}`,
          authorization: "Bearer DEMO_AUTH_SENTINEL",
          "x-safe": "safe-value",
        },
      },
      breadcrumbs: [
        {
          category: "app.warning",
          message: `Demo breadcrumb ${throwSentinel} ${rawUrl}`,
          data: { requestUrl: rawUrl, error: throwSentinel },
        },
      ],
      extra: {
        msg: `Demo extra ${throwSentinel}`,
        error: throwSentinel,
        requestUrl: rawUrl,
      },
      contexts: {
        demo: {
          clientIp: rawIp,
          workspaceId: demoId,
          lastError: throwSentinel,
        },
      },
      tags: {
        requestUrl: rawUrl,
        error: throwSentinel,
      },
      transaction: rawUrl,
      user: { id: demoId },
    } as unknown as ErrorEvent;

    const sanitized = beforeSend(event, {} as EventHint);

    expect(sanitized).not.toBeNull();
    const payload = JSON.stringify(sanitized);
    for (const sensitiveValue of [
      rawIp,
      headerSentinel,
      accountId,
      transactionId,
      demoId,
      throwSentinel,
      "DEMO_URL_QUERY_SENTINEL",
      "DEMO_AUTH_SENTINEL",
    ]) {
      expect(payload).not.toContain(sensitiveValue);
    }
    expect(sanitized?.request?.url).toBe(
      "https://asset-tracker.example/demo/:id/accounts/:id/transactions/:id",
    );
    expect(sanitized?.request?.headers).not.toHaveProperty("x-forwarded-for");
    expect(sanitized?.request?.headers).not.toHaveProperty("cf-connecting-ip");
    expect(sanitized?.request?.headers).not.toHaveProperty("x-real-ip");
    expect(sanitized?.request?.headers).not.toHaveProperty("forwarded");
    expect(sanitized?.message).toBe("[Filtered]");
    expect(sanitized?.logentry?.message).toBe("[Filtered]");
    expect(sanitized?.exception?.values?.[0]?.value).toBe("[Filtered]");
  });

  it("scrubs nested exception/context IP metadata and templates every dynamic API identifier", () => {
    const rawIp = "2001:db8:8::9";
    const accountId = "acct-NESTED_SENTINEL";
    const recurringId = "recurring-NESTED_SENTINEL";
    const rawUrl = `https://asset-tracker.example/api/accounts/${accountId}/recurring-cash-transactions/${recurringId}`;
    const event = {
      exception: {
        values: [
          {
            type: "Error",
            value: "safe outer text",
            mechanism: { data: { transportDetail: `request from ${rawIp}` } },
          },
        ],
      },
      request: {
        url: rawUrl,
        env: { REMOTE_ADDR: rawIp },
      },
      contexts: {
        transport: {
          headers: { "x-forwarded-for": rawIp },
          peer: rawIp,
        },
      },
    } as unknown as ErrorEvent;

    const sanitized = beforeSend(event, {} as EventHint);
    const payload = JSON.stringify(sanitized);

    expect(payload).not.toContain(rawIp);
    expect(payload).not.toContain(accountId);
    expect(payload).not.toContain(recurringId);
    expect(sanitized?.request?.url).toBe(
      "https://asset-tracker.example/api/accounts/:id/recurring-cash-transactions/:id",
    );
    expect(sanitized?.request?.env?.REMOTE_ADDR).toBe("[Filtered]");
    expect(sanitized?.contexts?.transport).not.toHaveProperty("headers.x-forwarded-for");
  });
});
