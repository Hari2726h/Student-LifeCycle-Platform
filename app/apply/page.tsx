import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWizardState, clampStep } from "@/lib/wizard";
import { LANG_COOKIE, t, type Lang } from "@/lib/i18n";
import { LanguageToggle } from "./language-toggle";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { PhoneGate } from "./phone-gate";
import { WizardShell } from "./wizard-shell";
import { PersonalStep } from "./steps/personal";
import { AcademicStep } from "./steps/academic";
import { FamilyStep } from "./steps/family";
import { DocumentsStep } from "./steps/documents";
import { ReviewStep } from "./steps/review";

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? "en";

  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
        <PhoneGate lang={lang} />
      </div>
    );
  }

  if (session.user.role === "VOLUNTEER") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12 text-center">
        <div className="max-w-sm">
          <BrandMark className="mx-auto size-8" />
          <p className="mt-4 text-sm text-ink-muted">
            You&rsquo;re signed in as a volunteer. Start an application on behalf of a family you&rsquo;re visiting instead.
          </p>
          <Button href="/apply/assist" variant="primary" className="mt-4">
            Start a visit application
          </Button>
        </div>
      </div>
    );
  }

  if (session.user.role !== "APPLICANT") {
    redirect("/login");
  }

  const { applicant, maxStep, alreadySubmitted } = await getWizardState(session.user.id);

  if (alreadySubmitted && applicant) {
    const strings = t(lang);
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrandMark className="size-7" />
              <span className="font-display text-sm font-medium text-ink">{strings.appName}</span>
            </div>
            <LanguageToggle lang={lang} />
          </div>
          <h1 className="font-display text-xl font-medium text-ink">{applicant.fullName}</h1>
          <div className="mt-2 flex justify-center">
            <StatusBadge value={applicant.status} />
          </div>
          <p className="mt-4 text-sm text-ink-muted">{strings.alreadyInProgressNotice}</p>
        </div>
      </div>
    );
  }

  const step = clampStep(Number(params.step ?? maxStep), maxStep);

  const colleges = step === 2 ? await prisma.college.findMany({ orderBy: { name: "asc" } }) : [];
  const college =
    step === 5 && applicant?.preferredCollegeId
      ? await prisma.college.findUnique({ where: { id: applicant.preferredCollegeId } })
      : null;

  return (
    <div className="bg-bg">
      <WizardShell lang={lang} step={step} maxStep={maxStep}>
        {step === 1 && <PersonalStep lang={lang} applicant={applicant} error={params.error} />}
        {step === 2 && applicant && <AcademicStep lang={lang} applicant={applicant} colleges={colleges} error={params.error} />}
        {step === 3 && <FamilyStep lang={lang} info={applicant?.sensitiveInfo ?? null} error={params.error} />}
        {step === 4 && <DocumentsStep lang={lang} documents={applicant?.documents ?? []} error={params.error} />}
        {step === 5 && applicant && (
          <ReviewStep
            lang={lang}
            applicant={applicant}
            college={college}
            info={applicant.sensitiveInfo}
            documents={applicant.documents}
            error={params.error}
          />
        )}
      </WizardShell>
    </div>
  );
}
