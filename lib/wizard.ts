import { prisma } from "@/lib/prisma";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

/** Loads everything the /apply wizard needs and figures out how far this
 * applicant has actually gotten, so a step can never be skipped ahead of
 * data that doesn't exist yet. */
export async function getWizardState(userId: string) {
  const applicant = await prisma.applicant.findUnique({
    where: { userId },
    include: { sensitiveInfo: true, documents: true, preferredCollege: true },
  });

  if (!applicant) {
    return { applicant: null, maxStep: 1 as WizardStep, alreadySubmitted: false };
  }

  if (applicant.status !== "DRAFT") {
    return { applicant, maxStep: 5 as WizardStep, alreadySubmitted: true };
  }

  let maxStep: WizardStep = 2;
  if (applicant.boardPercentage != null && applicant.courseInterest) maxStep = 3;
  if (applicant.sensitiveInfo) maxStep = 4;
  if (applicant.documents.some((d) => d.kind === "ID_PROOF")) maxStep = 5;

  return { applicant, maxStep, alreadySubmitted: false };
}

export function clampStep(requested: number, maxStep: WizardStep): WizardStep {
  const step = Number.isFinite(requested) ? Math.trunc(requested) : 1;
  return Math.min(Math.max(step, 1), maxStep) as WizardStep;
}
