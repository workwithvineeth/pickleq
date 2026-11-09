import {afterEach,beforeEach,expect,it} from 'vitest';
import {currentSkin,readSkin,SKINS,SKIN_KEY} from './skin';
import {applyTheme,chooseSkin,readTheme} from './theme';
beforeEach(()=>{localStorage.clear();delete document.documentElement.dataset.skin;});
afterEach(()=>{document.documentElement.removeAttribute('data-skin');document.documentElement.removeAttribute('data-theme');document.documentElement.removeAttribute('style');});
it('defaults to AXIS and keeps the second skin behind one persisted setting',()=>{
 expect(readSkin({getItem:()=>null})).toBe('axis');expect(readSkin({getItem:()=>{throw Error('blocked')}})).toBe('axis');
 chooseSkin('maroon');expect(currentSkin()).toBe('maroon');expect(localStorage.getItem(SKIN_KEY)).toBe('maroon');
 chooseSkin('axis');expect(currentSkin()).toBe('axis');
});
it('pairs both skins with light and dark browser colours',()=>{
 for(const skin of ['axis','maroon']as const)for(const theme of ['light','dark']as const){
  chooseSkin(skin);applyTheme(theme);expect(document.documentElement.style.backgroundColor).toBe(theme==='dark'?(skin==='axis'?'rgb(7, 9, 12)':'rgb(18, 7, 9)'):(skin==='axis'?'rgb(242, 242, 236)':'rgb(243, 235, 221)'));
  expect(SKINS[skin].onBrand).toBe(skin==='axis'?'#0B0F04':'#F3EBDD');
 }
});

it('starts new AXIS installs in Dark while keeping saved Auto available',()=>{document.documentElement.dataset.skin='axis';expect(readTheme({getItem:()=>null},'dark')).toBe('dark');expect(readTheme({getItem:()=> 'auto'},'dark')).toBe('auto');});
