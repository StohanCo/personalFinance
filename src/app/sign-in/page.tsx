import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import GitHubSignInButton from "@/components/GitHubSignInButton";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500">
            <span className="text-xl font-bold text-white">F</span>
          </div>
          <h1 className="text-2xl font-bold text-white">FinOps Tracker</h1>
          <p className="mt-2 text-sm text-slate-400">
            Financial operations for NZ contractors
          </p>
        </div>

        <GitHubSignInButton />

        <p className="mt-6 text-center text-xs text-slate-600">
          By signing in you agree to track your finances responsibly.
        </p>
      </div>
    </div>
  );
}
