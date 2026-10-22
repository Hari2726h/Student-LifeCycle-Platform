"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const schema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  opensAt: z.coerce.date(),
  closesAt: z.coerce.date(),
});

export async function createCycle(formData: FormData) {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/login");

  const parsed = schema.safeParse({
    year: formData.get("year"),
    opensAt: formData.get("opensAt"),
    closesAt: formData.get("closesAt"),
  });
  if (!parsed.success) {
    redirect(`/staff/cycles?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  if (parsed.data.closesAt <= parsed.data.opensAt) {
    redirect("/staff/cycles?error=Close+date+must+be+after+the+open+date");
  }

  await prisma.admissionCycle.create({ data: parsed.data });
  revalidatePath("/staff/cycles");
}
