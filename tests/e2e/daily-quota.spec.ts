import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { seed, demoIds } from "../../server/src/seed.js";
import { migrate } from "../../server/src/migrate.js";
const url = process.env.TEST_DATABASE_URL;
if(!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Disposable *_test DB required");
const pool = new Pool({connectionString:url});
const password = "Lab7-browser-synthetic-password!";
const day = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
const next = new Date(Date.parse(day)+86400000).toISOString().slice(0,10);
test.use({timezoneId:"UTC"});
test.beforeAll(async()=>{await migrate(pool);});
test.beforeEach(async()=>{
  await pool.query("TRUNCATE registrations,events,users,session,login_rate_limits CASCADE");
  await seed(pool,password);
});
test.afterAll(async()=>{await pool.end();});
async function login(page:Page,email="participant@example.test") {
  await page.goto("/login"); await page.getByLabel("Email address",{exact:true}).fill(email);
  await page.getByLabel("Password",{exact:true}).fill(password);
  await page.getByRole("button",{name:"Sign in",exact:true}).click(); await expect(page).toHaveURL(/\/events$/);
}
async function event(starts=`${day}T12:00:00+07:00`,description="A valid synthetic daily quota browser fixture.") {
  const id=randomUUID();
  await pool.query(`INSERT INTO events(id,organizer_id,title,description,location,capacity,starts_at,registration_deadline)
    VALUES($1,$2,$3,$4,'Quota room',10,$5,$6)`,[id,demoIds.organizer,`Quota ${id.slice(0,8)}`,description,starts,new Date(Date.parse(starts)-86400000).toISOString()]);
  return id;
}
async function saved(eventId:string,participant=demoIds.participant) {
  await pool.query("INSERT INTO registrations(id,event_id,participant_id) VALUES($1,$2,$3)",[randomUUID(),eventId,participant]);
}
async function overflow(page:Page) {expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test("L7-Q-UI-01 / Q11,Q13 two real reservations, third disabled, own record and next day",async({page},info)=>{
  // Exercise real publication form, then real Participant reservations.
  await login(page,"organizer@example.test");
  const ids:string[]=[];
  for(let i=0;i<3;i++) {
    await page.goto("/publish"); await page.getByLabel("Event title",{exact:true}).fill(`Lab7 UI ${i} ${info.project.name}`);
    await page.getByLabel("Description",{exact:true}).fill("Real publication and registration workflow for the quota rule.");
    await page.getByLabel("Location",{exact:true}).fill("Quota Room");
    await page.getByLabel("Event starts",{exact:true}).fill(`${day}T12:00`);
    await page.getByLabel("Registration deadline",{exact:true}).fill(`${day}T10:00`);
    await page.getByLabel("Capacity",{exact:true}).fill("10");
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/events"&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Publish event"}).click(); const res=await response; expect(res.status()).toBe(201); ids.push((await res.json()).data.id);
  }
  await page.getByRole("button",{name:"Sign out"}).click(); await login(page);
  for(const id of ids.slice(0,2)) {
    await page.goto(`/events/${id}`); await page.getByRole("button",{name:"Reserve my place"}).click();
    await expect(page.getByText("Your place is confirmed. See you there!",{exact:true})).toBeVisible();
  }
  await page.goto(`/events/${ids[2]}`); await expect(page.getByTestId("daily-quota")).toContainText("2 / 2");
  await expect(page.getByRole("button",{name:"Daily registration limit reached"})).toBeDisabled();
  await overflow(page); await page.screenshot({path:`artifacts/screenshots/lab7-quota-${info.project.name}.png`,fullPage:true});
  await page.goto(`/events/${ids[0]}`); await expect(page.getByRole("link",{name:"View my registration"})).toBeVisible();
  const tomorrow=await event(`${next}T12:00:00+07:00`); await page.goto(`/events/${tomorrow}`);
  await expect(page.getByRole("button",{name:"Reserve my place"})).toBeEnabled();
});
test("L7-Q-UI-02 / Q11,Q12 injected read failure/retry, stale POST and identity switch",async({page})=>{
  const a=await event(); await saved(a); const b=await event(); const c=await event();
  await login(page);
  // Explicit network fault injection; domain requests below still reach real API/DB.
  let release!:()=>void; const gate=new Promise<void>(r=>{release=r;});
  const pattern="**/api/registrations/quota?*";
  await page.route(pattern,async route=>{await gate; await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{code:"UNAVAILABLE",message:"Injected quota read failure"}})});});
  await page.goto(`/events/${c}`); await expect(page.getByRole("button",{name:"Checking daily quota"})).toBeDisabled();
  release(); await expect(page.getByRole("alert")).toContainText("Injected quota read failure");
  await page.unroute(pattern); await page.getByRole("button",{name:"Retry daily quota"}).click();
  await expect(page.getByRole("button",{name:"Reserve my place"})).toBeEnabled();
  // Simulate another session taking the last slot after this screen's snapshot.
  await saved(b);
  await page.getByRole("button",{name:"Reserve my place"}).click();
  await expect(page.getByRole("alert")).toContainText("at most 2 events");
  await expect(page.getByRole("button",{name:"Daily registration limit reached"})).toBeDisabled();
  await page.getByRole("button",{name:"Sign out"}).click(); await login(page,"participant2@example.test");
  await page.goto(`/events/${c}`); await expect(page.getByTestId("daily-quota")).toContainText("0 / 2");
  await expect(page.getByRole("button",{name:"Reserve my place"})).toBeEnabled();
  await page.getByRole("button",{name:"Sign out"}).click(); await login(page,"organizer2@example.test");
  const calls:string[]=[]; page.on("request",r=>{if(r.url().includes("/registrations/quota"))calls.push(r.url());});
  await page.goto(`/events/${c}`); await expect(page.getByText("Sign in with a Participant account to register.")).toBeVisible();
  expect(calls).toEqual([]);
});
test("L7-Q-UI-03 / Q13 legacy long description and own-record navigation preserved",async({page})=>{
  const id=await event(undefined,"D".repeat(3000)); await saved(id); await saved(await event()); await saved(await event());
  await login(page); await page.goto(`/events/${id}`);
  await expect(page.locator(".detail-description")).toHaveText("D".repeat(3000));
  await expect(page.getByRole("link",{name:"View my registration"})).toBeVisible(); await overflow(page);
  await page.getByRole("link",{name:"View my registration"}).click();
  await expect(page.locator(".registration-card")).toHaveCount(3);
});
test("L7-Q-UI-04 / Q04,Q11,Q13 UTC browser shows Thai day and requests matching quota around midnight",async({page},info)=>{
  const before=await event(`${day}T16:59:59.999Z`); const after=await event(`${day}T17:00:00.000Z`);
  await saved(await event());
  await saved(await event(`${day}T17:01:00.000Z`)); await saved(await event(`${next}T00:00:00.000Z`));
  await login(page);
  expect(await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe("UTC");
  for(const [id,date,count] of [[before,day,1],[after,next,2]] as const) {
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/registrations/quota");
    await page.goto(`/events/${id}`); const actual=await response; expect(actual.status()).toBe(200);
    expect(new URL(actual.url()).searchParams.get("date")).toBe(date);
    expect((await actual.json()).data).toMatchObject({date,registeredCount:count});
    await expect(page.getByTestId("daily-quota")).toContainText(`${date} (Asia/Bangkok): ${count} / 2`);
    await overflow(page);
  }
  await page.screenshot({path:`artifacts/screenshots/lab7-utc-${info.project.name}.png`,fullPage:true});
});
