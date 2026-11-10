import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { migrate } from "../../server/scripts/migrate.js";
import { seed, demoIds } from "../../server/scripts/seed.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Integration browser tests require a disposable *_test database.");
const pool = new Pool({ connectionString: url });
const password = "Synthetic-integration-browser-2026!";

test.beforeAll(async () => {
  await migrate(pool);
  await pool.query("TRUNCATE registrations,events,users,session CASCADE");
  await seed(pool, password);
});
test.afterAll(async () => { await pool.end(); });

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const result = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const response = await result;
  expect(response.status()).toBe(200);
  expect((await response.json()).data.user.email).toBe(email);
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
async function signOut(page: Page) {
  const result = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/auth/logout" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign out" }).click();
  expect((await result).status()).toBe(204);
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("INT-UI-01 / AC-VER-02 competing reservations reconcile winner, loser and owner screens", async ({ page, browser }, info) => {
  const eventId = randomUUID();
  const title = `Integration last place ${info.project.name}`;
  await pool.query(`INSERT INTO events(id,organizer_id,title,description,location,capacity,starts_at,registration_deadline)
    VALUES($1,$2,$3,'Two real participant screens competing for the final place.','Integration studio',1,now()+interval '3 days',now()+interval '2 days')`,
    [eventId, demoIds.organizer, title]);
  const second = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    const other = await second.newPage();
    await signIn(page, "participant@example.test");
    await signIn(other, "participant2@example.test");
    await Promise.all([page.goto(`/events/${eventId}`), other.goto(`/events/${eventId}`)]);
    await expect(page.getByRole("button", { name: "Reserve my place" })).toBeEnabled();
    await expect(other.getByRole("button", { name: "Reserve my place" })).toBeEnabled();
    const resultFor = (p: Page) => p.waitForResponse(r => new URL(r.url()).pathname === `/api/events/${eventId}/registrations` && r.request().method() === "POST");
    const firstResult = resultFor(page);
    const secondResult = resultFor(other);
    // Both screens have loaded the open state; observe real requests, never stub their responses.
    await Promise.all([
      page.getByRole("button", { name: "Reserve my place" }).click(),
      other.getByRole("button", { name: "Reserve my place" }).click(),
    ]);
    const results = await Promise.all([firstResult, secondResult]);
    expect(results.map(r => r.status()).sort()).toEqual([201, 409]);
    const winnerIndex = results.findIndex(r => r.status() === 201);
    const winner = [page, other][winnerIndex];
    const loser = [page, other][1 - winnerIndex];
    const winnerId = [demoIds.participant, demoIds.participant2][winnerIndex];
    const winnerEmail = ["participant@example.test", "participant2@example.test"][winnerIndex];
    expect((await results[1 - winnerIndex].json()).error.code).toBe("EVENT_FULL");
    await expect(winner.getByText("Your place is confirmed. See you there!", { exact: true })).toBeVisible();
    await winner.reload();
    await expect(winner.getByRole("link", { name: title, exact: true })).toBeVisible();
    await expect(loser.getByRole("alert")).toHaveText("This event has no places left.");
    await expect(loser.getByRole("button", { name: "Registration unavailable", exact: true })).toBeDisabled();
    await expect(loser.getByText("Your place is confirmed. See you there!", { exact: true })).toHaveCount(0);
    const saved = await pool.query("SELECT participant_id FROM registrations WHERE event_id=$1", [eventId]);
    expect(saved.rows).toEqual([{ participant_id: winnerId }]);
    await noOverflow(winner);
    await noOverflow(loser);
    await loser.screenshot({ path: `artifacts/screenshots/last-place-loser-${info.project.name}.png`, fullPage: true });

    await signOut(page);
    await signIn(page, "organizer@example.test");
    await page.goto(`/organizer/events/${eventId}`);
    await expect(page.getByRole("cell", { name: winnerEmail, exact: true })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator(".roster-summary strong")).toHaveText(["1", "0", "1"]);
    await noOverflow(page);
  } finally { await second.close(); }
});

test("INT-UI-02 / AC-VER-03 discovery and owned screens consume actual second pages without foreign data", async ({ page }, info) => {
  const prefix = `Pagination integration ${info.project.name}`;
  await pool.query(`INSERT INTO events(id,organizer_id,title,description,location,capacity,starts_at,registration_deadline,created_at)
    SELECT gen_random_uuid(),$1,$2||' '||i,'Real fixtures beyond a single API page.','Pagination studio',2,
      now()+interval '3 days',now()+interval '2 days',timestamptz '2001-01-01 00:00:00+00'-i*interval '1 second'
    FROM generate_series(1,201) AS i`, [demoIds.organizer2, prefix]);
  const expected = await pool.query("SELECT id FROM events WHERE organizer_id=$1 ORDER BY id", [demoIds.organizer2]);
  expect(expected.rowCount).toBe(201);
  const foreign = await pool.query("SELECT id FROM events WHERE organizer_id=$1 ORDER BY id LIMIT 1", [demoIds.organizer]);
  expect(foreign.rowCount).toBe(1);
  const offsets: Record<string, number[]> = { public: [], owned: [] };
  page.on("response", response => {
    const requestUrl = new URL(response.url());
    const kind = requestUrl.pathname === "/api/events" ? "public"
      : requestUrl.pathname === "/api/organizer/events" ? "owned" : null;
    if (kind && response.status() === 200) offsets[kind].push(Number(requestUrl.searchParams.get("offset")));
  });
  await page.goto("/events");
  const target = `${prefix} 201`;
  await page.getByRole("textbox", { name: "Search events" }).fill(target);
  await expect(page.getByRole("link", { name: target, exact: true })).toBeVisible();
  expect(offsets.public).toEqual([0, 200]);
  await noOverflow(page);

  await signIn(page, "organizer2@example.test");
  await page.getByRole("link", { name: "My events", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(201);
  expect(offsets.owned).toEqual([0, 200]);
  const visibleIds = await page.locator(".event-card h2 a").evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).pathname.split("/").at(-1)));
  expect(visibleIds.slice().sort()).toEqual(expected.rows.map(row => row.id));
  expect(new Set(visibleIds).size).toBe(201);
  expect(visibleIds).not.toContain(foreign.rows[0].id);
  await noOverflow(page);
});
