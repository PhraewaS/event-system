import { afterEach, expect, test, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
test("CLIENT-CSRF-01 concurrent initialization preserves the current session token for a protected mutation", async () => {
  vi.resetModules();
  let cookieToken = "";
  let serial = 0;
  let releaseFirst: (body: unknown) => void = () => {};
  const firstBody = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/csrf") {
        const requestNumber = ++serial;
        const token = `session-token-${requestNumber}`;
        cookieToken = token;
        return {
          ok: true,
          status: 200,
          json: () =>
            requestNumber === 1
              ? firstBody
              : Promise.resolve({ data: { csrfToken: token } }),
        };
      }
      const token = new Headers(init?.headers).get("X-CSRF-Token");
      return token === cookieToken
        ? new Response(JSON.stringify({ data: { id: "confirmed" } }), {
            status: 201,
          })
        : new Response(
            JSON.stringify({
              error: {
                code: "CSRF_INVALID",
                message: "Token belongs to an obsolete session.",
              },
            }),
            { status: 403 },
          );
    }),
  );
  const { bootstrap, api } = await import("../client/src/api.js");
  const first = bootstrap();
  const second = bootstrap();
  await new Promise((resolve) => setTimeout(resolve, 0));
  releaseFirst({ data: { csrfToken: "session-token-1" } });
  await Promise.all([first, second]);
  await expect(api("/events", { method: "POST", body: "{}" })).resolves.toEqual(
    { id: "confirmed" },
  );
});
test("CLIENT-CSRF-02 a failed initialization can be retried without retaining a rejected request", async () => {
  vi.resetModules();
  let attempt = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (++attempt === 1) throw new Error("Temporary network failure");
      return new Response(
        JSON.stringify({ data: { csrfToken: "recovered-token" } }),
        { status: 200 },
      );
    }),
  );
  const { bootstrap } = await import("../client/src/api.js");
  await expect(bootstrap()).rejects.toThrow("Temporary network failure");
  await expect(bootstrap()).resolves.toBeUndefined();
});
