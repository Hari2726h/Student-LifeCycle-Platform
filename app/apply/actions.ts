"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requestOtp } from "@/lib/otp";
import { createPresignedUploadUrl, confirmUpload, putObjectDirect, describeUploadError } from "@/lib/storage";
import { assignVolunteer } from "@/lib/applicants";
import { appendEvent } from "@/lib/events";
import { notifyApplicant } from "@/lib/notifications";
import { getOpenCycle, isCycleOpen } from "@/lib/cycles";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";
import { ROLE_HOME } from "@/lib/roles";
import { redirectWithFieldError } from "@/lib/form-errors";
import { Role, type DocumentKind } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { hashAadhaar } from "@/lib/aadhaar";

/** app/apply/page.tsx redirects a promoted (no-longer-APPLICANT) user to
 * their actual home instead of /login — fixed because applicants never
 * get a passwordHash set, so /login is a dead end for them. This helper
 * is the same check reached directly by every wizard-step server action
 * (not just the initial page load), so it needs the identical fix: a
 * stale tab, or a promoted user re-submitting a cached form, hits this
 * before ever re-rendering the page. */
async function requireApplicant() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "APPLICANT") redirect(ROLE_HOME[session.user.role]);
  return session.user;
}

async function requireDraftApplicant(userId: string) {
  const applicant = await prisma.applicant.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (applicant && applicant.status !== "DRAFT") redirect("/applicant");
  return applicant;
}

async function requireVolunteer() {
  const session = await auth();
  if (!session?.user || session.user.role !== "VOLUNTEER") {
    redirect("/login");
  }
  return session.user;
}

export async function setLanguageAction(lang: Lang) {
  const store = await cookies();
  store.set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}

const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number");

export async function requestOtpAction(rawPhone: string) {
  const parsed = phoneSchema.safeParse(rawPhone);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid phone number" };
  }
  const result = await requestOtp(parsed.data);
  if (!result.ok) return { ok: false as const, error: result.error };
  return { ok: true as const, devCode: result.code, phone: parsed.data };
}

const personalSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name"),
  dob: z.coerce.date().refine((d) => d < new Date(), "Enter a valid date of birth"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Enter a valid 12-digit Aadhaar number").optional(),
  district: z.string().min(1, "Select a district"),
  community: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
});

export async function saveStep1(formData: FormData) {
  const user = await requireApplicant();
  const existingDraft = await requireDraftApplicant(user.id);
  const parsed = personalSchema.safeParse({
    fullName: formData.get("fullName"),
    dob: formData.get("dob"),
    gender: formData.get("gender"),
    aadhaarNumber: String(formData.get("aadhaarNumber") ?? "").trim() || undefined,
    district: formData.get("district"),
    community: formData.get("community"),
    email: formData.get("email"),
  });
  if (!parsed.success) redirectWithFieldError("/apply", parsed.error, "Invalid input", { step: "1" });

  const data = parsed.data;
  const existingIdentity = await prisma.applicant.findUnique({ where: { userId: user.id }, select: { id: true, identityInfo: { select: { id: true } } } });
  if (!data.aadhaarNumber && !existingIdentity?.identityInfo) {
    redirect("/apply?step=1&error=Enter+your+Aadhaar+number");
  }
  const aadhaarHmac = data.aadhaarNumber ? hashAadhaar(data.aadhaarNumber) : null;
  if (aadhaarHmac) {
    const duplicate = await prisma.applicantIdentity.findUnique({ where: { aadhaarHmac }, select: { applicantId: true } });
    if (duplicate && duplicate.applicantId !== existingIdentity?.id) {
      redirect("/apply?step=1&error=An+application+already+exists+with+this+Aadhaar+number.+Contact+Maatram+for+help.");
    }
  }
  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

  // The account was created at OTP time with a placeholder name
  // ("Applicant 6789") — sync it to the real name now that we have it, so
  // every later screen (mentor dashboard, staff pipeline, notifications)
  // shows the right person instead of the placeholder forever.
  if (account.name !== data.fullName) {
    await prisma.user.update({ where: { id: user.id }, data: { name: data.fullName } });
  }

  // Only a brand-new application needs an open cycle — an existing draft
  // keeps whatever cycle it was born into, even if that's since closed.
  let cycleId: string | undefined;
  if (!existingDraft) {
    const openCycle = await getOpenCycle();
    if (!openCycle) {
      redirect("/apply?step=1&error=Applications+are+closed+for+this+year.+Please+check+back+for+the+next+cycle.");
    }
    cycleId = openCycle.id;
  }

  const applicant = await prisma.applicant.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      fullName: data.fullName,
      dob: data.dob,
      gender: data.gender,
      district: data.district,
      community: data.community || null,
      phone: account.phone ?? "",
      email: data.email || null,
      cycleId,
    },
    update: {
      fullName: data.fullName,
      dob: data.dob,
      gender: data.gender,
      district: data.district,
      community: data.community || null,
      email: data.email || null,
    },
  });

  if (data.aadhaarNumber && aadhaarHmac) {
    try {
      await prisma.applicantIdentity.upsert({
        where: { applicantId: applicant.id },
        create: { applicantId: applicant.id, aadhaarHmac, aadhaarLast4: data.aadhaarNumber.slice(-4) },
        update: { aadhaarHmac, aadhaarLast4: data.aadhaarNumber.slice(-4) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        redirect("/apply?step=1&error=An+application+already+exists+with+this+Aadhaar+number.+Contact+Maatram+for+help.");
      }
      throw error;
    }
  }

  redirect("/apply?step=2");
}

const academicSchema = z.object({
  boardPercentage: z.coerce.number().min(0).max(100),
  courseInterest: z.string().min(2),
  preferredCollegeId: z.string().optional(),
});

const schoolSchema = z.object({
  school10Name: z.string().trim().min(2).max(180),
  school10Type: z.enum(["GOVERNMENT", "PRIVATE"]),
  school10Curriculum: z.enum(["STATE_BOARD", "CBSE", "OTHER"]),
  school10Year: z.coerce.number().int().min(1990).max(2100),
  school10Marks: z.coerce.number().min(0).max(1000),
  school10Address: z.string().trim().min(3).max(400),
  school11Name: z.string().trim().min(2).max(180),
  school11Type: z.enum(["GOVERNMENT", "PRIVATE"]),
  school11Medium: z.enum(["TAMIL", "ENGLISH", "OTHER"]),
  school11Curriculum: z.enum(["STATE_BOARD", "CBSE", "OTHER"]),
  school11Marks: z.coerce.number().min(0).max(1000),
  school12Name: z.string().trim().min(2).max(180),
  school12Type: z.enum(["GOVERNMENT", "PRIVATE"]),
  school12Medium: z.enum(["TAMIL", "ENGLISH", "OTHER"]),
  school12Curriculum: z.enum(["STATE_BOARD", "CBSE", "OTHER"]),
  school12Marks: z.coerce.number().min(0).max(1000),
  school12CutoffMarks: z.coerce.number().min(0).max(1000),
  school12Year: z.coerce.number().int().min(1990).max(2100),
  school12Address: z.string().trim().min(3).max(400),
  headmasterName: z.string().trim().min(2).max(120),
  headmasterPhone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
});

export async function saveStep2(formData: FormData) {
  const user = await requireApplicant();
  if (!(await requireDraftApplicant(user.id))) redirect("/apply?step=1");
  const parsed = academicSchema.extend(schoolSchema.shape).safeParse({
    boardPercentage: formData.get("boardPercentage"),
    courseInterest: formData.get("courseInterest"),
    preferredCollegeId: formData.get("preferredCollegeId") || undefined,
    ...Object.fromEntries(Object.keys(schoolSchema.shape).map((key) => [key, formData.get(key)])),
  });
  if (!parsed.success) redirectWithFieldError("/apply", parsed.error, "Invalid input", { step: "2" });

  const { boardPercentage, courseInterest, preferredCollegeId, ...academicDetails } = parsed.data;
  await prisma.applicant.update({
    where: { userId: user.id },
    data: { boardPercentage, courseInterest, preferredCollegeId, academicDetails },
  });

  redirect("/apply?step=3");
}

const familySchema = z.object({
  addressLine1: z.string().min(3),
  addressLine2: z.string().optional(),
  pincode: z.string().regex(/^\d{6}$/, "Enter a 6-digit pincode"),
  guardianName: z.string().min(2),
  guardianPhone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  annualIncomeInr: z.coerce.number().int().min(0),
  householdSize: z.coerce.number().int().min(1).max(30).optional(),
  familySituation: z.enum(["ORPHAN", "SINGLE_PARENT", "BOTH_PARENTS", "GUARDIAN_CARE", "OTHER"]),
  fatherName: z.string().trim().min(2).max(120),
  fatherOccupation: z.string().trim().min(2).max(120),
  motherName: z.string().trim().min(2).max(120),
  motherOccupation: z.string().trim().min(2).max(120),
  parentsContactNumber: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  houseOwnership: z.enum(["OWN", "RENTED", "OTHER"]),
  state: z.string().trim().min(2).max(80),
  tamilNaduCounselling: z.enum(["YES", "NO"]),
  firstGeneration: z.enum(["YES", "NO"]),
  governmentSchoolReservation: z.enum(["YES", "NO"]),
  maatramSibling: z.enum(["YES", "NO"]),
  currentlyWorking: z.enum(["YES", "NO"]),
  currentWorkDetails: z.string().trim().max(250),
  howHeardAbout: z.string().trim().min(2).max(120),
  additionalInformation: z.string().trim().max(2000),
});

const siblingSchema = z.object({
  name: z.string().trim().min(2).max(120),
  age: z.coerce.number().int().min(0).max(100),
  qualification: z.string().trim().min(2).max(120),
  studyingThroughMaatram: z.enum(["YES", "NO"]),
});

export async function saveStep3(formData: FormData) {
  const user = await requireApplicant();
  if (!(await requireDraftApplicant(user.id))) redirect("/apply?step=1");
  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { userId: user.id } });

  const siblingNames = formData.getAll("siblingName").map(String);
  const siblingAges = formData.getAll("siblingAge").map(String);
  const siblingQualifications = formData.getAll("siblingQualification").map(String);
  const siblingMaatram = formData.getAll("siblingMaatram").map(String);
  const siblings = siblingNames.map((name, index) => ({
    name: name.trim(),
    age: siblingAges[index] ?? "",
    qualification: siblingQualifications[index] ?? "",
    studyingThroughMaatram: siblingMaatram[index] ?? "NO",
  })).filter((sibling) => sibling.name || sibling.age || sibling.qualification);

  const parsed = familySchema.safeParse({
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2") || undefined,
    pincode: formData.get("pincode"),
    guardianName: formData.get("guardianName"),
    guardianPhone: formData.get("guardianPhone"),
    annualIncomeInr: formData.get("annualIncomeInr") || undefined,
    householdSize: formData.get("householdSize") || undefined,
    familySituation: formData.get("familySituation"),
    fatherName: formData.get("fatherName"),
    fatherOccupation: formData.get("fatherOccupation") ?? "",
    motherName: formData.get("motherName"),
    motherOccupation: formData.get("motherOccupation") ?? "",
    parentsContactNumber: formData.get("parentsContactNumber"),
    houseOwnership: formData.get("houseOwnership"),
    state: formData.get("state"),
    tamilNaduCounselling: formData.get("tamilNaduCounselling"),
    firstGeneration: formData.get("firstGeneration"),
    governmentSchoolReservation: formData.get("governmentSchoolReservation"),
    maatramSibling: formData.get("maatramSibling"),
    currentlyWorking: formData.get("currentlyWorking"),
    currentWorkDetails: formData.get("currentWorkDetails") ?? "",
    howHeardAbout: formData.get("howHeardAbout"),
    additionalInformation: formData.get("additionalInformation") ?? "",
  });
  if (!parsed.success) redirectWithFieldError("/apply", parsed.error, "Invalid input", { step: "3" });

  const parsedSiblings = z.array(siblingSchema).max(10, "Add up to 10 siblings").safeParse(siblings);
  if (!parsedSiblings.success) redirectWithFieldError("/apply", parsedSiblings.error, "Check sibling details", { step: "3" });

  await prisma.applicantSensitiveInfo.upsert({
    where: { applicantId: applicant.id },
    create: {
      applicantId: applicant.id,
      addressLine1: parsed.data.addressLine1,
      addressLine2: parsed.data.addressLine2 || null,
      pincode: parsed.data.pincode,
      guardianName: parsed.data.guardianName,
      guardianPhone: parsed.data.guardianPhone,
      annualIncomeInr: parsed.data.annualIncomeInr ?? null,
      householdSize: parsed.data.householdSize ?? null,
      familySituation: parsed.data.familySituation,
      familyDetails: { ...parsed.data, siblings: parsedSiblings.data },
    },
    update: {
      addressLine1: parsed.data.addressLine1,
      addressLine2: parsed.data.addressLine2 || null,
      pincode: parsed.data.pincode,
      guardianName: parsed.data.guardianName,
      guardianPhone: parsed.data.guardianPhone,
      annualIncomeInr: parsed.data.annualIncomeInr ?? null,
      householdSize: parsed.data.householdSize ?? null,
      familySituation: parsed.data.familySituation,
      familyDetails: { ...parsed.data, siblings: parsedSiblings.data },
    },
  });

  redirect("/apply?step=4");
}

// The Documents step is a client component so it can PUT bytes straight to
// object storage — these two actions only ever see metadata, never the file.
// They return a result object rather than throwing: a thrown error from a
// server action called as a plain function gets redacted to a generic
// digest in production builds, which would hide our friendly messages
// ("File must be under 8MB") from the user.
export async function requestDocumentUploadUrlAction(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<{ ok: true; storageKey: string; uploadUrl: string } | { ok: false; error: string }> {
  const user = await requireApplicant();
  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { userId: user.id } });
  if (applicant.status !== "DRAFT") return { ok: false as const, error: "Submitted applications can no longer be edited" };
  try {
    const result = await createPresignedUploadUrl({ applicantId: applicant.id, ...input });
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: describeUploadError(err) };
  }
}

export async function confirmDocumentUploadAction(input: {
  kind: DocumentKind;
  storageKey: string;
  fileName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireApplicant();
  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { userId: user.id } });
  if (applicant.status !== "DRAFT") return { ok: false as const, error: "Submitted applications can no longer be edited" };

  const applicantDocumentKinds: DocumentKind[] = ["MARK_SHEET_10", "MARK_SHEET_11", "MARK_SHEET_12", "AADHAAR_DOCUMENT", "PASSPORT_PHOTO"];
  if (!applicantDocumentKinds.includes(input.kind)) return { ok: false as const, error: "This document type is not accepted for the application form" };

  // mimeType/sizeBytes come from the object actually sitting in storage,
  // not from whatever the client claims — a client that isn't going
  // through our own UI could otherwise request a URL for a small, allowed
  // file and then upload something completely different.
  let real: { sizeBytes: number; mimeType: string };
  try {
    real = await confirmUpload(input.storageKey);
  } catch (err) {
    return { ok: false, error: describeUploadError(err) };
  }

  // One document per kind — re-uploading replaces the previous file's record.
  await prisma.document.deleteMany({ where: { applicantId: applicant.id, kind: input.kind } });
  await prisma.document.create({
    data: {
      kind: input.kind,
      storageKey: input.storageKey,
      fileName: input.fileName,
      mimeType: real.mimeType,
      sizeBytes: real.sizeBytes,
      applicantId: applicant.id,
      uploadedById: user.id,
    },
  });
  return { ok: true };
}

export async function submitApplicationAction() {
  const user = await requireApplicant();
  const applicant = await prisma.applicant.findUniqueOrThrow({
    where: { userId: user.id },
    include: { documents: true, sensitiveInfo: true, identityInfo: true },
  });

  if (applicant.status !== "DRAFT") redirect("/apply/submitted");

  const requiredDocuments: DocumentKind[] = ["MARK_SHEET_10", "MARK_SHEET_11", "MARK_SHEET_12", "AADHAAR_DOCUMENT", "PASSPORT_PHOTO"];
  const hasRequiredDocuments = requiredDocuments.every((kind) => applicant.documents.some((document) => document.kind === kind));
  if (applicant.boardPercentage == null || !applicant.courseInterest || !applicant.academicDetails || !applicant.sensitiveInfo?.familyDetails || !applicant.identityInfo || !hasRequiredDocuments) {
    redirect("/apply?step=5&error=Please+complete+every+step+before+submitting");
  }

  if (!(await isCycleOpen(applicant.cycleId))) {
    redirect("/apply?step=5&error=This+admission+cycle+has+closed.+Your+draft+is+saved+but+can%27t+be+submitted%E2%80%94please+contact+Maatram+staff.");
  }

  const volunteerId = await assignVolunteer(applicant.district, applicant.sensitiveInfo?.pincode);
  const nextStatus = volunteerId ? "UNDER_VERIFICATION" : "SUBMITTED";

  const submitted = await prisma.$transaction(async (tx) => {
    const changed = await tx.applicant.updateMany({
      where: { id: applicant.id, status: "DRAFT" },
      data: volunteerId ? { status: "UNDER_VERIFICATION", volunteerId, submittedAt: new Date() } : { status: "SUBMITTED", submittedAt: new Date() },
    });
    if (changed.count === 0) return false;
    const event = await appendEvent(tx, {
      aggregateType: "Applicant",
      aggregateId: applicant.id,
      type: "APPLICANT_STATUS_CHANGED",
      payload: { fromStatus: "DRAFT", toStatus: nextStatus, action: "APPLICATION_SUBMITTED", volunteerId },
      idempotencyKey: `application-submitted:${applicant.id}`,
    });
    await notifyApplicant(tx, applicant.id, event.id, "Application submitted", "Your application has been received. You can follow its progress from your applicant dashboard.");
    return true;
  });

  redirect(submitted ? "/apply/submitted" : "/applicant");
}

const assistedSchema = personalSchema
  .merge(academicSchema)
  .merge(familySchema.extend({
    annualIncomeInr: z.coerce.number().int().min(0).optional(),
    fatherName: z.string().optional(), fatherOccupation: z.string().optional(),
    motherName: z.string().optional(), motherOccupation: z.string().optional(),
    parentsContactNumber: z.string().optional(), houseOwnership: z.enum(["OWN", "RENTED", "OTHER"]).optional(),
    state: z.string().optional(), tamilNaduCounselling: z.enum(["YES", "NO"]).optional(),
    firstGeneration: z.enum(["YES", "NO"]).optional(), governmentSchoolReservation: z.enum(["YES", "NO"]).optional(),
    maatramSibling: z.enum(["YES", "NO"]).optional(), currentlyWorking: z.enum(["YES", "NO"]).optional(),
    currentWorkDetails: z.string().optional(), howHeardAbout: z.string().optional(), additionalInformation: z.string().optional(),
  }))
  .extend({
    phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
    aadhaarNumber: z.string().regex(/^\d{12}$/, "Enter a valid 12-digit Aadhaar number"),
  });

/** A volunteer collecting data during a home visit files the whole
 * application in one pass, pre-assigned to themselves — they're the one
 * doing the verification anyway, so there's no separate round-robin
 * assignment step here. */
export async function createAssistedApplication(formData: FormData) {
  const volunteer = await requireVolunteer();

  const parsed = assistedSchema.safeParse({
    phone: formData.get("phone"),
    fullName: formData.get("fullName"),
    dob: formData.get("dob"),
    gender: formData.get("gender"),
    aadhaarNumber: formData.get("aadhaarNumber"),
    district: formData.get("district"),
    community: formData.get("community"),
    email: formData.get("email") || undefined,
    boardPercentage: formData.get("boardPercentage"),
    courseInterest: formData.get("courseInterest"),
    preferredCollegeId: formData.get("preferredCollegeId") || undefined,
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2") || undefined,
    pincode: formData.get("pincode"),
    guardianName: formData.get("guardianName"),
    guardianPhone: formData.get("guardianPhone"),
    annualIncomeInr: formData.get("annualIncomeInr") || undefined,
    householdSize: formData.get("householdSize") || undefined,
    familySituation: formData.get("familySituation"),
  });
  if (!parsed.success) redirectWithFieldError("/apply/assist", parsed.error, "Invalid input");
  const data = parsed.data;

  const familyUser = await prisma.user.upsert({
    where: { phone: data.phone },
    update: { name: data.fullName },
    create: {
      phone: data.phone,
      name: data.fullName,
      email: `${data.phone}@applicant.maatram.local`,
      role: Role.APPLICANT,
    },
  });

  const existingApplicant = await prisma.applicant.findUnique({
    where: { userId: familyUser.id },
    select: { id: true, status: true, student: { select: { id: true } } },
  });
  // Re-entering this form for a phone number that already has an
  // applicant record must never silently reset their progress — without
  // this, a duplicate home-visit entry for someone already VERIFIED,
  // interviewed, decided, or onboarded would upsert their status straight
  // back to UNDER_VERIFICATION, undoing a committee decision outright.
  const PRE_VERIFICATION_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_VERIFICATION"];
  if (existingApplicant && !PRE_VERIFICATION_STATUSES.includes(existingApplicant.status)) {
    redirect(`/staff/applicants/${existingApplicant.id}?error=This+applicant+already+has+progress+beyond+verification+%E2%80%94+edit+their+record+directly+instead`);
  }
  if (existingApplicant?.student) {
    redirect(`/staff/applicants/${existingApplicant.id}?error=This+applicant+has+already+been+onboarded+as+a+student`);
  }

  let cycleId: string | undefined;
  if (!existingApplicant) {
    const openCycle = await getOpenCycle();
    if (!openCycle) {
      redirect("/apply/assist?error=Applications+are+closed+for+this+year%E2%80%94no+new+application+can+be+started.");
    }
    cycleId = openCycle.id;
  }

  const applicant = await prisma.applicant.upsert({
    where: { userId: familyUser.id },
    create: {
      userId: familyUser.id,
      fullName: data.fullName,
      dob: data.dob,
      gender: data.gender,
      district: data.district,
      community: data.community || null,
      phone: data.phone,
      email: data.email || null,
      boardPercentage: data.boardPercentage,
      courseInterest: data.courseInterest,
      preferredCollegeId: data.preferredCollegeId || null,
      volunteerId: volunteer.id,
      status: "UNDER_VERIFICATION",
      submittedAt: new Date(),
      cycleId,
    },
    update: {
      fullName: data.fullName,
      dob: data.dob,
      gender: data.gender,
      district: data.district,
      community: data.community || null,
      email: data.email || null,
      boardPercentage: data.boardPercentage,
      courseInterest: data.courseInterest,
      preferredCollegeId: data.preferredCollegeId || null,
      volunteerId: volunteer.id,
      status: "UNDER_VERIFICATION",
      submittedAt: new Date(),
    },
  });

  const aadhaarHmac = hashAadhaar(data.aadhaarNumber);
  const duplicateAadhaar = await prisma.applicantIdentity.findUnique({ where: { aadhaarHmac }, select: { applicantId: true } });
  if (duplicateAadhaar && duplicateAadhaar.applicantId !== applicant.id) {
    redirect(`/apply/assist?error=${encodeURIComponent("An application already exists with this Aadhaar number. Contact Maatram staff.")}`);
  }
  await prisma.applicantIdentity.upsert({
    where: { applicantId: applicant.id },
    create: { applicantId: applicant.id, aadhaarHmac, aadhaarLast4: data.aadhaarNumber.slice(-4) },
    update: { aadhaarHmac, aadhaarLast4: data.aadhaarNumber.slice(-4) },
  });

  await prisma.applicantSensitiveInfo.upsert({
    where: { applicantId: applicant.id },
    create: {
      applicantId: applicant.id,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 || null,
      pincode: data.pincode,
      guardianName: data.guardianName,
      guardianPhone: data.guardianPhone,
      annualIncomeInr: data.annualIncomeInr ?? null,
      householdSize: data.householdSize ?? null,
      familySituation: data.familySituation,
    },
    update: {
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 || null,
      pincode: data.pincode,
      guardianName: data.guardianName,
      guardianPhone: data.guardianPhone,
      annualIncomeInr: data.annualIncomeInr ?? null,
      householdSize: data.householdSize ?? null,
      familySituation: data.familySituation,
    },
  });

  const idProof = formData.get("idProof") as File | null;
  if (idProof && idProof.size > 0) {
    let saved: Awaited<ReturnType<typeof putObjectDirect>>;
    try {
      saved = await putObjectDirect(applicant.id, idProof);
    } catch (err) {
      redirect(`/apply/assist?error=${encodeURIComponent(describeUploadError(err))}`);
    }
    await prisma.document.deleteMany({ where: { applicantId: applicant.id, kind: "ID_PROOF" } });
    await prisma.document.create({
      data: { ...saved, kind: "ID_PROOF", applicantId: applicant.id, uploadedById: volunteer.id },
    });
  }

  redirect(`/staff/applicants/${applicant.id}`);
}
