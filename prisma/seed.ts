/**
 * Seed script — plants a realistic, fully-linked pipeline so every
 * dashboard built from Phase 2 onward has real data to read, not an
 * empty table. Distributes applicants/students across every status
 * in the lifecycle (§3 of the plan).
 */
import { PrismaClient, Role, CollegeType, Gender, FamilySituation } from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { DISTRICTS, COURSES } from "../lib/constants";

const prisma = new PrismaClient();

const DEV_PASSWORD = "Passw0rd!";

const FEMALE_NAMES = [
  "Priya", "Kavya", "Divya", "Meena", "Lakshmi", "Deepika", "Swetha",
  "Anitha", "Revathi", "Nithya", "Pavithra", "Bhavani", "Keerthana",
  "Abirami", "Sandhya",
];

const MALE_NAMES = [
  "Arun", "Karthik", "Vignesh", "Dinesh", "Suresh", "Prabhu", "Manoj",
  "Saravanan", "Vimal", "Gokul", "Bala", "Rajesh", "Naveen", "Senthil",
];

const LAST_NAMES = [
  "Kumar", "Raj", "Murugan", "Pandian", "Subramaniam", "Krishnan",
  "Ganesan", "Velu", "Shankar", "Chandran",
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fullName(gender: "M" | "F") {
  const first = gender === "F" ? randomFrom(FEMALE_NAMES) : randomFrom(MALE_NAMES);
  return `${first} ${randomFrom(LAST_NAMES)}`;
}

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function createUser(opts: { name: string; email: string; role: Role; phone?: string; district?: string; pincodes?: string[] }) {
  return prisma.user.create({
    data: {
      name: opts.name,
      email: opts.email,
      phone: opts.phone,
      role: opts.role,
      district: opts.district,
      pincodes: opts.pincodes ?? [],
      passwordHash: await hash(DEV_PASSWORD),
    },
  });
}

async function main() {
  console.log("Seeding Maatram Student Lifecycle Platform...\n");

  // ── Reference data ────────────────────────────────────────────────
  const colleges = await Promise.all([
    prisma.college.create({ data: { name: "Chennai Autonomous University", type: CollegeType.AUTONOMOUS_UNIVERSITY, district: "Chennai" } }),
    prisma.college.create({ data: { name: "Anna University – CEG Campus", type: CollegeType.ENGINEERING, district: "Chennai" } }),
    prisma.college.create({ data: { name: "PSG College of Technology", type: CollegeType.ENGINEERING, district: "Coimbatore" } }),
    prisma.college.create({ data: { name: "Thiagarajar College of Engineering", type: CollegeType.ENGINEERING, district: "Madurai" } }),
    prisma.college.create({ data: { name: "Bishop Heber College", type: CollegeType.ARTS_SCIENCE, district: "Tiruchirappalli" } }),
    prisma.college.create({ data: { name: "Madras Medical College", type: CollegeType.MEDICAL, district: "Chennai" } }),
    prisma.college.create({ data: { name: "American College", type: CollegeType.ARTS_SCIENCE, district: "Madurai" } }),
  ]);

  const catalog = await Promise.all([
    prisma.courseCatalog.create({ data: { name: "AWS Cloud Practitioner", issuer: "Amazon Web Services", category: "Cloud" } }),
    prisma.courseCatalog.create({ data: { name: "Spoken English & Communication", issuer: "Maatram Centre of Excellence", category: "Soft Skills" } }),
    prisma.courseCatalog.create({ data: { name: "Tally ERP 9 Certification", issuer: "Tally Education", category: "Finance" } }),
    prisma.courseCatalog.create({ data: { name: "Python Programming", issuer: "NPTEL", category: "Programming" } }),
    prisma.courseCatalog.create({ data: { name: "Employability Bootcamp", issuer: "Maatram Centre of Excellence", category: "Soft Skills" } }),
  ]);

  // ── Operational accounts (one per role, demo-ready) ─────────────────
  await createUser({ name: "Lakshmi Narayanan", email: "staff@maatram.org", role: Role.STAFF });
  const committee = await createUser({ name: "Dr. Suresh Babu", email: "committee@maatram.org", role: Role.COMMITTEE });
  const volunteer1 = await createUser({
    name: "Anitha Raman",
    email: "volunteer@maatram.org",
    role: Role.VOLUNTEER,
    district: "Chennai",
    pincodes: ["600001", "600002", "600028"],
  });
  const volunteer2 = await createUser({
    name: "Bala Chandran",
    email: "volunteer2@maatram.org",
    role: Role.VOLUNTEER,
    district: "Madurai",
    pincodes: ["625001", "625002"],
  });

  const mentorUser1 = await createUser({ name: "Revathi Subramaniam", email: "mentor1@maatram.org", role: Role.MENTOR });
  const mentorUser2 = await createUser({ name: "Karthik Ganesan", email: "mentor2@maatram.org", role: Role.MENTOR });
  const mentor1 = await prisma.mentor.create({ data: { userId: mentorUser1.id, type: "STAFF", specialty: "Engineering", district: "Chennai", maxLoad: 15 } });
  const mentor2 = await prisma.mentor.create({ data: { userId: mentorUser2.id, type: "STAFF", specialty: "Arts & Science", district: "Madurai", maxLoad: 15 } });

  console.log("✔ Operational accounts created (staff, committee, volunteers, mentors)");

  // ── Pipeline stage 1: fresh applicants, no action yet ───────────────
  const stageCounts = {
    submitted: 3,
    underVerification: 2,
    verified: 2,
    interviewScheduled: 2,
    interviewedPendingDecision: 2,
    rejected: 2,
    waitlisted: 1,
    withdrawn: 1,
  };

  let seq = 0;
  async function makeApplicant(_stage: keyof typeof stageCounts | "accepted") {
    seq += 1;
    const gender = Math.random() > 0.2 ? "F" : "M"; // ~80% girls, matching Maatram's stated beneficiary mix
    const name = fullName(gender);
    const phone = faker.phone.number({ style: "national" }).replace(/\D/g, "").slice(-10);
    const email = `applicant${seq}@example.com`;

    const user = await createUser({ name, email, role: Role.APPLICANT, phone: `9${phone}` });

    const applicant = await prisma.applicant.create({
      data: {
        userId: user.id,
        fullName: name,
        dob: faker.date.birthdate({ min: 17, max: 19, mode: "age" }),
        gender: gender === "F" ? Gender.FEMALE : Gender.MALE,
        phone: `9${phone}`,
        email,
        district: randomFrom(DISTRICTS),
        boardPercentage: faker.number.float({ min: 85, max: 98, fractionDigits: 1 }),
        courseInterest: randomFrom(COURSES),
        preferredCollegeId: randomFrom(colleges).id,
        status: "SUBMITTED",
      },
    });

    await prisma.applicantSensitiveInfo.create({
      data: {
        applicantId: applicant.id,
        addressLine1: faker.location.streetAddress(),
        pincode: faker.location.zipCode("######"),
        guardianName: fullName(Math.random() > 0.5 ? "M" : "F"),
        guardianPhone: `9${faker.phone.number({ style: "national" }).replace(/\D/g, "").slice(-10)}`,
        annualIncomeInr: faker.number.int({ min: 40000, max: 150000 }),
        householdSize: faker.number.int({ min: 2, max: 6 }),
        familySituation: randomFrom([
          FamilySituation.ORPHAN,
          FamilySituation.SINGLE_PARENT,
          FamilySituation.SINGLE_PARENT,
          FamilySituation.GUARDIAN_CARE,
          FamilySituation.BOTH_PARENTS,
        ]),
      },
    });

    return applicant;
  }

  // helper to advance an applicant through verification
  async function verify(applicantId: string, decision: "APPROVED" | "NEEDS_FOLLOW_UP", volunteerId: string) {
    await prisma.verification.create({
      data: {
        applicantId,
        volunteerId,
        visitDate: faker.date.recent({ days: 20 }),
        incomeBandVerified: true,
        housingCondition: randomFrom(["KUTCHA", "SEMI_PUCCA", "PUCCA"]),
        householdSizeConfirmed: faker.number.int({ min: 2, max: 6 }),
        decision,
      },
    });
  }

  async function interview(applicantId: string, decision: "PENDING" | "ACCEPTED" | "REJECTED" | "WAITLISTED", panelists: string[]) {
    const record = await prisma.interviewRecord.create({
      data: {
        applicantId,
        scheduledAt: faker.date.recent({ days: 10 }),
        location: "Maatram Foundation Centre, Chennai",
        decision,
        decidedAt: decision === "PENDING" ? null : faker.date.recent({ days: 3 }),
        decidedById: decision === "PENDING" ? null : committee.id,
      },
    });
    for (const panelistId of panelists) {
      await prisma.interviewScore.create({
        data: {
          interviewId: record.id,
          panelistId,
          academicMerit: faker.number.int({ min: 6, max: 10 }),
          financialNeed: faker.number.int({ min: 6, max: 10 }),
          communication: faker.number.int({ min: 5, max: 10 }),
          intentClarity: faker.number.int({ min: 6, max: 10 }),
        },
      });
    }
    return record;
  }

  // Stage: SUBMITTED (nothing else happens yet)
  for (let i = 0; i < stageCounts.submitted; i++) {
    await makeApplicant("submitted");
  }

  // Stage: UNDER_VERIFICATION (volunteer queue, no decision yet)
  for (let i = 0; i < stageCounts.underVerification; i++) {
    const a = await makeApplicant("underVerification");
    await prisma.applicant.update({ where: { id: a.id }, data: { status: "UNDER_VERIFICATION", volunteerId: randomFrom([volunteer1.id, volunteer2.id]) } });
  }

  // Stage: VERIFIED (verification approved, interview not yet scheduled)
  for (let i = 0; i < stageCounts.verified; i++) {
    const a = await makeApplicant("verified");
    const volunteerId = randomFrom([volunteer1.id, volunteer2.id]);
    await prisma.applicant.update({ where: { id: a.id }, data: { status: "VERIFIED", volunteerId } });
    await verify(a.id, "APPROVED", volunteerId);
  }

  // Stage: INTERVIEW_SCHEDULED
  for (let i = 0; i < stageCounts.interviewScheduled; i++) {
    const a = await makeApplicant("interviewScheduled");
    const volunteerId = randomFrom([volunteer1.id, volunteer2.id]);
    await prisma.applicant.update({ where: { id: a.id }, data: { status: "INTERVIEW_SCHEDULED", volunteerId } });
    await verify(a.id, "APPROVED", volunteerId);
    await interview(a.id, "PENDING", []);
  }

  // Stage: INTERVIEWED, decision pending committee sign-off
  for (let i = 0; i < stageCounts.interviewedPendingDecision; i++) {
    const a = await makeApplicant("interviewedPendingDecision");
    const volunteerId = randomFrom([volunteer1.id, volunteer2.id]);
    await prisma.applicant.update({ where: { id: a.id }, data: { status: "INTERVIEWED", volunteerId } });
    await verify(a.id, "APPROVED", volunteerId);
    await interview(a.id, "PENDING", [committee.id]);
  }

  // Stage: REJECTED
  for (let i = 0; i < stageCounts.rejected; i++) {
    const a = await makeApplicant("rejected");
    const volunteerId = randomFrom([volunteer1.id, volunteer2.id]);
    await prisma.applicant.update({ where: { id: a.id }, data: { status: "REJECTED", volunteerId } });
    await verify(a.id, "APPROVED", volunteerId);
    await interview(a.id, "REJECTED", [committee.id]);
  }

  // Stage: WAITLISTED
  for (let i = 0; i < stageCounts.waitlisted; i++) {
    const a = await makeApplicant("waitlisted");
    const volunteerId = randomFrom([volunteer1.id, volunteer2.id]);
    await prisma.applicant.update({ where: { id: a.id }, data: { status: "WAITLISTED", volunteerId } });
    await verify(a.id, "APPROVED", volunteerId);
    await interview(a.id, "WAITLISTED", [committee.id]);
  }

  // Stage: WITHDRAWN
  for (let i = 0; i < stageCounts.withdrawn; i++) {
    const a = await makeApplicant("withdrawn");
    await prisma.applicant.update({ where: { id: a.id }, data: { status: "WITHDRAWN" } });
  }

  console.log("✔ Applicants seeded across SUBMITTED → WITHDRAWN/REJECTED/WAITLISTED");

  // ── Pipeline stage: ACCEPTED → Student (onboarding through alumni) ──
  type StudentPlan = {
    status: "ONBOARDING" | "ACTIVE" | "PLACED" | "ALUMNI";
    withRisk?: boolean;
  };
  const studentPlans: StudentPlan[] = [
    { status: "ONBOARDING" },
    { status: "ACTIVE" },
    { status: "ACTIVE", withRisk: true },
    { status: "ACTIVE" },
    { status: "PLACED" },
    { status: "ALUMNI" },
    { status: "ALUMNI" },
  ];

  const mentors = [mentor1, mentor2];

  for (const plan of studentPlans) {
    const a = await makeApplicant("accepted");
    const volunteerId = randomFrom([volunteer1.id, volunteer2.id]);
    await prisma.applicant.update({ where: { id: a.id }, data: { status: "ACCEPTED", volunteerId } });
    await verify(a.id, "APPROVED", volunteerId);
    await interview(a.id, "ACCEPTED", [committee.id]);

    // promote the applicant's own account to STUDENT
    await prisma.user.update({ where: { id: a.userId }, data: { role: Role.STUDENT } });

    const mentor = randomFrom(mentors);
    const student = await prisma.student.create({
      data: {
        userId: a.userId,
        applicantId: a.id,
        collegeId: a.preferredCollegeId ?? randomFrom(colleges).id,
        program: a.courseInterest ?? randomFrom(COURSES),
        admissionYear: 2023,
        status: plan.status,
        mentorId: mentor.id,
      },
    });

    await prisma.sponsorshipCoverage.create({
      data: { studentId: student.id, tuitionCovered: true, hostelCovered: true, foodCovered: true, transportCovered: true, materialsCovered: true },
    });

    // mentor check-ins
    await prisma.mentorLog.create({
      data: {
        studentId: student.id,
        mentorId: mentor.id,
        category: "ACADEMIC",
        severity: "LOW",
        note: "Settling in well; attending all classes and extra tutoring sessions.",
        isRiskFlag: false,
      },
    });

    if (plan.withRisk) {
      await prisma.mentorLog.create({
        data: {
          studentId: student.id,
          mentorId: mentor.id,
          category: "ATTENDANCE",
          severity: "HIGH",
          note: "Missed 3 consecutive weeks of classes; family reports a medical emergency at home. Needs urgent follow-up.",
          isRiskFlag: true,
        },
      });
    }

    // certifications + academics for anyone past onboarding
    if (plan.status !== "ONBOARDING") {
      await prisma.certification.create({
        data: {
          studentId: student.id,
          courseCatalogId: randomFrom(catalog).id,
          name: "Employability Bootcamp",
          status: plan.status === "ALUMNI" || plan.status === "PLACED" ? "COMPLETED" : "IN_PROGRESS",
          startedAt: faker.date.past({ years: 1 }),
          completedAt: plan.status === "ALUMNI" || plan.status === "PLACED" ? faker.date.recent({ days: 60 }) : null,
        },
      });

      await prisma.academicRecord.create({
        data: {
          studentId: student.id,
          semester: 4,
          gpa: plan.withRisk ? faker.number.float({ min: 5.5, max: 6.8, fractionDigits: 2 }) : faker.number.float({ min: 7.5, max: 9.2, fractionDigits: 2 }),
          attendancePercent: plan.withRisk ? faker.number.float({ min: 55, max: 70, fractionDigits: 1 }) : faker.number.float({ min: 85, max: 98, fractionDigits: 1 }),
        },
      });
    }

    // placement + alumni
    if (plan.status === "PLACED" || plan.status === "ALUMNI") {
      await prisma.placement.create({
        data: {
          studentId: student.id,
          company: randomFrom(["TCS", "Infosys", "Zoho", "Freshworks", "Cognizant", "HCLTech"]),
          role: "Associate Software Engineer",
          packageInrLakhs: faker.number.float({ min: 3.2, max: 6.5, fractionDigits: 1 }),
          joiningDate: faker.date.recent({ days: 90 }),
        },
      });
    }

    if (plan.status === "ALUMNI") {
      await prisma.user.update({ where: { id: a.userId }, data: { role: Role.ALUMNI } });
      const alumniProfile = await prisma.alumniProfile.create({
        data: {
          studentId: student.id,
          currentRole: "Software Engineer",
          currentCompany: "Zoho Corporation",
          bio: "Maatram alumna, now giving back by mentoring juniors through Karpom Karpippom.",
          mentoringOptIn: true,
          availability: "Weekends",
        },
      });
      await prisma.karpomSession.create({
        data: {
          alumniProfileId: alumniProfile.id,
          juniorName: fullName("F"),
          juniorContact: `9${faker.phone.number({ style: "national" }).replace(/\D/g, "").slice(-10)}`,
          subject: "Mathematics – Class 12 board exam prep",
          sessionDate: faker.date.recent({ days: 7 }),
          notes: "Covered calculus revision; junior is gaining confidence ahead of the board exam.",
        },
      });
    }
  }

  console.log("✔ Students seeded across ONBOARDING → ACTIVE (incl. one at-risk) → PLACED → ALUMNI");

  console.log("\n───────────────────────────────────────────────");
  console.log(" Seed complete. Dev login password for every account:");
  console.log(`   ${DEV_PASSWORD}`);
  console.log(" Operational accounts:");
  console.log("   staff@maatram.org        (STAFF)");
  console.log("   committee@maatram.org    (COMMITTEE)");
  console.log("   volunteer@maatram.org    (VOLUNTEER)");
  console.log("   mentor1@maatram.org      (MENTOR)");
  console.log(" Applicant/student accounts: applicant1@example.com .. applicant20@example.com");
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
