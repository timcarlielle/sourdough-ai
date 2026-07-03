"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-stone-800">Log in</h1>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-stone-700">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-stone-700">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded bg-amber-800 py-2 text-white hover:bg-amber-900"
        >
          Log in
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-stone-600">
        No account? <Link href="/signup" className="text-amber-800 hover:underline">Sign up</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
