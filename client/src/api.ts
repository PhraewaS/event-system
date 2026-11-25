export type User = {
  id: string;
  email: string;
  name: string;
  role: "PARTICIPANT" | "ORGANIZER";
};
export type Event = {
  id: string;
  organizerId: string;
  organizerName: string;
  title: string;
  description: string;
  location: string;
  capacity: number;
  startsAt: string;
  registrationDeadline: string;
  registeredCount: number;
  remainingPlaces: number;
  registrationOpen: boolean;
};
export type Registration = {
  id: string;
  participantId: string;
  createdAt: string;
  status: "ACTIVE" | "CANCELLED";
  registeredAt: string;
  cancelledAt: string | null;
  canCancel: boolean;
  event: Pick<
    Event,
    "id" | "title" | "location" | "startsAt" | "registrationDeadline"
  >;
};
export type DailyQuota = {
  date: string;
  timeZone: "Asia/Bangkok";
  limit: number;
  registeredCount: number;
  remaining: number;
  canRegister: boolean;
};
export type RosterEntry = {
  id: string;
  createdAt: string;
  participant: { id: string; name: string; email: string };
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
let csrfToken: string | null = null;
let csrfInitialization: Promise<void> | null = null;
// Component cleanup alone cannot guard global expiry/CSRF side effects.
// Every request belongs to one session generation, including paginated reads.
let sessionGeneration = 0;
function assertCurrentSession(generation: number) {
  if (generation !== sessionGeneration)
    throw new ApiError(409, "STALE_SESSION_RESPONSE", "The session changed while this request was in progress.");
}
function expireSession() {
  sessionGeneration++;
  csrfToken = null;
  csrfInitialization = null;
  window.dispatchEvent(new window.Event("gather:expired"));
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const generation = sessionGeneration;
  if (options.method && options.method !== "GET" && !csrfToken)
    await bootstrap();
  assertCurrentSession(generation);
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) {
    assertCurrentSession(generation);
    return undefined as T;
  }
  const body = await response.json();
  // Check before returning data or clearing tokens/dispatching global events.
  assertCurrentSession(generation);
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/auth/me" &&
      path !== "/auth/login"
    ) {
      expireSession();
    }
    if (body.error?.code === "CSRF_INVALID") csrfToken = null;
    const fields = body.error?.fields
      ?.map(
        (f: { field: string; message: string }) => `${f.field}: ${f.message}`,
      )
      .join(" ");
    throw new ApiError(
      response.status,
      body.error?.code ?? "REQUEST_FAILED",
      fields || body.error?.message || "Request failed.",
    );
  }
  return body.data as T;
}
export async function collection<T>(path: string): Promise<T[]> {
  const generation = sessionGeneration;
  const rows: T[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    assertCurrentSession(generation);
    const response = await fetch(`/api${path}?offset=${offset}`, {
      credentials: "same-origin",
    });
    const body = await response.json();
    assertCurrentSession(generation);
    if (!response.ok) {
      if (response.status === 401) {
        expireSession();
      }
      throw new ApiError(
        response.status,
        body.error?.code,
        body.error?.message || "Unable to load records.",
      );
    }
    rows.push(...body.data);
    offset = body.page.nextOffset;
  }
  return rows;
}
export function bootstrap(): Promise<void> {
  // Repeated startup effects must share one session/token initialization.
  if (csrfInitialization) return csrfInitialization;
  const generation = sessionGeneration;
  const pending = api<{ csrfToken: string }>("/auth/csrf")
    .then((result) => {
      assertCurrentSession(generation);
      csrfToken = result.csrfToken;
    })
    .finally(() => {
      if (csrfInitialization === pending) csrfInitialization = null;
    });
  csrfInitialization = pending;
  return pending;
}
export async function login(email: string, password: string) {
  const generation = ++sessionGeneration;
  csrfInitialization = null;
  const result = await api<{ user: User; csrfToken: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assertCurrentSession(generation);
  csrfToken = result.csrfToken;
  return result.user;
}
export async function logout() {
  const generation = ++sessionGeneration;
  csrfInitialization = null;
  await api("/auth/logout", { method: "POST", body: "{}" });
  assertCurrentSession(generation);
  csrfToken = null;
}
