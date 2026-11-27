import {expect,test} from '@playwright/test';
const IDS=['coming','first','clubs'];
test('RallyQ home: one-screen hero, its sections, no made-up numbers, phone sizing and Night/Day',async({page})=>{
 await page.route('https://*.supabase.co/**',r=>r.fulfill({json:[]}));await page.emulateMedia({reducedMotion:'reduce'});await page.goto('#/home');
 await expect(page.getByRole('heading',{level:1,name:'Your court. The main event.'})).toBeVisible();
 for(const name of ['On the calendar.','You played it. Now you own the story.','Scored live, point by point.','Give players a reason to choose your court.'])await expect(page.getByRole('heading',{level:2,name})).toHaveCount(1);
 for(const id of IDS)await expect(page.locator('#'+id)).toHaveCount(1);
 // The hero is one screen with one button, and the generated photos say so.
 await expect(page.locator('.hero').getByRole('link',{name:/See (live scores|event details|events|results)/})).toHaveCount(1);
 await expect(page.locator('.hero').getByText('Illustration')).toBeVisible();
 // Real pilot totals only; none of the old sample figures.
 for(const t of ['37','60','1,003'])await expect(page.getByText(t,{exact:true}).first()).toBeVisible();
 const body=await page.locator('body').innerText();
 for(const fake of ['420','1,180','6 clubs','following','(sample)','Rao / Iyer'])expect(body).not.toContain(fake);
 for(const width of [320,390,870,1280]){await page.setViewportSize({width,height:900});await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.setViewportSize({width:390,height:900});await page.evaluate(()=>scrollTo(0,0));
 await page.getByRole('button',{name:'Switch to day mode'}).first().click();await expect(page.getByRole('button',{name:'Switch to night mode'}).first()).toBeVisible();
 await page.getByRole('button',{name:'Switch to night mode'}).first().click();await expect(page.getByRole('button',{name:'Switch to day mode'}).first()).toBeVisible();
});
test('RallyQ home: top menu scrolls to each section, clears the header and highlights the active link',async({page})=>{
 await page.route('https://*.supabase.co/**',r=>r.fulfill({json:[]}));await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:1280,height:800});await page.goto('#/home');
 const nav=page.getByRole('navigation',{name:'Main'});
 for(const [label,id] of [['On the calendar','coming'],['Player Studio','first'],['For clubs','clubs']]){
  await nav.getByRole('link',{name:label}).click();
  await expect.poll(()=>page.evaluate(i=>Math.round(document.getElementById(i)!.getBoundingClientRect().top),id),{timeout:5000}).toBeLessThan(120);
  // Never hidden behind the fixed header: the section starts below it.
  expect(await page.evaluate(i=>document.getElementById(i)!.getBoundingClientRect().top,id)).toBeGreaterThanOrEqual(60);
  await expect(nav.getByRole('link',{name:label})).toHaveClass(/\bon\b/);
 }
 await expect(nav.locator('a.on')).toHaveCount(1);
 await page.evaluate(()=>scrollTo(0,0));await expect(nav.locator('a.on')).toHaveCount(0);
});
test('RallyQ home: the phone hero shows the player, with photo buttons, and the photos change by themselves',async({page})=>{
 await page.route('https://*.supabase.co/**',r=>r.fulfill({json:[]}));await page.setViewportSize({width:390,height:844});await page.goto('#/home');
 const on=page.locator('.hero .slides .on');await expect(on).toHaveCount(1);
 expect(await on.evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('photos/mobile/hero-night-rally.jpg');
 // Every 6.5 s the next photo fades in.
 await expect(page.locator('.hero .slides .s1.on')).toHaveCount(1,{timeout:9000});
 await page.getByRole('button',{name:'Show photo 2 of 3'}).click();
 expect(await page.locator('.hero .slides .on').evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('photos/mobile/social-champions.jpg');
});
test('RallyQ home: with reduced motion the hero photos stay put',async({page})=>{
 await page.route('https://*.supabase.co/**',r=>r.fulfill({json:[]}));await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await page.goto('#/home');
 await expect(page.locator('.hero .slides .s0.on')).toHaveCount(1);
 await page.waitForTimeout(7500);await expect(page.locator('.hero .slides .s0.on')).toHaveCount(1);
});
test('RallyQ logo always leads back to Home from public pages',async({page})=>{
 await page.route('https://*.supabase.co/**',r=>r.fulfill({json:[]}));await page.setViewportSize({width:390,height:844});
 for(const r of ['#/events','#/live','#/club-signin']){await page.goto(r);await page.getByRole('link',{name:/RallyQ/}).locator('visible=true').first().click();await expect(page).toHaveURL(/#\/home$/);await expect(page.getByRole('heading',{level:1,name:'Your court. The main event.'})).toBeVisible();}
});
test('RallyQ home: Live now shows the big court scoreboard with DUPR, score, freshness and win chance',async({page})=>{
 const today=new Date().toISOString().slice(0,10),format={bestOf:1,pointsTo:11,scoring:'rally'};
 await page.route('https://*.supabase.co/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/public_events'))return route.fulfill({json:[{slug:'home-board',name:'Sample Night Open',club:'Cedar Paddle Club',start_date:today,start_time:'15:00',city:'Hyderabad',status:'live',results:true,listing:'listed',divisions:[]}]});
  if(path.endsWith('/public_tournament'))return route.fulfill({json:{name:'Sample Night Open',club:'Cedar Paddle Club',start_date:today,start_time:'15:00',slot_minutes:20,status:'live',
   divisions:[{id:'d',name:'Open singles',kind:'singles',pools:1,advance:0,format:{pool:format,ko:format}}],
   entries:[['Alex Rao',4.52],['Sam Iyer',3.97],['Robin Das',null],['Taylor Jain',null]].map(([n,r],i)=>({id:'e'+i,division_id:'d',pool:1,names:[n],duprs:[r]})),
   matches:[{id:'m1',division_id:'d',court:1,entry_a:'e0',entry_b:'e1',stage:'pool',pool:1,status:'live',games:[{a:7,b:2}]},{id:'m2',division_id:'d',court:2,entry_a:'e2',entry_b:'e3',stage:'pool',pool:1,status:'live',games:[{a:3,b:5}]}]}});
  return route.fulfill({json:path.endsWith('/public_club_logo')?null:[]});
 });
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const width of [320,1280]){
  await page.setViewportSize({width,height:900});await page.goto('#/home');
  const board=page.getByRole('region',{name:'Court 1 scoreboard'});
  await expect(board).toContainText('Court 1 · Cedar Paddle Club · Open singles');
  await expect(board).toContainText('One game · to 11');
  await expect(board.getByLabel('Alex Rao 4.52 points')).toHaveText('7');
  await expect(board.getByLabel('Sam Iyer 3.97 points')).toHaveText('2');
  await expect(board).toContainText(/Updated \d+s ago · scored by court referee/);
  await expect(board.getByRole('img',{name:/Win chance · estimate: Alex \d+%, Sam \d+%/})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 // Tap another court: it takes the big board.
 await page.getByRole('button',{name:/Show Court 2 on the big scoreboard/}).click();
 const two=page.getByRole('region',{name:'Court 2 scoreboard'});
 await expect(two.getByLabel('Taylor Jain points')).toHaveText('5');
 await expect(page.getByRole('button',{name:/Show Court 2 on the big scoreboard/})).toHaveAttribute('aria-pressed','true');
});
