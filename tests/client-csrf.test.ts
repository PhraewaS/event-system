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

for (const readKind of ["api", "collection"] as const) {
  test(`CLIENT-CSRF-${readKind === "api" ? "03" : "04"} expired ${readKind} read refreshes CSRF before first re-login`, async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent, Event });
    let bootstraps = 0;
    let logins = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/csrf") {
        return Response.json({ data: { csrfToken: `session-${++bootstraps}` } });
      }
      if (url.startsWith("/api/registrations/mine")) {
        return Response.json({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } }, { status: 401 });
      }
      if (url === "/api/auth/login") {
        logins++;
        if (new Headers(init?.headers).get("X-CSRF-Token") !== "session-2") {
          return Response.json({ error: { code: "CSRF_INVALID", message: "Obsolete session token." } }, { status: 403 });
        }
        return Response.json({ data: { user: { id: "participant", role: "PARTICIPANT" }, csrfToken: "rotated" } });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    const client = await import("../client/src/api.js");
    await client.bootstrap();
    await expect(client[readKind]("/registrations/mine")).rejects.toMatchObject({ status: 401 });
    expect(dispatchEvent).toHaveBeenCalledOnce();
    await expect(client.login("participant@example.test", "synthetic-password")).resolves.toMatchObject({ id: "participant" });
    expect(bootstraps).toBe(2);
    expect(logins).toBe(1);
  });
}

test("CLIENT-CSRF-05 invalid credentials do not expire identity or automatically retry login", async () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { dispatchEvent, Event });
  const fetcher = vi.fn(async (url: string) => url === "/api/auth/csrf"
    ? Response.json({ data: { csrfToken: "anonymous-token" } })
    : Response.json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } }, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  const client = await import("../client/src/api.js");
  await expect(client.login("participant@example.test", "incorrect-password")).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
  expect(dispatchEvent).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/login")).toHaveLength(1);
});
