import { prisma } from "@/lib/prisma";
import { courseToSpecialty } from "@/lib/specialty";

/** Turns one checkbox on an alumnus's own portal into them actually
 * appearing in suggestMentors() for current students — not just a label
 * on their profile nobody reads. Opting in provisions (or reactivates) a
 * real Mentor(type=ALUMNI) row; opting out deactivates it rather than
 * deleting it outright when they already have mentees, so existing
 * mentor-student relationships and MentorLog history are never orphaned. */
export async function setAlumniMentoringOptIn(studentId: string, optIn: boolean, availability: string | null) {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { applicant: true, alumniProfile: true, user: { include: { mentorProfile: true } } },
  });
  if (!student.alumniProfile) throw new Error("Not an alumnus");

  // One transaction, not two independent writes — without it, two rapid
  // toggles (or a double-click) can interleave their writes and leave
  // AlumniProfile.mentoringOptIn and Mentor.isActive disagreeing about
  // whether this person is actually opted in.
  await prisma.$transaction(async (tx) => {
    await tx.alumniProfile.update({
      where: { id: student.alumniProfile!.id },
      data: { mentoringOptIn: optIn, availability },
    });

    if (optIn) {
      const specialty = courseToSpecialty(student.program);
      await tx.mentor.upsert({
        where: { userId: student.userId },
        // `type` is included here too, not just on create — a Mentor row
        // for this user could already exist as type STAFF (an account
        // that held a staff-mentor role before becoming a student/alumnus;
        // User.mentorProfile and User.studentProfile are independent 1:1
        // relations, so that's a real reachable state). Without this,
        // opting in through the alumni portal would silently reactivate a
        // STAFF-typed row instead of actually making them an alumni mentor.
        update: { isActive: true, specialty, district: student.applicant.district, type: "ALUMNI", maxLoad: 5 },
        create: {
          userId: student.userId,
          type: "ALUMNI",
          specialty,
          district: student.applicant.district,
          maxLoad: 5, // alumni are volunteering on top of a day job — a lighter cap than staff mentors
        },
      });
    } else if (student.user.mentorProfile) {
      await tx.mentor.update({ where: { id: student.user.mentorProfile.id }, data: { isActive: false } });
    }
  });
}

export async function setAlumniReferralFlag(studentId: string, openToReferrals: boolean) {
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { alumniProfile: true } });
  if (!student.alumniProfile) throw new Error("Not an alumnus");
  await prisma.alumniProfile.update({ where: { id: student.alumniProfile.id }, data: { openToReferrals } });
}
