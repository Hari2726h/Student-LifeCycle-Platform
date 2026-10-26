import { prisma } from "@/lib/prisma";

/** Builds the minimal User -> Applicant -> Student -> AlumniProfile chain
 * the schema requires, entirely with synthetic throwaway data, and
 * returns a teardown function that removes exactly what it created. */
export async function createAlumniFixture() {
  const suffix = crypto.randomUUID();

  const college = await prisma.college.create({
    data: { name: `Test College ${suffix}`, type: "ENGINEERING", district: "Chennai" },
  });

  const user = await prisma.user.create({
    data: { name: `Test Alumnus ${suffix}`, email: `test-alumnus-${suffix}@example.test`, role: "ALUMNI" },
  });

  const applicant = await prisma.applicant.create({
    data: {
      userId: user.id,
      fullName: user.name,
      dob: new Date("2000-01-01"),
      gender: "FEMALE",
      phone: `9${suffix.replace(/\D/g, "").slice(0, 9).padEnd(9, "0")}`,
      district: "Chennai",
      status: "ACCEPTED",
    },
  });

  const student = await prisma.student.create({
    data: {
      userId: user.id,
      applicantId: applicant.id,
      collegeId: college.id,
      program: "B.E. Computer Science",
      admissionYear: 2020,
      status: "ALUMNI",
    },
  });

  const alumniProfile = await prisma.alumniProfile.create({ data: { studentId: student.id } });

  async function cleanup() {
    await prisma.careerEvent.deleteMany({ where: { alumniProfileId: alumniProfile.id } });
    await prisma.alumniProfile.delete({ where: { id: alumniProfile.id } });
    await prisma.student.delete({ where: { id: student.id } });
    await prisma.applicant.delete({ where: { id: applicant.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.college.delete({ where: { id: college.id } });
  }

  return { alumniProfile, cleanup };
}
