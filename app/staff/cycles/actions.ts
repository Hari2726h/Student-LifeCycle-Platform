"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { ROLE_HOME } from "@/lib/roles";
import { redirectWithFieldError } from "@/lib/form-errors";

const schema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  opensAt: z.coerce.date(),
  closesAt: z.coerce.date(),
});

export async function createCycle(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "STAFF") redirect(ROLE_HOME[session.user.role]);

  const parsed = schema.safeParse({
    year: formData.get("year"),
    opensAt: formData.get("opensAt"),
    closesAt: formData.get("closesAt"),
  });
  if (!parsed.success) redirectWithFieldError("/staff/cycles", parsed.error, "Invalid input");
  if (parsed.data.closesAt <= parsed.data.opensAt) {
    redirect(`/staff/cycles?error=${encodeURIComponent("Close date must be after the open date")}&errorField=closesAt`);
  }

  await prisma.admissionCycle.create({ data: parsed.data });
  revalidatePath("/staff/cycles");
}
