import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { seed } from "../../server/scripts/seed.js";
import { migrate } from "../../server/scripts/migrate.js";
const password = "Synthetic-browser-demo-2026!";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("E2E requires a disposable *_test database.");
const pool = new Pool({ connectionString: url });
test.beforeAll(async () => {
  await migrate(pool);
  await pool.query("TRUNCATE registrations,events,users,session CASCADE");
  await seed(pool, password);
});
test.afterAll(async () => {
  await pool.end();
});
async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("T-12 / AC-12 publish → register → persisted personal view → owner roster", async ({
  page,
  browser,
}, info) => {
  const title = `Sprint 1 community workshop ${info.project.name}`;
  await signIn(page, "organizer@example.test");
  await page
    .getByRole("link", { name: "Publish an event", exact: true })
    .click();
  await page.getByLabel("Event title", { exact: true }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("A hands-on community workshop for our Sprint 1 demonstration.");
  await page.getByLabel("Location", { exact: true }).fill("Campus studio A");
  await page
    .getByLabel("Event starts", { exact: true })
    .fill("2030-11-08T14:00");
  await page
    .getByLabel("Registration deadline", { exact: true })
    .fill("2030-11-07T14:00");
  await page.getByLabel("Capacity", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Publish event" }).click();
  await expect(
    page.getByText("Your event is published and ready for registrations."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  const rosterPath = new URL(page.url()).pathname;
  const eventId = rosterPath.split("/").at(-1)!;
  const participant = await browser.newContext({
    viewport: page.viewportSize()!,
  });
  const guest = await participant.newPage();
  await signIn(guest, "participant@example.test");
  await guest.goto(`/events/${eventId}`);
  await expect(
    guest.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await guest.getByRole("button", { name: "Reserve my place" }).click();
  await expect(
    guest.getByRole("heading", { name: "My registrations", exact: true }),
  ).toBeVisible();
  await expect(
    guest.getByText("Your place is confirmed. See you there!"),
  ).toBeVisible();
  await expect(
    guest.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
  await guest.reload();
  await expect(
    guest.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
  await noOverflow(guest);
  await guest.screenshot({
    path: `artifacts/screenshots/registrations-${info.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "participant@example.test", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/screenshots/roster-${info.project.name}.png`,
    fullPage: true,
  });
  await noOverflow(page);
  const second = await browser.newContext({ viewport: page.viewportSize()! });
  const other = await second.newPage();
  await signIn(other, "participant2@example.test");
  await other.goto(`/events/${eventId}`);
  await expect(
    other.getByRole("button", {
      name: "Registration unavailable",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(other.getByText("Fully booked", { exact: true })).toBeVisible();
  await participant.close();
  await second.close();
});

test("T-12 / AC-03,09,10,12 invalid login, role restrictions and ownership", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("participant@example.test");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Email or password is incorrect.",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Publish an event", exact: true }),
  ).toHaveCount(0);
  await page.goto("/publish");
  await expect(
    page.getByRole("heading", { name: "This space is for another role" }),
  ).toBeVisible();
  const forbidden = await page.request.post("/api/events", { data: {} });
  expect(forbidden.status()).toBe(403);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: false }),
  ).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  await signIn(page, "organizer2@example.test");
  await page.goto("/organizer/events/20000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("alert")).toContainText("Event not found.");
  expect(
    (
      await page.request.get(
        "/api/events/20000000-0000-4000-8000-000000000001/registrations",
      )
    ).status(),
  ).toBe(404);
});

test("T-12 / AC-05,07,12 discovery, validation and closed event states", async ({
  page,
}, info) => {
  await page.goto("/events");
  await expect(
    page.getByRole("heading", { name: "What’s coming up" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search events" })
    .fill("no-event-matches-this-query");
  await expect(
    page.getByRole("heading", { name: "No events match just yet" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search events" }).fill("");
  await noOverflow(page);
  await page.screenshot({
    path: `artifacts/screenshots/discover-${info.project.name}.png`,
    fullPage: true,
  });
  await signIn(page, "organizer@example.test");
  await page.goto("/publish");
  await page
    .getByLabel("Event title", { exact: true })
    .fill("Invalid deadline demonstration");
  await page
    .getByLabel("Description", { exact: true })
    .fill("This event must reject a deadline after the event starts.");
  await page.getByLabel("Location", { exact: true }).fill("Campus A");
  await page
    .getByLabel("Event starts", { exact: true })
    .fill("2030-11-08T14:00");
  await page
    .getByLabel("Registration deadline", { exact: true })
    .fill("2030-11-09T14:00");
  await page.getByLabel("Capacity", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Publish event" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Registration must close no later than the event starts.",
  );
  await noOverflow(page);
  await pool.query(
    "UPDATE events SET registration_deadline=now()-interval '1 hour' WHERE id='20000000-0000-4000-8000-000000000003'",
  );
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, "participant@example.test");
  await page.goto("/events/20000000-0000-4000-8000-000000000003");
  await expect(
    page.getByText("Registration closed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Registration unavailable", exact: true }),
  ).toBeDisabled();
});
