import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/AppLayout";
import { formatInUserTz } from "@/lib/timezone";
import Link from "next/link";
import { RerunParseButton } from "./RerunParseButton";

export default async function VoiceLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const id = (await params).id;

  const log = await prisma.voiceLog.findFirst({
    where: { id, userId: session.user.id },
    include: { bake: { select: { id: true, startedAt: true, recipe: { select: { title: true } } } } },
  });
  if (!log) notFound();

  const tz = session.user.timezone ?? "America/Edmonton";

  return (
    <AppLayout>
      <div className="flex items-center gap-4">
        <Link href="/voice-logs" className="text-stone-600 hover:text-stone-900">
          ← Voice logs
        </Link>
      </div>
      <div className="mt-6 space-y-6">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h1 className="text-lg font-medium text-stone-800">Voice log</h1>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-stone-500">Recorded</dt>
            <dd>{formatInUserTz(log.recordedAt, tz)}</dd>
            <dt className="text-stone-500">Received</dt>
            <dd>{formatInUserTz(log.receivedAt, tz)}</dd>
            <dt className="text-stone-500">Source</dt>
            <dd>{log.source}</dd>
            <dt className="text-stone-500">Status</dt>
            <dd>
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
            </dd>
            {log.error && (
              <>
                <dt className="text-stone-500">Error</dt>
                <dd className="text-red-700">{log.error}</dd>
              </>
            )}
            {log.bakeId && log.bake && (
              <>
                <dt className="text-stone-500">Linked bake</dt>
                <dd>
                  <Link
                    href={`/bakes/${log.bake.id}`}
                    className="text-amber-800 hover:underline"
                  >
                    {log.bake.recipe?.title ?? log.bake.id} — {formatInUserTz(log.bake.startedAt, tz)}
                  </Link>
                </dd>
              </>
            )}
            {log.intentType != null && (
              <>
                <dt className="text-stone-500">Intent</dt>
                <dd>{log.intentType}</dd>
              </>
            )}
            {log.processedAt != null && (
              <>
                <dt className="text-stone-500">Processed</dt>
                <dd>{formatInUserTz(log.processedAt, tz)}</dd>
              </>
            )}
          </dl>
          {log.responseText != null && log.responseText.length > 0 && (
            <div className="mt-3 rounded border border-amber-100 bg-amber-50/50 p-3">
              <p className="text-xs font-medium text-stone-500">Response (read aloud)</p>
              <p className="mt-1 text-sm text-stone-800">{log.responseText}</p>
            </div>
          )}
          <div className="mt-3">
            <p className="text-xs font-medium text-stone-500">Raw text</p>
            <p className="mt-1 rounded bg-stone-50 p-2 text-sm text-stone-800">{log.text}</p>
          </div>
          <div className="mt-3 flex gap-2">
            <RerunParseButton voiceLogId={log.id} status={log.status} />
          </div>
        </div>

        {log.llmResponse != null && (
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="text-sm font-medium text-stone-700">Parsed intent (LLM response)</h2>
            <pre className="mt-2 max-h-96 overflow-auto rounded bg-stone-50 p-3 text-xs text-stone-700">
              {JSON.stringify(log.llmResponse, null, 2)}
            </pre>
          </div>
        )}

        {log.appliedActions != null && (
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="text-sm font-medium text-stone-700">Applied actions</h2>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-stone-50 p-3 text-xs text-stone-700">
              {JSON.stringify(log.appliedActions, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
