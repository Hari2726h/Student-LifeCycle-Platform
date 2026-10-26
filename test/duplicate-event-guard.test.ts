import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { appendEvent, isRealStatusChange } from "@/lib/events";

describe("isRealStatusChange", () => {
  it("is false when nothing actually changed", () => {
    expect(isRealStatusChange("INTERVIEWED", "INTERVIEWED")).toBe(false);
  });

  it("is true for a genuine transition", () => {
    expect(isRealStatusChange("INTERVIEW_SCHEDULED", "INTERVIEWED")).toBe(true);
  });
});

// Reproduces the exact bug this guards against: app/staff/applicants/[id]/actions.ts's
// submitScore transitions an applicant to INTERVIEWED and logs it as an event —
// but multiple panelists each submit their own scorecard for the same
// interview, and only the *first* one is a real transition. Without the
// isRealStatusChange guard, every panelist's submission (and any panelist
// re-editing their own score) would append another identical event.
describe("duplicate-event guard on a repeatable action (multi-panelist scoring)", () => {
  let applicantId: string | undefined;
  let userId: string | undefined;

  afterEach(async () => {
    if (applicantId) await prisma.event.deleteMany({ where: { aggregateId: applicantId } });
    if (applicantId) await prisma.applicant.delete({ where: { id: applicantId } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    applicantId = undefined;
    userId = undefined;
  });

  it("appends exactly one APPLICANT_STATUS_CHANGED event no matter how many panelists score", async () => {
    const suffix = crypto.randomUUID();
    const user = await prisma.user.create({
      data: { name: `Test Applicant ${suffix}`, email: `test-dup-${suffix}@example.test`, role: "APPLICANT" },
    });
    userId = user.id;
    const applicant = await prisma.applicant.create({
      data: {
        userId: user.id,
        fullName: user.name,
        dob: new Date("2007-01-01"),
        gender: "MALE",
        phone: `9${suffix.replace(/\D/g, "").slice(0, 9).padEnd(9, "0")}`,
        district: "Chennai",
        status: "INTERVIEW_SCHEDULED",
      },
    });
    applicantId = applicant.id;

    // Simulates the exact pattern submitScore now uses: read status once,
    // then inside a transaction, update + conditionally append. Run it
    // three times in a row (three panelists) exactly as the real action
    // would — the second and third runs read the ALREADY-updated status.
    async function scorePanelist() {
      const before = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
      await prisma.$transaction(async (tx) => {
        await tx.applicant.update({ where: { id: applicant.id }, data: { status: "INTERVIEWED" } });
        if (isRealStatusChange(before.status, "INTERVIEWED")) {
          await appendEvent(tx, {
            aggregateType: "Applicant",
            aggregateId: applicant.id,
            type: "APPLICANT_STATUS_CHANGED",
            payload: { fromStatus: before.status, toStatus: "INTERVIEWED", action: "SCORE_SUBMITTED" },
          });
        }
      });
    }

    await scorePanelist(); // first panelist — real transition
    await scorePanelist(); // second panelist — no-op status-wise
    await scorePanelist(); // first panelist updates their own score — still no-op

    const events = await prisma.event.findMany({ where: { aggregateId: applicant.id, type: "APPLICANT_STATUS_CHANGED" } });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ fromStatus: "INTERVIEW_SCHEDULED", toStatus: "INTERVIEWED" });
  });
});
