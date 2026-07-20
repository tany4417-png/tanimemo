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
      return new Response("not found", { status: 404 });
    }
    return env.ASSETS.fetch(req);
  },
};
