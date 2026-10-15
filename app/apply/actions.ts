"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requestOtp } from "@/lib/otp";
import { saveUploadedFile } from "@/lib/uploads";
import { assignVolunteer } from "@/lib/applicants";
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

export async function uploadDocumentAction(formData: FormData) {
  const user = await requireApplicant();
  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { userId: user.id } });

  const kind = formData.get("kind") as DocumentKind | null;
  const file = formData.get("file") as File | null;
  if (!kind || !file || file.size === 0) {
    redirect("/apply?step=4&error=Choose+a+file+to+upload");
  }
  if (file.size > 8 * 1024 * 1024) {
    redirect("/apply?step=4&error=File+must+be+under+8MB");
  }

  const saved = await saveUploadedFile(applicant.id, file);

  // One document per kind — re-uploading replaces the previous file's record.
  await prisma.document.deleteMany({ where: { applicantId: applicant.id, kind } });
  await prisma.document.create({
    data: { ...saved, kind, applicantId: applicant.id, uploadedById: user.id },
  });

  redirect("/apply?step=4");
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

  const volunteerId = await assignVolunteer(applicant.district);

  await prisma.applicant.update({
    where: { id: applicant.id },
    data: volunteerId
      ? { status: "UNDER_VERIFICATION", volunteerId }
      : { status: "SUBMITTED" },
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
    update: {},
    create: {
      phone: data.phone,
      name: data.fullName,
      email: `${data.phone}@applicant.maatram.local`,
      role: Role.APPLICANT,
    },
  });

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
    const saved = await saveUploadedFile(applicant.id, idProof);
    await prisma.document.deleteMany({ where: { applicantId: applicant.id, kind: "ID_PROOF" } });
    await prisma.document.create({
      data: { ...saved, kind: "ID_PROOF", applicantId: applicant.id, uploadedById: volunteer.id },
    });
  }

  redirect(`/staff/applicants/${applicant.id}`);
}
