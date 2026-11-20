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
test('RallyQ home: the phone hero shows the player, with photo buttons and no autoplay',async({page})=>{
 await page.route('https://*.supabase.co/**',r=>r.fulfill({json:[]}));await page.setViewportSize({width:390,height:844});await page.goto('#/home');
 const on=page.locator('.hero .slides .on');await expect(on).toHaveCount(1);
 expect(await on.evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('photos/mobile/hero-night-rally.jpg');
 await page.waitForTimeout(7500);expect(await on.evaluate(e=>e.className)).toContain('s0');
 await page.getByRole('button',{name:'Show photo 2 of 3'}).click();
 expect(await page.locator('.hero .slides .on').evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('photos/mobile/social-champions.jpg');
});
