import 'dotenv/config';
import {test,expect,type Page} from '@playwright/test';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {seed,demoIds} from '../../server/src/seed.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw new Error('Disposable test DB required');
const pool=new Pool({connectionString:url});const password='S2-browser-synthetic-password!';
test.beforeEach(async()=>{await pool.query('TRUNCATE registrations,events,users,session,login_rate_limits CASCADE');await seed(pool,password);});
test.afterAll(async()=>{await pool.end();});
async function login(page:Page,email='participant@example.test'){
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0);
 await page.goto('/login');await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/events$/);
}
async function event(){
 const id=randomUUID();const starts=new Date(Date.now()+40*86400000);
 await pool.query(`INSERT INTO events(id,organizer_id,title,description,location,capacity,starts_at,registration_deadline) VALUES($1,$2,$3,$4,'S2 room',1,$5,$6)`,[id,demoIds.organizer,`S2 ${id}`,'Synthetic UI cancellation and reactivation fixture.',starts,new Date(+starts-86400000)]);
 return id;
}
test('S2-A-UI-01 / cancel, reload, reactivate same row and reconcile owner/own/quota',async({page},info)=>{
 const a=await event();const b=await event();await login(page);
 for(const id of [a,b]){await page.goto(`/events/${id}`);await page.getByRole('button',{name:/^Reserve my place/}).click();await expect(page.getByText('Your place is confirmed. See you there!',{exact:true})).toBeVisible();}
 const saved=(await pool.query('SELECT id,created_at FROM registrations WHERE event_id=$1 AND participant_id=$2',[a,demoIds.participant])).rows[0];
 let row=page.locator('.registration-row').filter({hasText:`S2 ${a}`});
 await row.getByRole('button',{name:'Cancel registration',exact:true}).click();
 await expect(page.getByText('Registration cancelled. Your place has been released.',{exact:true})).toBeVisible();
 await page.reload();row=page.locator('.registration-row').filter({hasText:`S2 ${a}`});await expect(row.locator('.badge')).toHaveText('Cancelled');await expect(row).toContainText(saved.id);
 await page.screenshot({path:`artifacts/screenshots/s2-cancelled-${info.project.name}.png`,fullPage:true});
 await page.goto(`/events/${a}`);await expect(page.getByTestId('daily-quota')).toContainText('1 / 2');
 await expect(page.getByRole('button',{name:/^Reserve my place/})).toBeEnabled();
 await page.getByRole('button',{name:/^Reserve my place/}).click();await expect(page).toHaveURL(/my-registrations\?confirmed=/);
 row=page.locator('.registration-row').filter({hasText:`S2 ${a}`});await expect(row.locator('.badge')).toHaveText('Confirmed');await expect(row).toContainText(saved.id);
 const persisted=(await pool.query('SELECT id,created_at,status FROM registrations WHERE event_id=$1 AND participant_id=$2',[a,demoIds.participant])).rows;
 expect(persisted).toEqual([{...saved,status:'ACTIVE'}]);
 expect((await page.request.get(`/api/events/${a}/registrations`)).status()).toBe(403);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await login(page,'organizer@example.test');
 await page.goto(`/organizer/events/${a}`);await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody')).toContainText('participant@example.test');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/screenshots/s2-reactivated-owner-${info.project.name}.png`,fullPage:true});
});
test('S2-A-UI-02 / stale cancel crossing deadline shows rejection and leaves persisted ACTIVE state',async({page},info)=>{
 const id=await event();await login(page);await page.goto(`/events/${id}`);await page.getByRole('button',{name:/^Reserve my place/}).click();
 const cancel=page.getByRole('button',{name:'Cancel registration',exact:true});await expect(cancel).toBeVisible();
 const before=(await pool.query('SELECT * FROM registrations WHERE event_id=$1',[id])).rows;
 await pool.query('UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1',[id]);
 await cancel.click();await expect(page.getByRole('alert')).toContainText('Cancellation for this event has closed.');
 expect((await pool.query('SELECT * FROM registrations WHERE event_id=$1',[id])).rows).toEqual(before);
 await expect(page.locator('.registration-row .badge')).toHaveText('Confirmed');
 await expect(page.getByRole('button',{name:'Cancel registration',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/screenshots/s2-cutoff-rejected-${info.project.name}.png`,fullPage:true});
});
