import {expect,test} from '@playwright/test';
test('RallyQ home: seven sections, phone sizing and the Night/Day switch',async({page})=>{
 await page.route('https://*.supabase.co/**',r=>r.fulfill({json:[]}));await page.emulateMedia({reducedMotion:'reduce'});await page.goto('#/home');
 await expect(page.getByRole('heading',{level:1,name:'Your court. The main event.'})).toBeVisible();
 for(const name of ['Every point, as it happens.','Your game, with a pro\'s profile.','Your venue, presented like a stadium.','From entries to final in one desk.','The city\'s home of pickleball.','This month on court.','Match day lives on your phone.'])await expect(page.getByRole('heading',{level:2,name})).toHaveCount(1);
 await expect(page.getByText(/Match intelligence/i)).toHaveCount(0);
 for(const width of [320,390,870,1440]){await page.setViewportSize({width,height:900});await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.setViewportSize({width:390,height:900});await page.evaluate(()=>scrollTo(0,0));
 await page.getByRole('button',{name:'Switch to day mode'}).first().click();await expect(page.getByRole('button',{name:'Switch to night mode'}).first()).toBeVisible();
 await page.getByRole('button',{name:'Switch to night mode'}).first().click();await expect(page.getByRole('button',{name:'Switch to day mode'}).first()).toBeVisible();
});
