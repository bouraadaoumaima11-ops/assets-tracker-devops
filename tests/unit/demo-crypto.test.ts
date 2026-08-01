import { describe, expect, it } from "vitest";
import {
  createDemoLoginTicket,
  hashDemoCreator,
  hashDemoVisitor,
  demoHashesMatch,
  verifyDemoLoginTicket,
} from "@/lib/demo/demo-crypto";

const secret = "unit-test-secret";
const now = new Date("2026-08-01T00:00:00.000Z");

describe("public Demo crypto", () => {
  it("uses different purpose keys for visitor tokens and source IPs", () => {
    expect(hashDemoVisitor("same-input", secret)).not.toBe(hashDemoCreator("same-input", secret));
  });

  it("compares fixed digests without accepting length or value mismatches", () => {
    const hash = hashDemoVisitor("visitor", secret);
    expect(demoHashesMatch(hash, hash)).toBe(true);
    expect(demoHashesMatch(hash, `${hash}x`)).toBe(false);
    expect(demoHashesMatch(hash, hashDemoVisitor("different", secret))).toBe(false);
  });

  it("round-trips an unexpired signed ticket", () => {
    const payload = {
      version: 1 as const,
      userId: "demo-user",
      visitorHash: "visitor-hash",
      expiresAt: now.getTime() + 60_000,
    };
    const ticket = createDemoLoginTicket(payload, secret);
    expect(verifyDemoLoginTicket(ticket, secret, now)).toEqual(payload);
  });

  it("rejects tampering and the exact expiry boundary", () => {
    const expiresAt = now.getTime() + 60_000;
    const ticket = createDemoLoginTicket(
      { version: 1, userId: "demo-user", visitorHash: "visitor-hash", expiresAt },
      secret,
    );
    expect(verifyDemoLoginTicket(`${ticket}x`, secret, now)).toBeNull();
    expect(verifyDemoLoginTicket(`${ticket}!`, secret, now)).toBeNull();
    expect(verifyDemoLoginTicket(ticket, secret, new Date(expiresAt))).toBeNull();
  });

  it("rejects a non-canonical base64url signature encoding", () => {
    const ticket = createDemoLoginTicket(
      {
        version: 1,
        userId: "demo-user",
        visitorHash: "visitor-hash",
        expiresAt: now.getTime() + 60_000,
      },
      secret,
    );
    const [body, signature] = ticket.split(".");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const lastCharacter = signature.at(-1)!;
    const nonCanonicalLastCharacter = alphabet[alphabet.indexOf(lastCharacter) ^ 1];

    expect(
      verifyDemoLoginTicket(
        `${body}.${signature.slice(0, -1)}${nonCanonicalLastCharacter}`,
        secret,
        now,
      ),
    ).toBeNull();
  });
});
