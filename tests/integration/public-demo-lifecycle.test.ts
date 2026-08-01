import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDemoLoginTicket } from "@/lib/demo/demo-crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required for public Demo integration tests");

const parsedDatabaseUrl = new URL(DATABASE_URL);
if (
  !["localhost", "127.0.0.1"].includes(parsedDatabaseUrl.hostname) ||
  !parsedDatabaseUrl.pathname.endsWith("_asset_tracker_test")
) {
  throw new Error("Integration tests require a local *_asset_tracker_test database");
}

process.env.AUTH_SECRET ??= "public-demo-integration-secret";
process.env.CRON_SECRET ??= "public-demo-integration-cron-secret";
process.env.PUBLIC_DEMO_ENABLED = "true";

const servicePool = new pg.Pool({ connectionString: DATABASE_URL, max: 12 });
const setupPool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const servicePrisma = new PrismaClient({ adapter: new PrismaPg(servicePool) });
const prisma = new PrismaClient({ adapter: new PrismaPg(setupPool) });

let ensureDemoWorkspace: typeof import("@/lib/demo/demo-service").ensureDemoWorkspace;
let authenticateDemoTicket: typeof import("@/lib/demo/demo-service").authenticateDemoTicket;
let cleanupExpiredDemoUsers: typeof import("@/lib/demo/demo-service").cleanupExpiredDemoUsers;
let deleteExpiredDemoUser: typeof import("@/lib/demo/demo-service").deleteExpiredDemoUser;

const now = new Date("2026-08-01T04:00:00.000Z");

async function installRejectAccountTrigger() {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION public_demo_reject_account_insert()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'public demo forced rollback';
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER public_demo_reject_account
    BEFORE INSERT ON "Account"
    FOR EACH ROW EXECUTE FUNCTION public_demo_reject_account_insert()
  `);
}

async function dropRejectAccountTrigger() {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS public_demo_reject_account ON "Account"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public_demo_reject_account_insert()`);
}

async function createCompactWorkspaces(options: {
  count: number;
  expiresAt: Date;
  creatorPrefix: string;
  visitorPrefix: string;
}) {
  const rows = Array.from({ length: options.count }, (_, index) => ({
    userId: randomUUID(),
    creatorHash: `${options.creatorPrefix}-${index}`,
    visitorHash: `${options.visitorPrefix}-${index}`,
    expiresAt: options.expiresAt,
  }));
  await prisma.user.createMany({
    data: rows.map(({ userId }) => ({ id: userId, name: "Demo visitor" })),
  });
  await prisma.demoWorkspace.createMany({ data: rows });
  return rows;
}

async function deleteTaskUsers() {
  await prisma.user.deleteMany({
    where: {
      OR: [{ demoWorkspace: { isNot: null } }, { name: { startsWith: "Task 4" } }],
    },
  });
}

beforeAll(async () => {
  (globalThis as { prisma?: unknown }).prisma = servicePrisma;
  ({ ensureDemoWorkspace, authenticateDemoTicket, cleanupExpiredDemoUsers, deleteExpiredDemoUser } =
    await import("@/lib/demo/demo-service"));
});

beforeEach(async () => {
  await dropRejectAccountTrigger();
  await deleteTaskUsers();
});

afterEach(async () => {
  await dropRejectAccountTrigger();
  await deleteTaskUsers();
});

afterAll(async () => {
  await dropRejectAccountTrigger();
  await deleteTaskUsers();
  await servicePrisma.$disconnect();
  await prisma.$disconnect();
  await servicePool.end();
  await setupPool.end();
  delete (globalThis as { prisma?: unknown }).prisma;
});

describe("public Demo lifecycle", () => {
  it("gives two visitors different users and data ownership", async () => {
    const first = await ensureDemoWorkspace({
      visitorToken: "visitor-a",
      clientIp: "198.51.100.10",
      locale: "en-US",
      now,
    });
    const second = await ensureDemoWorkspace({
      visitorToken: "visitor-b",
      clientIp: "198.51.100.10",
      locale: "en-US",
      now,
    });

    expect(first.userId).not.toBe(second.userId);
    expect(await prisma.account.count({ where: { userId: first.userId } })).toBeGreaterThan(0);
    const secondAccountIds = (
      await prisma.account.findMany({
        where: { userId: second.userId },
        select: { id: true },
      })
    ).map((account) => account.id);
    expect(
      await prisma.account.count({
        where: { userId: first.userId, id: { in: secondAccountIds } },
      }),
    ).toBe(0);
  });

  it("deduplicates concurrent starts for one visitor", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        ensureDemoWorkspace({
          visitorToken: "one-token",
          clientIp: "198.51.100.20",
          locale: "zh-TW",
          now,
        }),
      ),
    );

    expect(new Set(results.map((result) => result.userId)).size).toBe(1);
    expect(await prisma.demoWorkspace.count()).toBe(1);
  });

  it("rolls back the user and every child row when fixture persistence fails", async () => {
    await installRejectAccountTrigger();
    await expect(
      ensureDemoWorkspace({
        visitorToken: "rollback-token",
        clientIp: "198.51.100.30",
        locale: "en-US",
        now,
      }),
    ).rejects.toMatchObject({ code: "DEMO_INITIALIZATION_FAILED" });

    expect(await prisma.demoWorkspace.count()).toBe(0);
    expect(await prisma.user.count({ where: { name: "Demo visitor" } })).toBe(0);
  });

  it("allows exactly five active workspaces per creator", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        ensureDemoWorkspace({
          visitorToken: `source-visitor-${index}`,
          clientIp: "198.51.100.40",
          locale: "en-US",
          now,
        }),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { code: "DEMO_SOURCE_LIMIT", status: 429 },
    });
    expect(await prisma.demoWorkspace.count()).toBe(5);
  });

  it("enforces the global capacity of 250 workspaces", async () => {
    await createCompactWorkspaces({
      count: 249,
      expiresAt: new Date(now.getTime() + 60_000),
      creatorPrefix: "capacity-creator",
      visitorPrefix: "capacity-visitor",
    });

    const results = await Promise.allSettled([
      ensureDemoWorkspace({
        visitorToken: "capacity-racer-a",
        clientIp: "198.51.100.50",
        locale: "en-US",
        now,
      }),
      ensureDemoWorkspace({
        visitorToken: "capacity-racer-b",
        clientIp: "198.51.100.51",
        locale: "en-US",
        now,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { code: "DEMO_AT_CAPACITY", status: 503 },
    });
    expect(await prisma.demoWorkspace.count()).toBe(250);
  });

  it("resumes a visitor without changing expiry while at capacity", async () => {
    const first = await ensureDemoWorkspace({
      visitorToken: "capacity-resume",
      clientIp: "198.51.100.60",
      locale: "en-US",
      now,
    });
    await createCompactWorkspaces({
      count: 249,
      expiresAt: new Date(now.getTime() + 60_000),
      creatorPrefix: "resume-creator",
      visitorPrefix: "resume-visitor",
    });

    const resumed = await ensureDemoWorkspace({
      visitorToken: "capacity-resume",
      clientIp: "198.51.100.60",
      locale: "zh-TW",
      now: new Date(now.getTime() + 30_000),
    });

    expect(resumed).toMatchObject({ userId: first.userId, resumed: true });
    expect(resumed.expiresAt).toEqual(first.expiresAt);
    expect(await prisma.demoWorkspace.count()).toBe(250);
  });

  it("deletes expired workspaces in bounded batches of 25", async () => {
    await createCompactWorkspaces({
      count: 60,
      expiresAt: now,
      creatorPrefix: "expired-creator",
      visitorPrefix: "expired-visitor",
    });
    const [active] = await createCompactWorkspaces({
      count: 1,
      expiresAt: new Date(now.getTime() + 1),
      creatorPrefix: "active-creator",
      visitorPrefix: "active-visitor",
    });

    expect(
      await cleanupExpiredDemoUsers({ now, batchSize: 25, maxUsers: 50, budgetMs: 0 }),
    ).toEqual({ deleted: 0, budgetExhausted: true });
    expect(await prisma.demoWorkspace.count({ where: { expiresAt: { lte: now } } })).toBe(60);

    const first = await cleanupExpiredDemoUsers({
      now,
      batchSize: 25,
      maxUsers: 50,
      budgetMs: 30_000,
    });

    expect(first).toEqual({ deleted: 50, budgetExhausted: false });
    expect(await prisma.demoWorkspace.count({ where: { expiresAt: { lte: now } } })).toBe(10);
    expect(await prisma.user.findUnique({ where: { id: active.userId } })).not.toBeNull();

    expect(
      await cleanupExpiredDemoUsers({ now, batchSize: 25, maxUsers: 50, budgetMs: 30_000 }),
    ).toEqual({ deleted: 10, budgetExhausted: false });
  });

  it("cascade deletes every user-owned model for an expired Demo user", async () => {
    const workspace = await ensureDemoWorkspace({
      visitorToken: "cascade-visitor",
      clientIp: "198.51.100.70",
      locale: "en-US",
      now,
    });
    await prisma.authAccount.create({
      data: {
        userId: workspace.userId,
        type: "oauth",
        provider: "task4",
        providerAccountId: randomUUID(),
      },
    });
    await prisma.session.create({
      data: {
        userId: workspace.userId,
        sessionToken: randomUUID(),
        expires: new Date(now.getTime() + 60_000),
      },
    });
    await prisma.calendarEntry.create({
      data: {
        userId: workspace.userId,
        title: "Task 4 cascade relation",
        eventDate: now,
        category: "REMINDER",
      },
    });
    const accounts = await prisma.account.findMany({
      where: { userId: workspace.userId },
      select: { id: true },
    });
    const accountIds = accounts.map(({ id }) => id);
    const holdings = await prisma.holding.findMany({
      where: { accountId: { in: accountIds } },
      select: { id: true },
    });
    const holdingIds = holdings.map(({ id }) => id);

    const ownedCountsBefore = await Promise.all([
      prisma.setting.count({ where: { userId: workspace.userId } }),
      prisma.account.count({ where: { userId: workspace.userId } }),
      prisma.holding.count({ where: { accountId: { in: accountIds } } }),
      prisma.holdingTransaction.count({ where: { holdingId: { in: holdingIds } } }),
      prisma.cashTransaction.count({ where: { accountId: { in: accountIds } } }),
      prisma.recurringCashTransaction.count({ where: { accountId: { in: accountIds } } }),
      prisma.recurringInvestment.count({ where: { accountId: { in: accountIds } } }),
      prisma.netWorthSnapshot.count({ where: { userId: workspace.userId } }),
      prisma.goal.count({ where: { userId: workspace.userId } }),
      prisma.stockWatchItem.count({ where: { userId: workspace.userId } }),
      prisma.calendarEntry.count({ where: { userId: workspace.userId } }),
      prisma.authAccount.count({ where: { userId: workspace.userId } }),
      prisma.session.count({ where: { userId: workspace.userId } }),
      prisma.demoWorkspace.count({ where: { userId: workspace.userId } }),
    ]);
    expect(ownedCountsBefore.every((count) => count > 0)).toBe(true);

    await prisma.demoWorkspace.update({
      where: { userId: workspace.userId },
      data: { expiresAt: now },
    });
    expect(await deleteExpiredDemoUser(workspace.userId, now)).toMatchObject({ deleted: 1 });

    const ownedCountsAfter = await Promise.all([
      prisma.setting.count({ where: { userId: workspace.userId } }),
      prisma.account.count({ where: { userId: workspace.userId } }),
      prisma.holding.count({ where: { accountId: { in: accountIds } } }),
      prisma.holdingTransaction.count({ where: { holdingId: { in: holdingIds } } }),
      prisma.cashTransaction.count({ where: { accountId: { in: accountIds } } }),
      prisma.recurringCashTransaction.count({ where: { accountId: { in: accountIds } } }),
      prisma.recurringInvestment.count({ where: { accountId: { in: accountIds } } }),
      prisma.netWorthSnapshot.count({ where: { userId: workspace.userId } }),
      prisma.goal.count({ where: { userId: workspace.userId } }),
      prisma.stockWatchItem.count({ where: { userId: workspace.userId } }),
      prisma.calendarEntry.count({ where: { userId: workspace.userId } }),
      prisma.authAccount.count({ where: { userId: workspace.userId } }),
      prisma.session.count({ where: { userId: workspace.userId } }),
      prisma.demoWorkspace.count({ where: { userId: workspace.userId } }),
      prisma.user.count({ where: { id: workspace.userId } }),
    ]);
    expect(ownedCountsAfter).toEqual(Array.from({ length: 15 }, () => 0));
  });

  it("authenticates only a current ticket bound to the authoritative workspace", async () => {
    const workspace = await ensureDemoWorkspace({
      visitorToken: "ticket-visitor",
      clientIp: "198.51.100.80",
      locale: "en-US",
      now,
    });
    const ticket = createDemoLoginTicket(
      {
        version: 1,
        userId: workspace.userId,
        visitorHash: workspace.visitorHash,
        expiresAt: now.getTime(),
      },
      process.env.AUTH_SECRET!,
      now,
    );

    expect(await authenticateDemoTicket({ ticket, visitorToken: "wrong", now })).toBeNull();
    expect(
      await authenticateDemoTicket({ ticket, visitorToken: "ticket-visitor", now }),
    ).toMatchObject({
      id: workspace.userId,
      name: "Demo visitor",
      isDemo: true,
      demoExpiresAt: workspace.expiresAt.toISOString(),
    });

    await prisma.demoWorkspace.update({
      where: { userId: workspace.userId },
      data: { expiresAt: now },
    });
    expect(
      await authenticateDemoTicket({ ticket, visitorToken: "ticket-visitor", now }),
    ).toBeNull();
  });

  it("never deletes an active Demo user or a formal user", async () => {
    const active = await ensureDemoWorkspace({
      visitorToken: "active-delete-visitor",
      clientIp: "198.51.100.90",
      locale: "en-US",
      now,
    });
    const formal = await prisma.user.create({ data: { name: "Task 4 formal user" } });

    expect(await deleteExpiredDemoUser(active.userId, now)).toMatchObject({ deleted: 0 });
    expect(await deleteExpiredDemoUser(formal.id, now)).toMatchObject({ deleted: 0 });
    expect(await prisma.user.count({ where: { id: { in: [active.userId, formal.id] } } })).toBe(2);
  });
});
