import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "crm-state";
const KEY = "state";

type CustomAccount = {
  id: string;
  n: string;
  loc?: string;
  buyer?: string;
  potential?: string;
  addedAt: string;
};

type AccountFields = {
  n?: string;
  loc?: string;
  buyer?: string;
  potential?: string;
};

type State = {
  reviews: Record<string, "accept" | "reject">;
  edits: Record<
    string,
    {
      notes?: string;
      visits?: { date: string; who?: string; note?: string }[];
      fields?: AccountFields;
    }
  >;
  customAccounts: CustomAccount[];
};

function emptyState(): State {
  return { reviews: {}, edits: {}, customAccounts: [] };
}

export default async (req: Request, context: Context) => {
  const store = getStore(STORE_NAME);

  if (req.method === "GET") {
    const current = (await store.get(KEY, { type: "json" })) as State | null;
    const safe = current || emptyState();
    safe.customAccounts = safe.customAccounts || [];
    return new Response(JSON.stringify(safe), {
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
    current.customAccounts = current.customAccounts || [];

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
    } else if (action === "addAccount") {
      const { name, loc, buyer, potential, notes } = body;
      const trimmedName = typeof name === "string" ? name.trim() : "";
      if (!trimmedName) {
        return new Response(JSON.stringify({ error: "Account name is required" }), { status: 400 });
      }
      const dup = current.customAccounts.some((c) => c.n.toLowerCase() === trimmedName.toLowerCase());
      if (dup) {
        return new Response(JSON.stringify({ error: "An account with this name already exists" }), { status: 400 });
      }
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      current.customAccounts.push({
        id,
        n: trimmedName,
        loc: (loc || "").trim(),
        buyer: (buyer || "").trim(),
        potential: (potential || "").trim(),
        addedAt: new Date().toISOString(),
      });
      if (notes && String(notes).trim()) {
        current.edits[trimmedName] = current.edits[trimmedName] || {};
        current.edits[trimmedName].notes = String(notes).trim();
      }
    } else if (action === "setFields") {
      const { account, fields } = body;
      if (!account) return new Response(JSON.stringify({ error: "Missing account" }), { status: 400 });
      current.edits[account] = current.edits[account] || {};
      if (fields === null) {
        delete current.edits[account].fields;
      } else {
        const name = typeof fields?.n === "string" ? fields.n.trim() : "";
        if (!name) {
          return new Response(JSON.stringify({ error: "Account name cannot be blank" }), { status: 400 });
        }
        current.edits[account].fields = {
          n: name,
          loc: typeof fields.loc === "string" ? fields.loc.trim() : "",
          buyer: typeof fields.buyer === "string" ? fields.buyer.trim() : "",
          potential: typeof fields.potential === "string" ? fields.potential.trim() : "",
        };
      }
    } else if (action === "deleteAccount") {
      const { id } = body;
      if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });
      current.customAccounts = current.customAccounts.filter((c) => c.id !== id);
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
