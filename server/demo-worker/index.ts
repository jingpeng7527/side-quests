import { handleCrossCityDemo, handleDemoCities, type DemoEnv } from "../src/demo/route";

/**
 * A dedicated Worker for the standalone cross-city quest demo — separate from the real
 * game's Worker (server/src/index.ts) and its deployment. Same demo code, own URL.
 */
export default {
  async fetch(request: Request, env: DemoEnv): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] === "api" && parts[1] === "demo" && parts[2] === "cities") return handleDemoCities();

    if (parts[0] === "api" && parts[1] === "demo" && parts[2] === "cross-city") {
      const a = url.searchParams.get("a");
      const b = url.searchParams.get("b");
      return handleCrossCityDemo(env, a && b ? [a, b] : undefined);
    }

    if (parts.length === 0) return Response.redirect(`${url.origin}/demo-cities`, 302);

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<DemoEnv>;
