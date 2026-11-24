/**
 * Bulk demo-data top-up — run on top of `prisma/seed.ts`, never instead of
 * it. Adds volume everywhere the base seed leaves a table thin or empty
 * (the whole volunteer-operations domain had zero rows), so a demo click
 * into any screen finds a believable amount of real-looking data instead
 * of one or two rows. Purely additive: every id here is freshly generated,
 * nothing here touches or depends on exact rows from the base seed beyond
 * "at least one college / cycle / committee member exists."
 *
 * Evidence photos and receipts are real uploads to the local S3-mock
 * bucket (not fake storage keys), so clicking "view evidence" during a
 * demo actually opens an image instead of 404ing.
 *
 * Usage: npm run db:seed   (already does this)  ->  then:
 *   npx tsx prisma/seed-more.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient, Role, Gender, FamilySituation, VerificationDecision } from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { DISTRICTS, COURSES } from "../lib/constants";
import { addCareerEvent } from "../lib/alumni-career";
import { courseToSpecialty } from "../lib/specialty";
import { putObjectDirect, putActivityMediaDirect } from "../lib/storage";

const prisma = new PrismaClient();
const DEV_PASSWORD = "Passw0rd!";

// ── name pools (kept local so this never depends on prisma/seed.ts internals) ──
const FEMALE_NAMES = [
  "Priya", "Kavya", "Divya", "Meena", "Lakshmi", "Deepika", "Swetha", "Anitha",
  "Revathi", "Nithya", "Pavithra", "Bhavani", "Keerthana", "Abirami", "Sandhya",
  "Gayathri", "Madhumitha", "Shobana", "Vaishnavi", "Yamuna", "Preethi", "Dhanya",
];
const MALE_NAMES = [
  "Arun", "Karthik", "Vignesh", "Dinesh", "Suresh", "Prabhu", "Manoj", "Saravanan",
  "Vimal", "Gokul", "Bala", "Rajesh", "Naveen", "Senthil", "Mugundhan", "Arjun",
  "Hariharan", "Elango", "Siva", "Prasanna", "Ramesh", "Kannan",
];
const LAST_NAMES = [
  "Kumar", "Raj", "Murugan", "Pandian", "Subramaniam", "Krishnan", "Ganesan",
  "Velu", "Shankar", "Chandran", "Moorthy", "Natarajan", "Rajendran",
];

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pick<T>(arr: readonly T[], n: number): T[] {
  return faker.helpers.arrayElements(arr, n);
}
function phone10() {
  return `9${faker.phone.number({ style: "national" }).replace(/\D/g, "").slice(-9)}`;
}
function fullName(gender: "M" | "F") {
  const first = gender === "F" ? randomFrom(FEMALE_NAMES) : randomFrom(MALE_NAMES);
  return `${first} ${randomFrom(LAST_NAMES)}`;
}
async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}
let emailSeq = 1000; // well past the base seed's applicant1..20 / volunteer1-2 range
function nextEmail(prefix: string) {
  emailSeq += 1;
  return `${prefix}${emailSeq}@example.com`;
}

// ── real uploaded evidence, so demo clicks don't 404 ────────────────────────
const ASSET_DIR = path.join(__dirname, "..", "seed-assets");
function loadAsset(name: string): File {
  const buf = readFileSync(path.join(ASSET_DIR, name));
  return new File([buf], name, { type: "image/jpeg" });
}

// Seven real company clusters, written with the exact spelling/casing/legal-
// suffix variety that lib/company-normalize.ts is built to merge — so the
// alumni career graph visibly clusters them instead of this being a claim
// nobody can see.
const COMPANY_CLUSTERS: { names: string[]; roles: string[] }[] = [
  { names: ["Zoho", "Zoho Corp", "ZOHO Corporation", "Zoho Corporation Pvt Ltd"], roles: ["Software Engineer", "QA Engineer", "Product Analyst"] },
  { names: ["TCS", "Tata Consultancy Services", "T.C.S"], roles: ["Systems Engineer", "Associate Consultant"] },
  { names: ["Infosys", "Infosys Ltd", "Infosys Limited", "Infy"], roles: ["Systems Engineer", "Technology Analyst"] },
  { names: ["HCL", "HCLTech", "HCL Technologies"], roles: ["Software Engineer", "Technical Lead"] },
  { names: ["Cognizant", "Cognizant Technology Solutions"], roles: ["Programmer Analyst", "Associate"] },
  { names: ["Freshworks", "Freshworks Inc"], roles: ["Software Engineer", "Customer Success Associate"] },
  { names: ["Wipro", "Wipro Limited"], roles: ["Project Engineer", "Senior Software Engineer"] },
];

async function main() {
  console.log("Topping up demo data (prisma/seed-more.ts)...\n");

  const [colleges, catalog, cycle, committee, existingMentors] = await Promise.all([
    prisma.college.findMany(),
    prisma.courseCatalog.findMany(),
    prisma.admissionCycle.findFirst({ orderBy: { year: "desc" } }),
    prisma.user.findFirst({ where: { role: Role.COMMITTEE } }),
    prisma.mentor.findMany({ where: { type: "STAFF" } }),
  ]);
  if (!cycle || !committee || colleges.length === 0 || existingMentors.length === 0) {
    throw new Error("Run `npm run db:seed` first — base reference data is missing.");
  }

  // ── more volunteers, with full self-service profiles ──────────────────────
  const SKILLS = ["Counselling", "Tutoring", "Photography", "First aid", "Public speaking", "Event coordination", "Data entry", "Translation (Tamil/English)"];
  const INTERESTS = ["Education", "Child welfare", "Women empowerment", "Rural outreach", "Sports", "Arts & crafts"];
  const newVolunteers: { id: string; name: string; district: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const gender = Math.random() > 0.5 ? "F" : "M";
    const name = fullName(gender);
    const district = randomFrom(DISTRICTS);
    const user = await prisma.user.create({
      data: {
        name, email: nextEmail("volunteer"), phone: phone10(), role: Role.VOLUNTEER,
        district, pincodes: [faker.location.zipCode("######"), faker.location.zipCode("######")],
        passwordHash: await hash(DEV_PASSWORD),
      },
    });
    await prisma.volunteerProfile.create({
      data: {
        userId: user.id,
        address: faker.location.streetAddress(),
        skills: pick(SKILLS, faker.number.int({ min: 2, max: 4 })),
        interests: pick(INTERESTS, faker.number.int({ min: 1, max: 3 })),
        availability: randomFrom(["Weekends", "Weekday evenings", "Flexible", "Weekday mornings"]),
      },
    });
    newVolunteers.push({ id: user.id, name, district });
  }
  console.log(`✔ ${newVolunteers.length} volunteers added (with profiles)`);

  // ── a much bigger applicant pipeline, every status represented ────────────
  const STATUS_WEIGHTS: [string, number][] = [
    ["SUBMITTED", 28], ["UNDER_VERIFICATION", 22], ["VERIFIED", 16],
    ["INTERVIEW_SCHEDULED", 14], ["INTERVIEWED", 10], ["SHORTLISTED", 8],
    ["REJECTED", 14], ["WAITLISTED", 8], ["WITHDRAWN", 6],
  ];
  function weightedStatus() {
    const total = STATUS_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [status, w] of STATUS_WEIGHTS) { if ((r -= w) <= 0) return status; }
    return STATUS_WEIGHTS[0][0];
  }

  const allVolunteersForAssignment = newVolunteers; // existing 2 stay untouched by this script
  const applicants: { id: string; userId: string; status: string; district: string; courseInterest: string; preferredCollegeId: string | null }[] = [];

  const APPLICANT_COUNT = 160;
  for (let i = 0; i < APPLICANT_COUNT; i++) {
    const gender = Math.random() > 0.2 ? "F" : "M";
    const name = fullName(gender);
    const phone = phone10();
    const status = weightedStatus();

    const user = await prisma.user.create({
      data: { name, email: nextEmail("applicant"), phone, role: Role.APPLICANT, passwordHash: await hash(DEV_PASSWORD) },
    });

    const courseInterest = randomFrom(COURSES);
    const preferredCollegeId = randomFrom(colleges).id;
    const district = randomFrom(DISTRICTS);

    const applicant = await prisma.applicant.create({
      data: {
        userId: user.id, fullName: name, dob: faker.date.birthdate({ min: 17, max: 19, mode: "age" }),
        gender: gender === "F" ? Gender.FEMALE : Gender.MALE, phone, email: user.email,
        district, boardPercentage: faker.number.float({ min: 68, max: 98, fractionDigits: 1 }),
        courseInterest, preferredCollegeId, status: "SUBMITTED", cycleId: cycle.id,
        createdAt: faker.date.recent({ days: 150 }),
      },
    });

    await prisma.applicantSensitiveInfo.create({
      data: {
        applicantId: applicant.id, addressLine1: faker.location.streetAddress(), pincode: faker.location.zipCode("######"),
        guardianName: fullName(Math.random() > 0.5 ? "M" : "F"), guardianPhone: phone10(),
        annualIncomeInr: faker.number.int({ min: 35000, max: 165000 }), householdSize: faker.number.int({ min: 2, max: 7 }),
        familySituation: randomFrom([FamilySituation.ORPHAN, FamilySituation.SINGLE_PARENT, FamilySituation.SINGLE_PARENT, FamilySituation.GUARDIAN_CARE, FamilySituation.BOTH_PARENTS]),
      },
    });

    if (status !== "SUBMITTED") {
      const volunteerId = randomFrom(allVolunteersForAssignment).id;
      await prisma.applicant.update({ where: { id: applicant.id }, data: { status: status as never, volunteerId } });
      await prisma.verification.create({
        data: {
          applicantId: applicant.id, volunteerId, visitDate: faker.date.recent({ days: 90 }),
          incomeBandVerified: true, housingCondition: randomFrom(["KUTCHA", "SEMI_PUCCA", "PUCCA"]),
          householdSizeConfirmed: faker.number.int({ min: 2, max: 7 }), photoEvidenceConfirmed: true,
          decision: VerificationDecision.APPROVED,
        },
      });
    }

    if (["INTERVIEW_SCHEDULED", "INTERVIEWED", "SHORTLISTED", "REJECTED", "WAITLISTED"].includes(status)) {
      const decision = status === "REJECTED" ? "REJECTED" : status === "WAITLISTED" ? "WAITLISTED" : status === "SHORTLISTED" ? "ACCEPTED" : "PENDING";
      const record = await prisma.interviewRecord.create({
        data: {
          applicantId: applicant.id, scheduledAt: faker.date.recent({ days: 45 }), location: "Maatram Foundation Centre, Chennai",
          decision: decision as never, decidedAt: decision === "PENDING" ? null : faker.date.recent({ days: 10 }),
          decidedById: decision === "PENDING" ? null : committee.id,
        },
      });
      if (decision !== "PENDING") {
        await prisma.interviewScore.create({
          data: {
            interviewId: record.id, panelistId: committee.id,
            academicMerit: faker.number.int({ min: 4, max: 10 }), financialNeed: faker.number.int({ min: 4, max: 10 }),
            communication: faker.number.int({ min: 4, max: 10 }), intentClarity: faker.number.int({ min: 4, max: 10 }),
          },
        });
      }
    }

    applicants.push({ id: applicant.id, userId: user.id, status, district, courseInterest, preferredCollegeId });
    if ((i + 1) % 40 === 0) console.log(`  … ${i + 1}/${APPLICANT_COUNT} applicants`);
  }
  console.log(`✔ ${APPLICANT_COUNT} applicants added across every pipeline stage`);

  // ── interview slots spanning past and future, one fully booked ───────────
  for (let i = 0; i < 10; i++) {
    const daysOffset = faker.number.int({ min: -20, max: 25 });
    await prisma.interviewSlot.create({
      data: {
        scheduledAt: faker.date.soon({ days: Math.abs(daysOffset) || 1, refDate: new Date(Date.now() + daysOffset * 86400000) }),
        location: randomFrom(["Maatram Foundation Centre, Chennai", "Zonal Office, Madurai", "Zonal Office, Coimbatore"]),
        capacity: i === 0 ? 1 : faker.number.int({ min: 2, max: 5 }),
        createdById: committee.id,
      },
    });
  }
  console.log("✔ 10 interview slots added (past + upcoming)");

  // ── a much bigger student body, every status, risk flags on some ─────────
  const shortlisted = applicants.filter((a) => a.status === "SHORTLISTED");
  const STUDENT_COUNT = 45;
  const statusPlan: ("ONBOARDING" | "ACTIVE" | "PLACED" | "ALUMNI")[] = [
    ...Array(8).fill("ONBOARDING"), ...Array(14).fill("ACTIVE"), ...Array(6).fill("PLACED"), ...Array(17).fill("ALUMNI"),
  ];
  const mentors = existingMentors;

  for (let i = 0; i < STUDENT_COUNT; i++) {
    // Reuse a shortlisted applicant where we have one left, otherwise mint a
    // fresh accepted applicant — either way every student traces back to a
    // real application, matching how the real flow works.
    let base = shortlisted[i];
    if (!base) {
      const gender = Math.random() > 0.2 ? "F" : "M";
      const name = fullName(gender);
      const phone = phone10();
      const user = await prisma.user.create({ data: { name, email: nextEmail("student-src"), phone, role: Role.APPLICANT, passwordHash: await hash(DEV_PASSWORD) } });
      const courseInterest = randomFrom(COURSES);
      const preferredCollegeId = randomFrom(colleges).id;
      const applicant = await prisma.applicant.create({
        data: { userId: user.id, fullName: name, dob: faker.date.birthdate({ min: 17, max: 19, mode: "age" }), gender: gender === "F" ? Gender.FEMALE : Gender.MALE, phone, email: user.email, district: randomFrom(DISTRICTS), boardPercentage: faker.number.float({ min: 75, max: 98, fractionDigits: 1 }), courseInterest, preferredCollegeId, status: "ACCEPTED", cycleId: cycle.id },
      });
      await prisma.applicantSensitiveInfo.create({ data: { applicantId: applicant.id, addressLine1: faker.location.streetAddress(), pincode: faker.location.zipCode("######"), guardianName: fullName("F"), guardianPhone: phone10(), annualIncomeInr: faker.number.int({ min: 35000, max: 150000 }), householdSize: faker.number.int({ min: 2, max: 6 }), familySituation: FamilySituation.SINGLE_PARENT } });
      base = { id: applicant.id, userId: user.id, status: "ACCEPTED", district: applicant.district, courseInterest, preferredCollegeId };
    } else {
      await prisma.applicant.update({ where: { id: base.id }, data: { status: "ACCEPTED" } });
    }

    await prisma.user.update({ where: { id: base.userId }, data: { role: Role.STUDENT } });
    const status = statusPlan[i];
    const withRisk = status === "ACTIVE" && Math.random() < 0.3;
    const mentor = randomFrom(mentors);
    const admissionYear = status === "ALUMNI" ? faker.number.int({ min: 2019, max: 2022 }) : faker.number.int({ min: 2023, max: new Date().getFullYear() });

    const student = await prisma.student.create({
      data: {
        userId: base.userId, applicantId: base.id, collegeId: base.preferredCollegeId ?? randomFrom(colleges).id,
        program: base.courseInterest, admissionYear, status, mentorId: mentor.id,
      },
    });
    await prisma.sponsorshipCoverage.create({ data: { studentId: student.id, tuitionCovered: true, hostelCovered: Math.random() > 0.3, foodCovered: true, transportCovered: Math.random() > 0.4, materialsCovered: true } });

    await prisma.mentorLog.create({ data: { studentId: student.id, mentorId: mentor.id, category: "ACADEMIC", severity: "LOW", note: randomFrom(["Settling in well, attending classes regularly.", "Doing fine; checked in this month.", "Good progress on coursework this semester."]), isRiskFlag: false, createdAt: faker.date.recent({ days: 60 }) } });
    if (withRisk) {
      await prisma.mentorLog.create({ data: { studentId: student.id, mentorId: mentor.id, category: randomFrom(["ATTENDANCE", "FINANCIAL", "PERSONAL"]), severity: "HIGH", note: randomFrom(["Missed several weeks of classes; family reports a medical emergency.", "Family income disrupted; at risk of dropping out without support.", "Reported difficulty coping; needs counselling follow-up."]), isRiskFlag: true, createdAt: faker.date.recent({ days: 20 }) } });
    }

    if (status !== "ONBOARDING") {
      const semesters = status === "ALUMNI" || status === "PLACED" ? [1, 2, 3, 4, 5, 6] : [1, 2, 3];
      for (const semester of semesters) {
        const trend = withRisk ? faker.number.float({ min: 5.2, max: 7.0, fractionDigits: 2 }) : faker.number.float({ min: 7.0, max: 9.4, fractionDigits: 2 });
        await prisma.academicRecord.create({ data: { studentId: student.id, semester, gpa: trend, attendancePercent: withRisk ? faker.number.float({ min: 52, max: 72, fractionDigits: 1 }) : faker.number.float({ min: 82, max: 98, fractionDigits: 1 }) } });
      }
      await prisma.certification.create({ data: { studentId: student.id, courseCatalogId: randomFrom(catalog).id, name: randomFrom(["Employability Bootcamp", "Spoken English & Communication", "Tally ERP 9 Certification"]), status: status === "ALUMNI" || status === "PLACED" ? "COMPLETED" : "IN_PROGRESS", startedAt: faker.date.past({ years: 1 }), completedAt: status === "ALUMNI" || status === "PLACED" ? faker.date.recent({ days: 200 }) : null } });
    }

    if (status === "PLACED" || status === "ALUMNI") {
      const cluster = randomFrom(COMPANY_CLUSTERS);
      await prisma.placement.create({ data: { studentId: student.id, company: cluster.names[0], role: randomFrom(cluster.roles), packageInrLakhs: faker.number.float({ min: 3, max: 9, fractionDigits: 1 }), joiningDate: faker.date.recent({ days: 150 }) } });
    }

    if (status === "ALUMNI") {
      await prisma.user.update({ where: { id: base.userId }, data: { role: Role.ALUMNI } });
      const mentoringOptIn = Math.random() < 0.55;
      const alumniProfile = await prisma.alumniProfile.create({
        data: { studentId: student.id, bio: randomFrom(["Giving back by mentoring juniors through Karpom Karpippom.", "Happy to help the next batch navigate placements.", "Available for career guidance calls."]), mentoringOptIn, openToReferrals: Math.random() < 0.4, availability: mentoringOptIn ? randomFrom(["Weekends", "Weekday evenings"]) : null },
      });
      if (mentoringOptIn) {
        await prisma.mentor.create({ data: { userId: base.userId, type: "ALUMNI", specialty: courseToSpecialty(student.program), district: base.district, maxLoad: 5 } });
      }

      // A real 1-3-job career history per alumnus, inside one of the seven
      // merge-tested company clusters — each call replays through the same
      // recomputeProjection() a live addCareerEvent() would use.
      const cluster = randomFrom(COMPANY_CLUSTERS);
      const jobCount = faker.number.int({ min: 1, max: 3 });
      const now = Date.now();
      for (let j = 0; j < jobCount; j++) {
        const isLast = j === jobCount - 1;
        const start = new Date(now - (jobCount - j) * 300 * 86400000 - faker.number.int({ min: 0, max: 60 }) * 86400000);
        const end = isLast ? undefined : new Date(start.getTime() + faker.number.int({ min: 200, max: 320 }) * 86400000);
        await addCareerEvent({
          alumniProfileId: alumniProfile.id, source: j === 0 ? "PLACEMENT" : randomFrom(["SELF_REPORTED", "REFERRAL"]),
          company: cluster.names[Math.min(j, cluster.names.length - 1)], role: randomFrom(cluster.roles),
          startDate: start, endDate: end,
        });
      }

      if (Math.random() < 0.3) {
        await prisma.karpomSession.create({ data: { alumniProfileId: alumniProfile.id, juniorName: fullName("F"), juniorContact: phone10(), subject: randomFrom(["Mathematics – Class 12 board prep", "Physics – Class 11 fundamentals", "English – spoken fluency"]), sessionDate: faker.date.recent({ days: 14 }), notes: "Regular weekly session; junior is gaining confidence." } });
      }
    }

    if ((i + 1) % 15 === 0) console.log(`  … ${i + 1}/${STUDENT_COUNT} students`);
  }
  console.log(`✔ ${STUDENT_COUNT} students added across ONBOARDING → ALUMNI, with real multi-job career histories`);

  // ── volunteer operations: every one of the 10 tables gets real rows ──────
  const verificationPhoto = loadAsset("verification_photo.jpg");
  const receiptPhoto = loadAsset("receipt.jpg");
  const tutoringPhoto = loadAsset("tutoring_photo.jpg");
  const schoolVisitPhoto = loadAsset("school_visit.jpg");

  const activityPool = applicants.concat(); // applicants we can attach field-verification activities to
  const studentIds = (await prisma.student.findMany({ select: { id: true } })).map((s) => s.id);

  const ACTIVITY_TYPES = ["PHYSICAL_VERIFICATION", "CALL_VERIFICATION", "TUTORING", "SCHOOL_VISIT", "SANTA_PROGRAMME", "OTHER"] as const;
  const STATUS_BY_SLOT = ["PLANNED", "ASSIGNED", "IN_PROGRESS", "SUBMITTED", "COMPLETED", "COMPLETED", "COMPLETED"] as const;

  let activityCount = 0;
  const TOTAL_ACTIVITIES = 95;
  for (let i = 0; i < TOTAL_ACTIVITIES; i++) {
    const type = ACTIVITY_TYPES[i % ACTIVITY_TYPES.length];
    const status = randomFrom(STATUS_BY_SLOT);
    const createdBy = committee; // staff account in base seed is the natural "createdBy"; committee also valid actor
    const volunteer = randomFrom(allVolunteersForAssignment);
    const startsAt = faker.date.recent({ days: 60 });
    const linkedApplicant = ["PHYSICAL_VERIFICATION", "CALL_VERIFICATION"].includes(type) && activityPool.length ? randomFrom(activityPool) : null;
    const linkedStudentId = type === "TUTORING" && studentIds.length ? randomFrom(studentIds) : null;

    const activity = await prisma.volunteerActivity.create({
      data: {
        idempotencyKey: randomUUID(),
        type,
        name: {
          PHYSICAL_VERIFICATION: "Home visit — field verification",
          CALL_VERIFICATION: "Follow-up call verification",
          TUTORING: "Weekly tutoring session",
          SCHOOL_VISIT: `School outreach — ${randomFrom(["Govt Higher Secondary School", "Panchayat Union Middle School", "Corporation Girls School"])}`,
          SANTA_PROGRAMME: "Santa programme — gift distribution drive",
          OTHER: "Community awareness session",
        }[type],
        description: {
          PHYSICAL_VERIFICATION: "Confirm household details and income band in person.",
          CALL_VERIFICATION: "Phone check-in to confirm identity and admission interest.",
          TUTORING: "Board-exam prep tutoring for a sponsored student.",
          SCHOOL_VISIT: "Meet interested students and record their details for next year's cycle.",
          SANTA_PROGRAMME: "Gift distribution and engagement activities for sponsored children.",
          OTHER: "General volunteer outreach activity.",
        }[type],
        subject: type === "TUTORING" ? randomFrom(["Mathematics", "Physics", "English", "Chemistry"]) : null,
        learningLevel: type === "TUTORING" ? randomFrom(["Class 11", "Class 12"]) : null,
        location: type === "SCHOOL_VISIT" || type === "SANTA_PROGRAMME" ? randomFrom(DISTRICTS) + " district" : null,
        startsAt,
        reportingAt: type === "SANTA_PROGRAMME" ? startsAt : null,
        dueAt: new Date(startsAt.getTime() + 7 * 86400000),
        schoolName: type === "SCHOOL_VISIT" ? randomFrom(["Govt Higher Secondary School, Villupuram", "Corporation Girls School, Madurai", "Panchayat Union Middle School, Erode"]) : null,
        schoolAddress: type === "SCHOOL_VISIT" ? faker.location.streetAddress() : null,
        schoolDistrict: type === "SCHOOL_VISIT" ? randomFrom(DISTRICTS) : null,
        schoolContactPerson: type === "SCHOOL_VISIT" ? fullName("M") : null,
        schoolContactNumber: type === "SCHOOL_VISIT" ? phone10() : null,
        priority: randomFrom(["LOW", "NORMAL", "NORMAL", "HIGH"]),
        status,
        applicantId: linkedApplicant?.id ?? null,
        studentId: linkedStudentId,
        createdById: createdBy.id,
        createdAt: startsAt,
      },
    });

    const assignment = await prisma.activityAssignment.create({
      data: {
        activityId: activity.id, volunteerId: volunteer.id,
        responsibility: "Lead volunteer",
        status,
        assignedAt: startsAt,
        startedAt: ["IN_PROGRESS", "SUBMITTED", "COMPLETED"].includes(status) ? startsAt : null,
        completedAt: status === "COMPLETED" ? new Date(startsAt.getTime() + 86400000) : null,
      },
    });

    const isDone = ["SUBMITTED", "COMPLETED"].includes(status);

    if (isDone) {
      const report = await prisma.activityReport.create({
        data: {
          activityId: activity.id, assignmentId: assignment.id, volunteerId: volunteer.id,
          payload: { summary: "Activity completed as planned.", location: activity.location ?? "Field" },
          hours: faker.number.float({ min: 1, max: 4, fractionDigits: 1 }),
          reviewStatus: randomFrom(["PENDING", "APPROVED", "APPROVED", "FOLLOW_UP"]),
          idempotencyKey: randomUUID(),
          createdAt: new Date(startsAt.getTime() + 86400000),
        },
      });

      if (Math.random() < 0.7) {
        const photo = type === "SANTA_PROGRAMME" ? verificationPhoto
          : type === "TUTORING" ? tutoringPhoto
          : type === "SCHOOL_VISIT" ? schoolVisitPhoto
          : verificationPhoto;
        const saved = type === "SANTA_PROGRAMME" ? await putActivityMediaDirect(activity.id, photo) : await putObjectDirect(activity.id, photo);
        await prisma.activityEvidence.create({ data: { reportId: report.id, storageKey: saved.storageKey, fileName: saved.fileName, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes, uploadedById: volunteer.id } });
      }

      if (type === "PHYSICAL_VERIFICATION" && linkedApplicant) {
        await prisma.physicalVerificationReport.create({
          data: {
            applicantId: linkedApplicant.id, volunteerId: volunteer.id, visitAt: startsAt,
            personMet: randomFrom(["Father", "Mother", "Guardian"]), relationshipToStudent: randomFrom(["Father", "Mother", "Guardian"]),
            visitLocation: linkedApplicant.district, identityVerified: true, addressVerified: true, incomeVerified: true, housingVerified: true,
            householdConfirmed: true, photoEvidenceCollected: true, duplicateCheckPassed: true,
            housingCondition: randomFrom(["KUTCHA", "SEMI_PUCCA", "PUCCA"]), confirmedHouseholdSize: faker.number.int({ min: 2, max: 7 }),
            earningMembers: faker.number.int({ min: 1, max: 2 }), dependents: faker.number.int({ min: 1, max: 4 }),
            financialCondition: randomFrom(["Below poverty line", "Low income, irregular", "Stable but modest"]),
            guardianOccupation: randomFrom(["Daily wage labourer", "Small farmer", "Auto driver", "Domestic worker", "Tailor"]),
            observations: "Household matches the submitted application details. No discrepancies found.",
            recommendation: "Recommend proceeding to interview stage.",
            decision: VerificationDecision.APPROVED, idempotencyKey: randomUUID(),
          },
        });
      }

      if (type === "CALL_VERIFICATION" && linkedApplicant) {
        await prisma.callVerification.create({
          data: {
            applicantId: linkedApplicant.id, volunteerId: volunteer.id, activityId: activity.id,
            calledAt: startsAt, attemptNumber: 1, status: randomFrom(["CONNECTED", "VERIFICATION_COMPLETED"]),
            identityConfirmed: true, addressConfirmed: true, familyConfirmed: true, incomeConfirmed: true, educationConfirmed: true,
            admissionInterest: true, personAnswered: randomFrom(["Applicant", "Parent", "Guardian"]), comments: "Confirmed details match application; family is keen to proceed.",
            idempotencyKey: randomUUID(),
          },
        });
      }

      if (type === "TUTORING") {
        const sessionCount = faker.number.int({ min: 2, max: 5 });
        for (let s = 0; s < sessionCount; s++) {
          const sessionAt = new Date(startsAt.getTime() - s * 7 * 86400000);
          await prisma.tutoringSession.create({
            data: {
              activityId: activity.id, assignmentId: assignment.id, studentId: linkedStudentId, volunteerId: volunteer.id,
              studentName: fullName(Math.random() > 0.5 ? "F" : "M"), subject: activity.subject ?? "Mathematics", topic: randomFrom(["Algebra revision", "Trigonometry", "Mechanics basics", "Essay writing", "Grammar practice", "Organic chemistry"]),
              sessionAt, startTime: "16:00", endTime: "17:30", durationHours: 1.5, mode: randomFrom(["In-person", "Phone call"]),
              attendance: randomFrom(["Present", "Present", "Present", "Absent"]), understanding: randomFrom(["Good", "Needs more practice", "Excellent"]),
              homework: "Practice set assigned for next session.", assessmentMark: faker.number.float({ min: 55, max: 95, fractionDigits: 0 }),
              idempotencyKey: randomUUID(),
            },
          });
        }
      }

      if (type === "SCHOOL_VISIT") {
        const interestCount = faker.number.int({ min: 3, max: 7 });
        for (let s = 0; s < interestCount; s++) {
          await prisma.schoolVisitInterest.create({
            data: {
              activityId: activity.id, recordedById: volunteer.id, studentName: fullName(Math.random() > 0.4 ? "F" : "M"),
              classOrYear: randomFrom(["Class 11", "Class 12", "Final year, Diploma"]), contactNumber: phone10(), contactConsent: true,
              courseInterest: randomFrom(COURSES), higherEducationInterest: randomFrom(["Engineering", "Nursing", "Commerce", "Arts & Science"]),
              financialSupportNeeded: Math.random() < 0.8, followUpRequired: Math.random() < 0.5,
              status: randomFrom(["NEW", "CONTACTED", "APPLICATION_STARTED"]), notes: "Met during school outreach visit; family expressed strong interest.",
              idempotencyKey: randomUUID(),
            },
          });
        }
      }

      if (type === "SANTA_PROGRAMME") {
        const kidCount = faker.number.int({ min: 5, max: 9 });
        for (let s = 0; s < kidCount; s++) {
          await prisma.santaBeneficiary.create({
            data: {
              activityId: activity.id, childName: fullName(Math.random() > 0.5 ? "F" : "M"), age: faker.number.int({ min: 6, max: 14 }),
              giftCategory: randomFrom(["Books & stationery", "Clothing", "Toys", "Sports kit"]), giftAssigned: randomFrom(["School bag set", "Storybook pack", "Winter wear", "Cricket kit"]),
              distributionStatus: randomFrom(["PLANNED", "DISTRIBUTED", "DISTRIBUTED"]), receivedConfirmed: Math.random() < 0.8,
              idempotencyKey: randomUUID(),
            },
          });
        }
      }

      // occasional expense claim against this activity/assignment
      if (Math.random() < 0.35) {
        const withReceipt = Math.random() < 0.6;
        const saved = withReceipt ? await putObjectDirect(activity.id, receiptPhoto) : null;
        await prisma.activityExpense.create({
          data: {
            activityId: activity.id, assignmentId: assignment.id, volunteerId: volunteer.id,
            description: randomFrom(["Local travel (bus/auto)", "Printed materials for session", "Snacks for school visit group", "Mobile recharge for follow-up calls"]),
            category: randomFrom(["Travel", "Materials", "Communication", "Other"]),
            expenseAt: startsAt, amount: faker.number.float({ min: 50, max: 650, fractionDigits: 2 }),
            receiptKey: saved?.storageKey, receiptName: saved?.fileName,
            status: randomFrom(["PENDING", "APPROVED", "APPROVED", "REJECTED"]),
            reviewedById: Math.random() < 0.6 ? committee.id : null,
            reviewedAt: Math.random() < 0.6 ? new Date(startsAt.getTime() + 2 * 86400000) : null,
            idempotencyKey: randomUUID(),
          },
        });
      }
    }

    activityCount += 1;
    if (activityCount % 25 === 0) console.log(`  … ${activityCount}/${TOTAL_ACTIVITIES} volunteer activities`);
  }
  console.log(`✔ ${TOTAL_ACTIVITIES} volunteer activities added, spanning all 6 types with reports, evidence, verifications, tutoring history, school-visit interest lists, Santa beneficiaries and expense claims`);

  console.log("\n───────────────────────────────────────────────");
  console.log(" Top-up complete.");
  console.log("───────────────────────────────────────────────\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
