import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Maatram Foundation
        </p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">
          Student Lifecycle Platform
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Sign in to continue</p>

        {params.error && (
          <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Incorrect email or password. Please try again.
          </p>
        )}

        <form action={loginAction} className="mt-6 space-y-4">
          <input type="hidden" name="callbackUrl" value={params.callbackUrl ?? "/"} />
          <div>
            <label className="block text-sm font-medium text-neutral-700">Email</label>
            <input
              type="email"
              name="email"
              required
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              placeholder="you@maatram.org"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Password</label>
            <input
              type="password"
              name="password"
              required
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Sign in
          </button>
        </form>

        <div className="mt-6 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          <p className="font-medium text-neutral-600">Demo accounts (seeded)</p>
          <p>staff@maatram.org · committee@maatram.org · volunteer@maatram.org</p>
          <p>mentor1@maatram.org · applicant6@example.com</p>
          <p className="mt-1">Password: <code>Passw0rd!</code></p>
        </div>
      </div>
    </div>
  );
}
