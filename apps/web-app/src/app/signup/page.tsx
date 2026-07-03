"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Sign up failed.");
      return;
    }
    router.push("/login?signup=1");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-stone-800">Sign up</h1>
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
            <label htmlFor="password" className="block text-sm font-medium text-stone-700">Password (min 8)</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded bg-amber-800 py-2 text-white hover:bg-amber-900"
          >
            Sign up
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-stone-600">
          Already have an account? <Link href="/login" className="text-amber-800 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
