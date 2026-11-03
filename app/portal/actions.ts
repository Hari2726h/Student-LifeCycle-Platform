"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { addCareerEvent } from "@/lib/alumni-career";
import { setAlumniMentoringOptIn, setAlumniReferralFlag } from "@/lib/alumni-mentoring";

const schema = z.object({
  company: z.string().min(2),
  role: z.string().min(2),
  startDate: z.coerce.date(),
});

/** An alumnus reporting their own career update — source is always
 * SELF_REPORTED here; REFERRAL and PLACEMENT only ever come from staff. */
export async function selfReportCareerEvent(formData: FormData) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ALUMNI") redirect("/login");

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
  const session = await auth();
  if (!session?.user || session.user.role !== "ALUMNI") redirect("/login");

  const student = await prisma.student.findUniqueOrThrow({ where: { userId: session.user.id } });
  const optIn = formData.get("optIn") === "true";
  const availability = String(formData.get("availability") ?? "").trim() || null;

  await setAlumniMentoringOptIn(student.id, optIn, availability);
  revalidatePath("/portal");
}

export async function toggleReferralFlag(formData: FormData) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ALUMNI") redirect("/login");

  const student = await prisma.student.findUniqueOrThrow({ where: { userId: session.user.id } });
  const openToReferrals = formData.get("openToReferrals") === "true";

  await setAlumniReferralFlag(student.id, openToReferrals);
  revalidatePath("/portal");
}
