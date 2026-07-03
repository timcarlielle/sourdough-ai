import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/AppLayout";
import { formatInUserTz } from "@/lib/timezone";
import Link from "next/link";

export default async function VoiceLogsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const logs = await prisma.voiceLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      source: true,
      recordedAt: true,
      text: true,
      status: true,
      error: true,
      bakeId: true,
      createdAt: true,
    },
  });

  const tz = session.user.timezone ?? "America/Edmonton";

  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold text-stone-800">Voice logs</h1>
      <p className="mt-1 text-sm text-stone-500">
        Siri and voice ingest entries. Click a row to see parsed intent and applied actions.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
              <th className="px-3 py-2">Recorded</th>
              <th className="px-3 py-2">Text</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Linked bake</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-stone-500">
                  No voice logs yet. Use Siri or the ingest API to log.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="px-3 py-2">
                    <Link href={`/voice-logs/${log.id}`} className="block text-stone-800 hover:underline">
                      {formatInUserTz(log.recordedAt, tz)}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate px-3 py-2" title={log.text}>
                    <Link href={`/voice-logs/${log.id}`} className="text-stone-700 hover:underline">
                      {log.text}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        log.status === "applied"
                          ? "rounded bg-green-100 px-1.5 py-0.5 text-green-800"
                          : log.status === "error"
                            ? "rounded bg-red-100 px-1.5 py-0.5 text-red-800"
                            : "rounded bg-amber-100 px-1.5 py-0.5 text-amber-800"
                      }
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{log.bakeId ? "Yes" : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
