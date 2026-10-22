"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { addCareerEvent, recomputeAllProfiles } from "@/lib/alumni-career";

async function requireStaff() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/login");
}

const schema = z.object({
  alumniProfileId: z.string().min(1),
  source: z.enum(["REFERRAL", "PLACEMENT"]),
  company: z.string().min(2),
  role: z.string().min(2),
  startDate: z.coerce.date(),
  notes: z.string().optional(),
});

/** Staff-logged career events — the only two sources that never come from
 * the alumnus themselves: a referral someone heard about, or a placement
 * the program itself arranged. */
export async function logStaffCareerEvent(formData: FormData) {
  await requireStaff();

  const parsed = schema.safeParse({
    alumniProfileId: formData.get("alumniProfileId"),
    source: formData.get("source"),
    company: formData.get("company"),
    role: formData.get("role"),
    startDate: formData.get("startDate"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    redirect(`/staff/alumni?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  await addCareerEvent(parsed.data);
  revalidatePath("/staff/alumni");
}

export async function replayAllAlumniProfiles() {
  await requireStaff();
  const { recomputed } = await recomputeAllProfiles();
  redirect(`/staff/alumni?result=${encodeURIComponent(`Recomputed ${recomputed} alumni profile${recomputed === 1 ? "" : "s"} from history`)}`);
}
