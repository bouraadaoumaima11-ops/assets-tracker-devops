import { createHmac, timingSafeEqual } from "node:crypto";

export type DemoLoginTicketPayload = {
  version: 1;
  userId: string;
  visitorHash: string;
  expiresAt: number;
};

function purposeKey(secret: string, purpose: "visitor" | "creator" | "ticket") {
  return createHmac("sha256", secret).update(`asset-tracker/public-demo/${purpose}/v1`).digest();
}

function digest(value: string, secret: string, purpose: "visitor" | "creator") {
  return createHmac("sha256", purposeKey(secret, purpose)).update(value).digest("base64url");
}

function decodeCanonicalBase64url(value: string): Buffer | null {
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.toString("base64url") === value ? decoded : null;
  } catch {
    return null;
  }
}

export const hashDemoVisitor = (token: string, secret: string) => digest(token, secret, "visitor");

export const hashDemoCreator = (ip: string, secret: string) => digest(ip, secret, "creator");

export function demoHashesMatch(first: string, second: string): boolean {
  const firstBytes = Buffer.from(first);
  const secondBytes = Buffer.from(second);
  return firstBytes.length === secondBytes.length && timingSafeEqual(firstBytes, secondBytes);
}

export function createDemoLoginTicket(payload: DemoLoginTicketPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", purposeKey(secret, "ticket"))
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function verifyDemoLoginTicket(
  ticket: string,
  secret: string,
  now: Date,
): DemoLoginTicketPayload | null {
  const [body, suppliedSignature, trailing] = ticket.split(".");
  if (!body || !suppliedSignature || trailing !== undefined) return null;
  const base64url = /^[A-Za-z0-9_-]+$/;
  if (!base64url.test(body) || !base64url.test(suppliedSignature)) return null;
  const decodedBody = decodeCanonicalBase64url(body);
  const supplied = decodeCanonicalBase64url(suppliedSignature);
  if (!decodedBody || !supplied) return null;
  const expectedSignature = createHmac("sha256", purposeKey(secret, "ticket"))
    .update(body)
    .digest();
  if (supplied.length !== expectedSignature.length) return null;
  if (!timingSafeEqual(supplied, expectedSignature)) return null;
  try {
    const payload = JSON.parse(decodedBody.toString("utf8")) as Partial<DemoLoginTicketPayload>;
    if (
      payload.version !== 1 ||
      typeof payload.userId !== "string" ||
      typeof payload.visitorHash !== "string" ||
      typeof payload.expiresAt !== "number" ||
      now.getTime() >= payload.expiresAt
    ) {
      return null;
    }
    return payload as DemoLoginTicketPayload;
  } catch {
    return null;
  }
}
