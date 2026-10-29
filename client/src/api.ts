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
  event: Pick<
    Event,
    "id" | "title" | "location" | "startsAt" | "registrationDeadline"
  >;
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
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (options.method && options.method !== "GET" && !csrfToken)
    await bootstrap();
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/auth/me" &&
      path !== "/auth/login"
    )
      window.dispatchEvent(new window.Event("gather:expired"));
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
  const rows: T[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const response = await fetch(`/api${path}?offset=${offset}`, {
      credentials: "same-origin",
    });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401)
        window.dispatchEvent(new window.Event("gather:expired"));
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
  csrfInitialization ??= api<{ csrfToken: string }>("/auth/csrf")
    .then((result) => {
      csrfToken = result.csrfToken;
    })
    .finally(() => {
      csrfInitialization = null;
    });
  return csrfInitialization;
}
export async function login(email: string, password: string) {
  const result = await api<{ user: User; csrfToken: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  csrfToken = result.csrfToken;
  return result.user;
}
export async function logout() {
  await api("/auth/logout", { method: "POST", body: "{}" });
  csrfToken = null;
}
