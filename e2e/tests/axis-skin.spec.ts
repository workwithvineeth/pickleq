import {expect,test} from '@playwright/test';
import {assertContrast} from './contrast';
for(const skin of ['axis','maroon'])for(const theme of ['light','dark'])test('skin '+skin+' / '+theme+': contrast, display type and saved preference',async({page})=>{
 await page.route('https://*.supabase.co/**',r=>r.fulfill({json:[]}));
 await page.addInitScript(()=>{Object.defineProperty(navigator,'deviceMemory',{get:()=>8});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});});
 await page.goto('#/demo');await page.getByLabel('Your name in the demo').fill('Alex');await page.getByRole('button',{name:'Open PQ Demo Club'}).click();
 const header=page.getByRole('banner',{name:'Where you are'});
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme==='light'?'dark':'light'});
  if(width<600)await header.locator('.pq-account-menu').evaluate(el=>el.setAttribute('open',''));
  if(width<870)await header.locator('.pq-theme-settings').evaluate(el=>el.setAttribute('open',''));
  if(width<870)await header.getByLabel('Colour skin').filter({visible:true}).selectOption(skin);
  await header.getByRole('button',{name:theme==='light'?'Light':'Dark',exact:true}).filter({visible:true}).click();
  if(width<870)await header.locator('.pq-theme-settings').evaluate(el=>el.removeAttribute('open'));
  await expect(page.locator('html')).toHaveAttribute('data-skin',skin);
  const expected=skin==='axis'?(theme==='dark'?'rgb(6, 8, 11)':'rgb(242, 242, 236)'):(theme==='dark'?'rgb(18, 7, 9)':'rgb(243, 235, 221)');
  expect(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor)).toBe(expected);
  for(const el of await page.locator('.pill:visible,.badge:visible,.pq-tag:visible,.btn-primary:visible,.pq-mini-btn:visible,.pq-ws-item:not(:disabled):visible,.pq-theme-switch button:visible').all())await assertContrast(el);
  const title=page.locator('#clubview-title');
  expect(await title.evaluate(el=>getComputedStyle(el).fontFamily)).toContain(skin==='axis'?'Archivo':'Fraunces');
  if(skin==='axis'){expect(await title.evaluate(el=>getComputedStyle(el).fontWeight)).toBe('800');expect(await title.evaluate(el=>getComputedStyle(el).fontStretch)).toBe('66%');}
  await page.evaluate(()=>{const el=document.createElement('div');el.className='toast toast-inline';el.dataset.axisContrastProbe='1';el.innerHTML='Update available <button>Update now</button><button class="toast-dismiss">Not now</button>';document.querySelector('.app')!.append(el);});
  const notice=page.locator('[data-axis-contrast-probe]');await assertContrast(notice);for(const button of await notice.getByRole('button').all())await assertContrast(button);await notice.evaluate(el=>el.remove());
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 }
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-skin',skin);
});
