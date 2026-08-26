import { runHealthAgent } from "../../../../src/harness/runHealthAgent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const task = typeof body.task === "string" ? body.task.trim() : "";

    if (!task) {
      return Response.json({ error: "Передай непустую задачу." }, { status: 400 });
    }

    const result = await runHealthAgent(task);
    return Response.json(result);
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось запустить агента." },
      { status: 500 },
    );
  }
}
