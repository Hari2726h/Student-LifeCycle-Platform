import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { addCareerEvent, findAlumniAtCompany, recomputeProjection } from "@/lib/alumni-career";
import { createAlumniFixture } from "./helpers/alumni-fixture";

let cleanupFns: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanupFns.reverse()) await cleanup();
  cleanupFns = [];
});

describe("addCareerEvent / recomputeProjection (replay-derived alumni profile)", () => {
  it("derives the current company/role entirely from replaying history", async () => {
    const { alumniProfile, cleanup } = await createAlumniFixture();
    cleanupFns.push(cleanup);

    await addCareerEvent({
      alumniProfileId: alumniProfile.id,
      source: "SELF_REPORTED",
      company: "Zoho Corporation",
      role: "Software Engineer",
      startDate: new Date("2021-01-01"),
    });

    const profile = await prisma.alumniProfile.findUniqueOrThrow({ where: { id: alumniProfile.id } });
    expect(profile.currentCompany).toBe("Zoho Corporation");
    expect(profile.currentRole).toBe("Software Engineer");
  });

  it("auto-closes the prior open-ended role when a new current role is reported", async () => {
    const { alumniProfile, cleanup } = await createAlumniFixture();
    cleanupFns.push(cleanup);

    await addCareerEvent({
      alumniProfileId: alumniProfile.id,
      source: "SELF_REPORTED",
      company: "Old Co",
      role: "Junior Engineer",
      startDate: new Date("2020-01-01"),
    });
    await addCareerEvent({
      alumniProfileId: alumniProfile.id,
      source: "REFERRAL",
      company: "New Co",
      role: "Senior Engineer",
      startDate: new Date("2022-01-01"),
    });

    const events = await prisma.careerEvent.findMany({
      where: { alumniProfileId: alumniProfile.id },
      orderBy: { startDate: "asc" },
    });
    const oldRole = events.find((e) => e.company === "Old Co");
    const newRole = events.find((e) => e.company === "New Co");

    // The old role's endDate was back-filled to the new role's startDate —
    // never left dangling open now that something supersedes it.
    expect(oldRole?.endDate?.toISOString()).toBe(new Date("2022-01-01").toISOString());
    expect(oldRole?.isCurrent).toBe(false);
    expect(newRole?.isCurrent).toBe(true);

    const profile = await prisma.alumniProfile.findUniqueOrThrow({ where: { id: alumniProfile.id } });
    expect(profile.currentCompany).toBe("New Co");
  });

  it("is a pure replay — recomputing from the same history twice gives the same answer", async () => {
    const { alumniProfile, cleanup } = await createAlumniFixture();
    cleanupFns.push(cleanup);

    await addCareerEvent({
      alumniProfileId: alumniProfile.id,
      source: "SELF_REPORTED",
      company: "Acme Technologies Private Limited",
      role: "Analyst",
      startDate: new Date("2021-06-01"),
    });

    const before = await prisma.alumniProfile.findUniqueOrThrow({ where: { id: alumniProfile.id } });

    await prisma.$transaction((tx) => recomputeProjection(tx, alumniProfile.id));

    const after = await prisma.alumniProfile.findUniqueOrThrow({ where: { id: alumniProfile.id } });
    expect(after.currentCompany).toBe(before.currentCompany);
    expect(after.currentRole).toBe(before.currentRole);
  });

  it("merges spelling variants when searching by company", async () => {
    const fixtureA = await createAlumniFixture();
    const fixtureB = await createAlumniFixture();
    cleanupFns.push(fixtureA.cleanup, fixtureB.cleanup);

    await addCareerEvent({
      alumniProfileId: fixtureA.alumniProfile.id,
      source: "SELF_REPORTED",
      company: "Zoho Corporation",
      role: "Engineer",
      startDate: new Date("2021-01-01"),
    });
    await addCareerEvent({
      alumniProfileId: fixtureB.alumniProfile.id,
      source: "PLACEMENT",
      company: "zoho pvt. ltd.",
      role: "Analyst",
      startDate: new Date("2021-02-01"),
    });

    const matches = await findAlumniAtCompany("Zoho Limited");
    const alumniIds = matches.map((m) => m.alumniProfileId);
    expect(alumniIds).toContain(fixtureA.alumniProfile.id);
    expect(alumniIds).toContain(fixtureB.alumniProfile.id);
  });

  it("appends an event to the log for every career change, in the same transaction", async () => {
    const { alumniProfile, cleanup } = await createAlumniFixture();
    cleanupFns.push(cleanup);

    await addCareerEvent({
      alumniProfileId: alumniProfile.id,
      source: "SELF_REPORTED",
      company: "Event Co",
      role: "Engineer",
      startDate: new Date("2021-01-01"),
    });

    const events = await prisma.event.findMany({
      where: { aggregateType: "AlumniProfile", aggregateId: alumniProfile.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("CAREER_EVENT_ADDED");
  });
});
