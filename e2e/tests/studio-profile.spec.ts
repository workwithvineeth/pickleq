import {expect,test} from '@playwright/test';
test('player profile shows recorded ratings and read-only cards without changing Studio records',async({page})=>{
 const writes:string[]=[];
 const user={id:'ab000000-0000-4000-8000-000000000001',email:'sample@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 const b64=(value:object)=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const access_token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user.id,role:'authenticated',exp:4102444800})}.sig`;
 await page.addInitScript(session=>{
  localStorage.setItem('pq-club-auth',JSON.stringify(session));
  localStorage.setItem('pq-club-mode','server');
 },{access_token,refresh_token:'fixture-refresh-token',token_type:'bearer',expires_at:4102444800,user});
 await page.route('https://*.supabase.co/**',r=>{
  const path=new URL(r.request().url()).pathname;
  if(/\/player_studio_/.test(path)&&r.request().method()!=='GET')writes.push(path);
  let json:unknown=[];
  if(path.endsWith('/user'))json=user;
  if(path.endsWith('/studio_my_players'))json=[{player_id:'p1',name:'Alex Sample',club:'Cedar Paddle Club',claimed_at:'2026-10-01',dupr_doubles:4.62,dupr_singles:4.2}];
  if(path.endsWith('/studio_official_history'))json=[{id:'o1',club:'Cedar Paddle Club',tournament:'Sample Open',tournament_id:'t1',division:'Open doubles',kind:'doubles',stage:'final',played_on:'2026-11-01',format:{pointsTo:11,bestOf:1,scoring:'rally'},games:[{a:11,b:7}],winner:'A',my_side:'A',me:'p1',side_a:[{id:'p1',name:'Alex Sample'}],side_b:[{id:'p2',name:'Robin Sample'}]}];
  if(path.endsWith('/player_studio_ratings'))json=[{id:'r2',kind:'doubles',value:4.62,rated_on:'2026-11-01'},{id:'r1',kind:'doubles',value:4.4,rated_on:'2026-10-01'}];
  if(path.endsWith('/player_studio_settings'))json={use_official:true,goals:[]};
  if(path.endsWith('/profile_sharing'))json=null;
  if(path.endsWith('/is_platform_admin'))json=false;
  return r.fulfill({json});
 });
 await page.setViewportSize({width:320,height:568});await page.goto('#/club-player-studio');
 await expect(page.getByRole('heading',{name:'Alex Sample',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Private Athlete cover'})).toContainText('4.62');
 for(const width of [320,390,870,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 expect(await page.locator('body').innerText()).not.toMatch(/Hyderabad #3|serve points|clutch rate|PaddleQ/i);
 expect(writes).toEqual([]);
});
