import 'dotenv/config';
import {test,expect,type Page} from '@playwright/test';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {seed,demoIds} from '../../server/src/seed.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw new Error('Disposable *_test DB required');
const pool=new Pool({connectionString:url});const password='S2-capacity-browser-synthetic-password!';
test.beforeEach(async()=>{await pool.query('TRUNCATE registrations,events,users,session,login_rate_limits CASCADE');await seed(pool,password);});
test.afterAll(async()=>{await pool.end();});
async function login(page:Page,email:string){
 if(await page.getByRole('button',{name:'Sign out',exact:true}).count()){
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0);
 }
 await page.goto('/login');await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/events$/);
}
async function event(capacity=1){
 const id=randomUUID();const starts=new Date(Date.now()+40*86400000);
 await pool.query(`INSERT INTO events(id,organizer_id,title,description,location,capacity,starts_at,registration_deadline) VALUES($1,$2,$3,$4,'Capacity test room',$5,$6,$7)`,[id,demoIds.organizer,`Capacity ${id}`,'Synthetic owner capacity and participant workflow.',capacity,starts,new Date(+starts-86400000)]);
 return id;
}
async function reserve(page:Page,id:string){
 await page.goto(`/events/${id}`);await page.getByRole('button',{name:/^Reserve my place/}).click();await expect(page).toHaveURL(/\/my-registrations\?confirmed=/);
 await expect(page.getByText('Your place is confirmed. See you there!',{exact:true})).toBeVisible();
}
async function save(page:Page,value:string){
 await page.getByRole('spinbutton',{name:'Total capacity',exact:true}).fill(value);await page.getByRole('button',{name:'Save capacity',exact:true}).click();
}
test('S2-B-UI-01 / owner capacity, ACTIVE-only counts and unchanged participant quota persist across reloads',async({page},info)=>{
 const id=await event(),second=await event(),third=await event(5);
 await login(page,'participant@example.test');await reserve(page,id);await reserve(page,second);
 const original=(await pool.query('SELECT * FROM registrations WHERE event_id=$1',[id])).rows[0];
 await login(page,'organizer@example.test');await page.goto(`/organizer/events/${id}`);
 await expect(page.getByRole('form',{name:'Change event capacity'})).toBeVisible();await save(page,'3');
 await expect(page.getByText('Capacity updated. Registration counts have been refreshed.',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('spinbutton',{name:'Total capacity',exact:true})).toHaveValue('3');
 expect((await page.request.get(`/api/events/${id}`)).status()).toBe(200);
 await login(page,'participant@example.test');await page.goto(`/events/${third}`);
 await expect(page.getByTestId('daily-quota')).toContainText('2 / 2');await expect(page.getByRole('button',{name:'Daily registration limit reached',exact:true})).toBeDisabled();
 await expect(page.getByRole('form',{name:'Change event capacity'})).toHaveCount(0);
 const csrf=(await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
 expect((await page.request.patch(`/api/events/${id}/capacity`,{headers:{'X-CSRF-Token':csrf},data:{capacity:9}})).status()).toBe(403);
 const denied=await page.request.post(`/api/events/${third}/registrations`,{headers:{'X-CSRF-Token':csrf},data:{}});expect(denied.status()).toBe(409);expect((await denied.json()).error.code).toBe('DAILY_REGISTRATION_LIMIT');
 await login(page,'participant2@example.test');await reserve(page,id);
 await login(page,'organizer@example.test');await page.goto(`/organizer/events/${id}`);await expect(page.locator('tbody tr')).toHaveCount(2);
 await save(page,'1');await expect(page.getByRole('alert')).toContainText('Capacity cannot be lower than the number of active registrations.');
 await expect(page.getByRole('spinbutton',{name:'Total capacity',exact:true})).toHaveValue('3');
 expect((await pool.query('SELECT capacity FROM events WHERE id=$1',[id])).rows[0].capacity).toBe(3);
 await save(page,'2');await expect(page.getByText('Capacity updated. Registration counts have been refreshed.',{exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('tbody tr')).toHaveCount(2);
 await expect(page.getByRole('spinbutton',{name:'Total capacity',exact:true})).toHaveValue('2');
 const snapshot=(await (await page.request.get(`/api/events/${id}`)).json()).data;expect(snapshot).toMatchObject({capacity:2,registeredCount:2,remainingPlaces:0,registrationOpen:false});
 expect((await pool.query('SELECT * FROM registrations WHERE id=$1',[original.id])).rows[0]).toEqual(original);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/screenshots/s2-capacity-owner-${info.project.name}.png`,fullPage:true});
 await login(page,'participant@example.test');await page.goto('/my-registrations');
 const row=page.locator('.registration-row').filter({hasText:`Capacity ${id}`});await row.getByRole('button',{name:'Cancel registration',exact:true}).click();
 await expect(row.locator('.badge')).toHaveText('Cancelled');
 await login(page,'organizer@example.test');await page.goto(`/organizer/events/${id}`);await save(page,'1');
 await expect(page.getByText('Capacity updated. Registration counts have been refreshed.',{exact:true})).toBeVisible();await expect(page.locator('tbody tr')).toHaveCount(1);
 expect((await (await page.request.get(`/api/events/${id}`)).json()).data).toMatchObject({capacity:1,registeredCount:1,remainingPlaces:0});
 expect((await pool.query('SELECT id,status FROM registrations WHERE id=$1',[original.id])).rows[0]).toEqual({id:original.id,status:'CANCELLED'});
});
test('S2-B-UI-02 / server eligibility and stale deadline rejection preserve saved capacity',async({page},info)=>{
 const id=await event(5);await login(page,'organizer@example.test');await page.goto(`/organizer/events/${id}`);
 const button=page.getByRole('button',{name:'Save capacity',exact:true});await expect(button).toBeEnabled();
 await page.clock.setFixedTime(new Date(Date.now()+400*86400000));await page.reload();await expect(button).toBeEnabled();
 await pool.query('UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1',[id]);await save(page,'6');
 await expect(page.getByRole('alert')).toContainText('Capacity changes for this event have closed.');await expect(button).toBeDisabled();
 await expect(page.getByRole('spinbutton',{name:'Total capacity',exact:true})).toHaveValue('5');
 expect((await pool.query('SELECT capacity FROM events WHERE id=$1',[id])).rows[0].capacity).toBe(5);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/screenshots/s2-capacity-cutoff-${info.project.name}.png`,fullPage:true});
});
test('S2-B-UI-03 / delayed capacity response cannot navigate back or show success on another page',async({page})=>{
 const id=await event(5);await login(page,'organizer@example.test');await page.goto(`/organizer/events/${id}`);
 let release!:()=>void;const hold=new Promise<void>(r=>{release=r;});let arrived!:()=>void;const received=new Promise<void>(r=>{arrived=r;});
 let finish!:()=>void;const finished=new Promise<void>(r=>{finish=r;});
 await page.route('**/api/events/*/capacity',async route=>{try{const response=await route.fetch();arrived();await hold;await route.fulfill({response});}finally{finish();}});
 const response=page.waitForResponse(r=>r.url().endsWith('/capacity'));
 try{
  await save(page,'6');await received;await page.getByRole('link',{name:'← My events',exact:true}).click();await expect(page).toHaveURL(/\/organizer$/);
  release();await finished;await response;await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/organizer$/);await expect(page.getByText('Capacity updated. Registration counts have been refreshed.',{exact:true})).toHaveCount(0);
  expect((await pool.query('SELECT capacity FROM events WHERE id=$1',[id])).rows[0].capacity).toBe(6);
 }finally{release();}
});
