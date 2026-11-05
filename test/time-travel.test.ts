import { describe, it, expect } from "vitest";
import { reduceTimelineAt } from "@/lib/time-travel";
import type { Event } from "@prisma/client";

function makeEvent(overrides: Partial<Event>): Event {
  return {
    id: "evt",
    sequence: 1,
    aggregateType: "Applicant",
    aggregateId: "a1",
    type: "APPLICANT_STATUS_CHANGED",
    payload: {},
    occurredAt: new Date(),
    hash: "h",
    prevHash: "p",
    ...overrides,
  };
}

describe("reduceTimelineAt — malformed payload handling", () => {
  it("leaves applicantStatus as null, not the literal string 'null', when toStatus is missing", () => {
    const events = [makeEvent({ type: "APPLICANT_STATUS_CHANGED", payload: {} })];
    const state = reduceTimelineAt(events, 0);
    expect(state.applicantStatus).toBeNull();
  });

  it("leaves studentStatus as null when toStatus is missing on the first such event", () => {
    const events = [makeEvent({ type: "STUDENT_STATUS_CHANGED", payload: { toStatus: null } })];
    const state = reduceTimelineAt(events, 0);
    expect(state.studentStatus).toBeNull();
  });

  it("preserves the prior real status instead of overwriting it with null on a malformed later event", () => {
    const events = [
      makeEvent({ sequence: 1, type: "APPLICANT_STATUS_CHANGED", payload: { toStatus: "SUBMITTED" } }),
      makeEvent({ sequence: 2, type: "APPLICANT_STATUS_CHANGED", payload: {} }),
    ];
    const state = reduceTimelineAt(events, 1);
    expect(state.applicantStatus).toBe("SUBMITTED");
  });

  it("applies a well-formed status change normally", () => {
    const events = [makeEvent({ type: "APPLICANT_STATUS_CHANGED", payload: { toStatus: "VERIFIED" } })];
    const state = reduceTimelineAt(events, 0);
    expect(state.applicantStatus).toBe("VERIFIED");
  });
});
