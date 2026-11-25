import { redirect } from "next/navigation";
import type { z } from "zod";

/** Without errorField, a validation failure on one field in a long,
 * multi-section form rendered as a generic banner at the top of the
 * page — indistinguishable from an error about whatever field happened
 * to be first. Field, Select and TextArea already render an inline
 * error right under the named input when given one; this just wires
 * the redirect up to say which field it's actually about. path[0] is a
 * plain field name for object schemas but an array index for a
 * repeated-row list (e.g. siblings, expense lines), where no single
 * named input exists to highlight — the string check skips that case
 * and falls back to the generic banner, correctly. */
export function redirectWithFieldError(
  path: string,
  error: z.ZodError,
  fallback: string,
  extraParams?: Record<string, string>,
): never {
  const issue = error.issues[0];
  const params = new URLSearchParams({ ...extraParams, error: issue?.message ?? fallback });
  if (typeof issue?.path[0] === "string") params.set("errorField", issue.path[0]);
  redirect(`${path}?${params.toString()}`);
}
