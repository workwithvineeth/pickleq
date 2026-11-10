import {expect,test} from '@playwright/test';
 import {assertContrast} from './contrast';
 test('Court Green defaults to Night and keeps Day flat, readable and saved',async({page})=>{
  test.setTimeout(180000);
  await page.route('https://*.supabase.co/**',r=>r.fulfill({json:[]}));
  await page.addInitScript(()=>{Object.defineProperty(navigator,'deviceMemory',{get:()=>8});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});});
  await page.emulateMedia({colorScheme:'light'});await page.goto('#/demo');
  await expect(page.locator('html')).toHaveAttribute('data-skin','court');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await page.locator('meta[name="theme-color"]').first().getAttribute('content')).toBe('#06140D');
  await page.getByLabel('Your name in the demo').fill('Alex');await page.getByRole('button',{name:'Open PQ Demo Club'}).click();
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  const header=page.getByRole('banner',{name:'Where you are'});
  for(const theme of ['dark','light'] as const)for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   if(width<600){await header.getByLabel('Account menu').click();await header.getByText('Settings',{exact:true}).click();}
   await header.getByRole('button',{name:theme==='dark'?'Dark':'Light',exact:true}).filter({visible:true}).click();
   if(width<600){await header.locator('.pq-theme-settings').evaluate(el=>el.removeAttribute('open'));await header.getByLabel('Account menu').click();}
   expect(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor)).toBe(theme==='dark'?'rgb(6, 20, 13)':'rgb(43, 110, 75)');
   const title=page.locator('#clubview-title');expect(await title.evaluate(el=>getComputedStyle(el).textTransform)).toBe('none');expect(await title.evaluate(el=>getComputedStyle(el).fontFamily)).toContain('Archivo');
   const filter=await page.locator('.pq-panel').first().evaluate(el=>getComputedStyle(el).backdropFilter);
   if(theme==='dark')expect(filter).toContain('blur(22px)');else expect(filter).toBe('none');
   await assertContrast(page.locator('.pill:visible,.pq-tag:visible,.btn-primary:visible,.pq-mini-btn:visible,.pq-kpi-value:visible,.pq-overview-greeting:visible,.pq-ws-item:not(:disabled):visible,.pq-theme-switch button:visible').filter({hasNot:page.locator('.ph')}));
   const create=page.getByRole('region',{name:'Your tournaments'}).getByRole('button',{name:'Create tournament',exact:true});
   await expect(create).toBeVisible();await assertContrast(create);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-skin','court');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('region',{name:'Your tournaments'}).getByRole('button',{name:/PQ Demo Open/}).click();await page.getByRole('button',{name:'Desk view',exact:true}).click();await page.getByRole('button',{name:/Results, walkovers and moves/}).click();await page.getByRole('button',{name:'Score',exact:true}).first().click();
  await assertContrast(page.locator('.score-tap-a .big'));await assertContrast(page.locator('.score-tap-b .big'));
 });
