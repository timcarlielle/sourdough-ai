import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { Dashboard } from "@/components/Dashboard";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    return (
      <AppLayout>
        <Dashboard />
      </AppLayout>
    );
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-semibold text-stone-800">Sourdough Monitoring</h1>
      <p className="mt-2 text-center text-stone-600">Track feedings, recipes, bakes, and sensor data.</p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/login"
          className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-900"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded border border-stone-300 bg-white px-4 py-2 text-stone-700 hover:bg-stone-50"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
