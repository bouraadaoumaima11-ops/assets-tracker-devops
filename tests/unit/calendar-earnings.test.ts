import { describe, expect, it } from "vitest";
import {
  deriveSessionFromCallTime,
  mapEarningsCallToTaiwanDay,
  mapEarningsTimestampToTaiwanDay,
} from "@/lib/calendar-earnings";

describe("deriveSessionFromCallTime", () => {
  it("returns BMO for a call before 12:00 ET", () => {
    // 08:00 ET (EDT)
    expect(deriveSessionFromCallTime(new Date("2026-08-20T12:00:00.000Z"))).toBe("BMO");
  });

  it("returns AMC for a call at or after 12:00 ET", () => {
    // 16:00 ET (EDT)
    expect(deriveSessionFromCallTime(new Date("2026-08-20T20:00:00.000Z"))).toBe("AMC");
    // exactly 12:00 ET (EDT)
    expect(deriveSessionFromCallTime(new Date("2026-08-20T16:00:00.000Z"))).toBe("AMC");
  });
});

describe("mapEarningsCallToTaiwanDay", () => {
  it("maps a BMO call to the same Taiwan day", () => {
    // Thu 2026-08-20 08:00 ET = 20:00 Taipei same day
    const call = new Date("2026-08-20T12:00:00.000Z"); // 08:00 ET (EDT)
    const { date, session } = mapEarningsCallToTaiwanDay(call);
    expect(session).toBe("BMO");
    expect(date).toBe("2026-08-20");
  });

  it("maps an AMC call to the next Taiwan day", () => {
    // Thu 2026-08-20 16:00 ET = Fri 2026-08-21 04:00 Taipei
    const call = new Date("2026-08-20T20:00:00.000Z"); // 16:00 ET (EDT)
    const { date, session } = mapEarningsCallToTaiwanDay(call);
    expect(session).toBe("AMC");
    expect(date).toBe("2026-08-21");
  });

  it("crosses the year boundary", () => {
    // Tue 2026-12-29 16:00 ET = Wed 2026-12-30 05:00 Taipei
    const call = new Date("2026-12-29T21:00:00.000Z");
    const { date, session } = mapEarningsCallToTaiwanDay(call);
    expect(session).toBe("AMC");
    expect(date).toBe("2026-12-30");
  });
});

describe("mapEarningsTimestampToTaiwanDay", () => {
  it("maps a date-only timestamp (no call time) conservatively to same Taiwan day", () => {
    const ts = new Date("2026-08-20T00:00:00.000Z");
    const { date, session } = mapEarningsTimestampToTaiwanDay(ts);
    expect(session).toBe("UNKNOWN");
    expect(date).toBe("2026-08-20");
  });
});
