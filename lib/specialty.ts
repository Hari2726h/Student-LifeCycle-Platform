/** Crude but explainable: buckets a course/program name into the same
 * broad specialty categories mentors are tagged with. Shared by applicant
 * mentor-matching (lib/mentor-matching.ts) and alumni mentor provisioning
 * (lib/alumni-mentoring.ts) so an alumnus's own program classifies the
 * same way a current applicant's course interest would. */
export function courseToSpecialty(course: string): string {
  const engineering = /^B\.?\s?(E|Tech)\.?/i;
  if (engineering.test(course)) return "Engineering";
  if (/medic/i.test(course)) return "Medical";
  return "Arts & Science";
}
