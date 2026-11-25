"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { addCareerEvent } from "@/lib/alumni-career";
import { setAlumniMentoringOptIn, setAlumniReferralFlag } from "@/lib/alumni-mentoring";
import { ROLE_HOME } from "@/lib/roles";

/** A STUDENT hitting one of the ALUMNI-only actions below used to redirect
 * to /login — a dead end, since STUDENT (like APPLICANT, whom it's
 * usually promoted from) never gets a passwordHash set. Currently
 * unreachable in practice (app/portal/page.tsx only renders these forms
 * when role === "ALUMNI"), but these are real server actions a crafted
 * request could still hit directly, so they get the same fix as every
 * other requireX() helper in this audit. */
async function requireAlumni() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ALUMNI") redirect(ROLE_HOME[session.user.role]);
  return session;
}

async function requireStudentOrAlumni() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "STUDENT" && session.user.role !== "ALUMNI") redirect(ROLE_HOME[session.user.role]);
  return session;
}

const schema = z.object({
  company: z.string().min(2),
  role: z.string().min(2),
  startDate: z.coerce.date(),
});

const karpomSchema = z.object({
  juniorName: z.string().trim().min(2).max(100),
  juniorContact: z.string().trim().max(20).optional(),
  subject: z.string().trim().min(2).max(150),
  sessionDate: z.coerce.date(),
  notes: z.string().trim().max(1000).optional(),
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/).or(z.literal("")),
  bio: z.string().trim().max(1000).optional(),
});

/** An alumnus reporting their own career update — source is always
 * SELF_REPORTED here; REFERRAL and PLACEMENT only ever come from staff. */
export async function selfReportCareerEvent(formData: FormData) {
  const session = await requireAlumni();

  const parsed = schema.safeParse({
    company: formData.get("company"),
    role: formData.get("role"),
    startDate: formData.get("startDate"),
  });
  if (!parsed.success) return;

  const student = await prisma.student.findUniqueOrThrow({
    where: { userId: session.user.id },
    include: { alumniProfile: true },
  });
  if (!student.alumniProfile) return;

  await addCareerEvent({
    alumniProfileId: student.alumniProfile.id,
    source: "SELF_REPORTED",
    company: parsed.data.company,
    role: parsed.data.role,
    startDate: parsed.data.startDate,
  });

  revalidatePath("/portal");
}

export async function toggleMentoringOptIn(formData: FormData) {
  const session = await requireAlumni();

  const student = await prisma.student.findUniqueOrThrow({ where: { userId: session.user.id } });
  const optIn = formData.get("optIn") === "true";
  const availability = String(formData.get("availability") ?? "").trim() || null;

  await setAlumniMentoringOptIn(student.id, optIn, availability);
  revalidatePath("/portal");
}

export async function toggleReferralFlag(formData: FormData) {
  const session = await requireAlumni();

  const student = await prisma.student.findUniqueOrThrow({ where: { userId: session.user.id } });
  const openToReferrals = formData.get("openToReferrals") === "true";

  await setAlumniReferralFlag(student.id, openToReferrals);
  revalidatePath("/portal");
}

/** Karpom Karpippom — an alumnus logging a tutoring session with a school-
 * age junior. The model and its read side (the "Giving back" card on this
 * same page) already existed; this was the missing write side — every
 * session an alumnus has ever actually logged through the app came from
 * seed data only, until now. */
export async function logKarpomSession(formData: FormData) {
  const session = await requireAlumni();

  const parsed = karpomSchema.safeParse({
    juniorName: formData.get("juniorName"),
    juniorContact: formData.get("juniorContact") || undefined,
    subject: formData.get("subject"),
    sessionDate: formData.get("sessionDate"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return;

  const student = await prisma.student.findUniqueOrThrow({
    where: { userId: session.user.id },
    include: { alumniProfile: true },
  });
  if (!student.alumniProfile) return;

  await prisma.karpomSession.create({
    data: {
      alumniProfileId: student.alumniProfile.id,
      juniorName: parsed.data.juniorName,
      juniorContact: parsed.data.juniorContact ?? null,
      subject: parsed.data.subject,
      sessionDate: parsed.data.sessionDate,
      notes: parsed.data.notes ?? null,
    },
  });

  revalidatePath("/portal");
}

/** Students and alumni had no way to self-edit anything about their own
 * account — name, phone, bio were all read-only, unlike every other role
 * (volunteers have updateVolunteerProfile). bio only applies to alumni;
 * students just get name/phone. */
export async function updateProfile(formData: FormData) {
  const session = await requireStudentOrAlumni();

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    bio: formData.get("bio") || undefined,
  });
  if (!parsed.success) redirect("/portal/profile?error=Check+the+profile+fields");
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.user.id },
        data: { name: data.name, phone: data.phone || null },
      });
      if (session.user.role === "ALUMNI") {
        const student = await tx.student.findUnique({ where: { userId: session.user.id }, include: { alumniProfile: true } });
        if (student?.alumniProfile) {
          await tx.alumniProfile.update({ where: { id: student.alumniProfile.id }, data: { bio: data.bio || null } });
        }
      }
    });
  } catch {
    redirect("/portal/profile?error=That+mobile+number+may+already+be+in+use");
  }

  revalidatePath("/portal");
  revalidatePath("/portal/profile");
  redirect("/portal/profile?saved=1");
}
