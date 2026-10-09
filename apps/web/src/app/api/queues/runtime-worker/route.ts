import { QueueClient } from "@vercel/queue";
import { NextRequest } from "next/server";
import { POST as runRuntimeWorker } from "@/app/api/cron/runtime-worker/route";
import { processRuntimeWorkerWakeMessage } from "@/lib/runtime/workerQueue";

export const runtime = "nodejs";
export const maxDuration = 300;

const queue = new QueueClient({ region: process.env.VERCEL_REGION ?? "iad1" });

export const POST = queue.handleCallback(async (message: unknown) => {
  await processRuntimeWorkerWakeMessage(message, async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error("RUNTIME_WORKER_CRON_SECRET_MISSING");

    // Reuse the existing protected worker handler directly: no public self-call,
    // no SSO bypass, and no alternate path around its bearer authorization.
    const request = new NextRequest("https://plutao.internal/api/cron/runtime-worker", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    return runRuntimeWorker(request);
  });
});
