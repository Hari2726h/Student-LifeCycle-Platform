"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const slotSchema = z.object({
  scheduledAt: z.coerce.date(),
  location: z.string().min(2),
  meetingUrl: z.union([z.string().url().max(2000), z.literal("")]).optional(),
  capacity: z.coerce.number().int().min(1).max(20),
});

export async function createInterviewSlot(formData: FormData) {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMMITTEE") redirect("/login");

  const parsed = slotSchema.safeParse({
    scheduledAt: formData.get("scheduledAt"),
    location: formData.get("location"),
    meetingUrl: formData.get("meetingUrl") ?? "",
    capacity: formData.get("capacity"),
  });
  if (!parsed.success) {
    redirect(`/staff/interview-slots?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  await prisma.interviewSlot.create({
    data: { ...parsed.data, meetingUrl: parsed.data.meetingUrl || null, createdById: session.user.id },
  });

  redirect("/staff/interview-slots");
}
