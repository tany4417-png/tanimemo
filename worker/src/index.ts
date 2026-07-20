import { requireAuth } from "./auth";
import { handleSync } from "./sync";
import { handleAttachmentGet, handleAttachmentPut } from "./attachments";
import { handleShare } from "./share";

export interface Env {
  DB: D1Database;
  ATT: R2Bucket;
  API_TOKEN: string;
  ASSETS: Fetcher;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      const denied = requireAuth(req, env);
      if (denied) return denied;
      if (url.pathname === "/api/health") return Response.json({ ok: true });
      if (url.pathname === "/api/sync" && req.method === "POST") return handleSync(req, env);
      if (url.pathname === "/api/share" && req.method === "POST") return handleShare(req, env);
      const attMatch = url.pathname.match(/^\/api\/attachments\/([A-Za-z0-9]+)$/);
      if (attMatch && req.method === "GET") return handleAttachmentGet(attMatch[1], env);
      if (attMatch && req.method === "PUT") return handleAttachmentPut(attMatch[1], req, env);
      return new Response("not found", { status: 404 });
    }
    return env.ASSETS.fetch(req);
  },
};
