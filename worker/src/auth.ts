import type { Env } from "./index";

export function requireAuth(req: Request, env: Env): Response | null {
  if (!env.API_TOKEN) return new Response("server misconfigured", { status: 500 });
  const auth = req.headers.get("Authorization") ?? "";
  if (auth === `Bearer ${env.API_TOKEN}`) return null;
  return new Response("unauthorized", { status: 401 });
}
