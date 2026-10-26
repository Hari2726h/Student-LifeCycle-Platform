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
import { getOpenCycle, isCycleOpen } from "@/lib/cycles";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";
import { Role, type DocumentKind } from "@prisma/client";

async function requireApplicant() {
  const session = await auth();
  if (!session?.user || session.user.role !== "APPLICANT") {
    redirect("/login");
  }
  return session.user;
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
  const { code } = await requestOtp(parsed.data);
  return { ok: true as const, devCode: code, phone: parsed.data };
}

const personalSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name"),
  dob: z.coerce.date().refine((d) => d < new Date(), "Enter a valid date of birth"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  district: z.string().min(1, "Select a district"),
  email: z.string().trim().email().optional().or(z.literal("")),
});

export async function saveStep1(formData: FormData) {
  const user = await requireApplicant();
  const parsed = personalSchema.safeParse({
    fullName: formData.get("fullName"),
    dob: formData.get("dob"),
    gender: formData.get("gender"),
    district: formData.get("district"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    redirect(`/apply?step=1&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  const data = parsed.data;
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
  const existing = await prisma.applicant.findUnique({ where: { userId: user.id }, select: { id: true } });
  let cycleId: string | undefined;
  if (!existing) {
    const openCycle = await getOpenCycle();
    if (!openCycle) {
      redirect("/apply?step=1&error=Applications+are+closed+for+this+year.+Please+check+back+for+the+next+cycle.");
    }
    cycleId = openCycle.id;
  }

  await prisma.applicant.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      fullName: data.fullName,
      dob: data.dob,
      gender: data.gender,
      district: data.district,
      phone: account.phone ?? "",
      email: data.email || null,
      cycleId,
    },
    update: {
      fullName: data.fullName,
      dob: data.dob,
      gender: data.gender,
      district: data.district,
      email: data.email || null,
    },
  });

  redirect("/apply?step=2");
}

const academicSchema = z.object({
  boardPercentage: z.coerce.number().min(0).max(100),
  courseInterest: z.string().min(2),
  preferredCollegeId: z.string().optional(),
});

export async function saveStep2(formData: FormData) {
  const user = await requireApplicant();
  const parsed = academicSchema.safeParse({
    boardPercentage: formData.get("boardPercentage"),
    courseInterest: formData.get("courseInterest"),
    preferredCollegeId: formData.get("preferredCollegeId") || undefined,
  });
  if (!parsed.success) {
    redirect(`/apply?step=2&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  await prisma.applicant.update({
    where: { userId: user.id },
    data: { ...parsed.data },
  });

  redirect("/apply?step=3");
}

const familySchema = z.object({
  addressLine1: z.string().min(3),
  addressLine2: z.string().optional(),
  pincode: z.string().regex(/^\d{6}$/, "Enter a 6-digit pincode"),
  guardianName: z.string().min(2),
  guardianPhone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  annualIncomeInr: z.coerce.number().int().min(0).optional(),
  householdSize: z.coerce.number().int().min(1).max(30).optional(),
  familySituation: z.enum(["ORPHAN", "SINGLE_PARENT", "BOTH_PARENTS", "GUARDIAN_CARE", "OTHER"]),
});

export async function saveStep3(formData: FormData) {
  const user = await requireApplicant();
  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { userId: user.id } });

  const parsed = familySchema.safeParse({
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2") || undefined,
    pincode: formData.get("pincode"),
    guardianName: formData.get("guardianName"),
    guardianPhone: formData.get("guardianPhone"),
    annualIncomeInr: formData.get("annualIncomeInr") || undefined,
    householdSize: formData.get("householdSize") || undefined,
    familySituation: formData.get("familySituation"),
  });
  if (!parsed.success) {
    redirect(`/apply?step=3&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  await prisma.applicantSensitiveInfo.upsert({
    where: { applicantId: applicant.id },
    create: { applicantId: applicant.id, ...parsed.data },
    update: { ...parsed.data },
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
    include: { documents: true, sensitiveInfo: true },
  });

  if (applicant.status !== "DRAFT") redirect("/apply/submitted");

  const hasIdProof = applicant.documents.some((d) => d.kind === "ID_PROOF");
  if (!applicant.boardPercentage || !applicant.courseInterest || !applicant.sensitiveInfo || !hasIdProof) {
    redirect("/apply?step=5&error=Please+complete+every+step+before+submitting");
  }

  if (!(await isCycleOpen(applicant.cycleId))) {
    redirect("/apply?step=5&error=This+admission+cycle+has+closed.+Your+draft+is+saved+but+can%27t+be+submitted%E2%80%94please+contact+Maatram+staff.");
  }

  const volunteerId = await assignVolunteer(applicant.district, applicant.sensitiveInfo?.pincode);
  const nextStatus = volunteerId ? "UNDER_VERIFICATION" : "SUBMITTED";

  await prisma.$transaction(async (tx) => {
    await tx.applicant.update({
      where: { id: applicant.id },
      data: volunteerId ? { status: "UNDER_VERIFICATION", volunteerId } : { status: "SUBMITTED" },
    });
    await appendEvent(tx, {
      aggregateType: "Applicant",
      aggregateId: applicant.id,
      type: "APPLICANT_STATUS_CHANGED",
      payload: { fromStatus: "DRAFT", toStatus: nextStatus, action: "APPLICATION_SUBMITTED", volunteerId },
    });
  });

  redirect("/apply/submitted");
}

const assistedSchema = personalSchema
  .merge(academicSchema)
  .merge(familySchema)
  .extend({ phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number") });

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
    district: formData.get("district"),
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
  if (!parsed.success) {
    redirect(`/apply/assist?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
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

  const existingApplicant = await prisma.applicant.findUnique({ where: { userId: familyUser.id }, select: { id: true } });
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
      phone: data.phone,
      email: data.email || null,
      boardPercentage: data.boardPercentage,
      courseInterest: data.courseInterest,
      preferredCollegeId: data.preferredCollegeId || null,
      volunteerId: volunteer.id,
      status: "UNDER_VERIFICATION",
      cycleId,
    },
    update: {
      fullName: data.fullName,
      dob: data.dob,
      gender: data.gender,
      district: data.district,
      email: data.email || null,
      boardPercentage: data.boardPercentage,
      courseInterest: data.courseInterest,
      preferredCollegeId: data.preferredCollegeId || null,
      volunteerId: volunteer.id,
      status: "UNDER_VERIFICATION",
    },
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
