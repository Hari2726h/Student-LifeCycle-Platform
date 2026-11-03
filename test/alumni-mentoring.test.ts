import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { setAlumniMentoringOptIn, setAlumniReferralFlag } from "@/lib/alumni-mentoring";
import { createAlumniFixture } from "./helpers/alumni-fixture";

let cleanupFns: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanupFns.reverse()) await cleanup();
  cleanupFns = [];
});

describe("setAlumniMentoringOptIn", () => {
  it("opting in provisions a real, active ALUMNI mentor row — not just a flag", async () => {
    const { alumniProfile, cleanup } = await createAlumniFixture();
    cleanupFns.push(cleanup);
    const student = await prisma.student.findUniqueOrThrow({ where: { id: alumniProfile.studentId } });

    await setAlumniMentoringOptIn(student.id, true, "Weeknights");
    cleanupFns.push(async () => {
      await prisma.mentor.deleteMany({ where: { userId: student.userId } });
    });

    const profile = await prisma.alumniProfile.findUniqueOrThrow({ where: { id: alumniProfile.id } });
    expect(profile.mentoringOptIn).toBe(true);
    expect(profile.availability).toBe("Weeknights");

    const mentor = await prisma.mentor.findUniqueOrThrow({ where: { userId: student.userId } });
    expect(mentor.type).toBe("ALUMNI");
    expect(mentor.isActive).toBe(true);
    expect(mentor.specialty).toBe("Engineering"); // from the fixture's "B.E. Computer Science" program
    expect(mentor.district).toBe("Chennai");
  });

  it("opting out deactivates the mentor row instead of deleting it, so mentee history survives", async () => {
    const { alumniProfile, cleanup } = await createAlumniFixture();
    cleanupFns.push(cleanup);
    const student = await prisma.student.findUniqueOrThrow({ where: { id: alumniProfile.studentId } });

    await setAlumniMentoringOptIn(student.id, true, null);
    cleanupFns.push(async () => {
      await prisma.mentor.deleteMany({ where: { userId: student.userId } });
    });
    const mentorId = (await prisma.mentor.findUniqueOrThrow({ where: { userId: student.userId } })).id;

    await setAlumniMentoringOptIn(student.id, false, null);

    const mentor = await prisma.mentor.findUniqueOrThrow({ where: { id: mentorId } });
    expect(mentor.isActive).toBe(false);

    const profile = await prisma.alumniProfile.findUniqueOrThrow({ where: { id: alumniProfile.id } });
    expect(profile.mentoringOptIn).toBe(false);
  });

  it("re-opting in reactivates the same mentor row rather than creating a duplicate", async () => {
    const { alumniProfile, cleanup } = await createAlumniFixture();
    cleanupFns.push(cleanup);
    const student = await prisma.student.findUniqueOrThrow({ where: { id: alumniProfile.studentId } });

    await setAlumniMentoringOptIn(student.id, true, null);
    cleanupFns.push(async () => {
      await prisma.mentor.deleteMany({ where: { userId: student.userId } });
    });
    const firstMentorId = (await prisma.mentor.findUniqueOrThrow({ where: { userId: student.userId } })).id;
    await setAlumniMentoringOptIn(student.id, false, null);
    await setAlumniMentoringOptIn(student.id, true, null);

    const mentor = await prisma.mentor.findUniqueOrThrow({ where: { userId: student.userId } });
    expect(mentor.id).toBe(firstMentorId);
    expect(mentor.isActive).toBe(true);
  });
});

describe("setAlumniReferralFlag", () => {
  it("toggles independently of the mentoring flag", async () => {
    const { alumniProfile, cleanup } = await createAlumniFixture();
    cleanupFns.push(cleanup);
    const student = await prisma.student.findUniqueOrThrow({ where: { id: alumniProfile.studentId } });

    await setAlumniReferralFlag(student.id, true);
    let profile = await prisma.alumniProfile.findUniqueOrThrow({ where: { id: alumniProfile.id } });
    expect(profile.openToReferrals).toBe(true);
    expect(profile.mentoringOptIn).toBe(false);

    await setAlumniReferralFlag(student.id, false);
    profile = await prisma.alumniProfile.findUniqueOrThrow({ where: { id: alumniProfile.id } });
    expect(profile.openToReferrals).toBe(false);
  });
});
