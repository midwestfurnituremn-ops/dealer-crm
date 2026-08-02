import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "crm-state";
const KEY = "state";

type State = {
  reviews: Record<string, "accept" | "reject">;
  edits: Record<string, { notes?: string; visits?: { date: string; who?: string; note?: string }[] }>;
};

function emptyState(): State {
  return { reviews: {}, edits: {} };
}

export default async (req: Request, context: Context) => {
  const store = getStore(STORE_NAME);

  if (req.method === "GET") {
    const current = (await store.get(KEY, { type: "json" })) as State | null;
    return new Response(JSON.stringify(current || emptyState()), {
      headers: { "content-type": "application/json" },
    });
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
    }

    const current = ((await store.get(KEY, { type: "json" })) as State | null) || emptyState();

    const action = body.action;
    if (action === "setReview") {
      const { key, value } = body;
      if (!key) return new Response(JSON.stringify({ error: "Missing key" }), { status: 400 });
      if (value === null) {
        delete current.reviews[key];
      } else {
        current.reviews[key] = value;
      }
    } else if (action === "setNotes") {
      const { account, notes } = body;
      if (!account) return new Response(JSON.stringify({ error: "Missing account" }), { status: 400 });
      current.edits[account] = current.edits[account] || {};
      current.edits[account].notes = notes || "";
    } else if (action === "addVisit") {
      const { account, date, who, note } = body;
      if (!account || !date) return new Response(JSON.stringify({ error: "Missing account or date" }), { status: 400 });
      current.edits[account] = current.edits[account] || {};
      current.edits[account].visits = current.edits[account].visits || [];
      current.edits[account].visits!.unshift({ date, who: who || "", note: note || "" });
    } else if (action === "deleteVisit") {
      const { account, index } = body;
      if (!account || typeof index !== "number") {
        return new Response(JSON.stringify({ error: "Missing account or index" }), { status: 400 });
      }
      if (current.edits[account]?.visits) {
        current.edits[account].visits!.splice(index, 1);
      }
    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 });
    }

    await store.setJSON(KEY, current);
    return new Response(JSON.stringify(current), { headers: { "content-type": "application/json" } });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/state",
};
