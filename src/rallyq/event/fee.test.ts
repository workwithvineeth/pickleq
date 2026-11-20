import {describe,expect,it} from 'vitest';
import {entryFeeLine} from './fee';
const d=(kind:'singles'|'doubles',fee?:number)=>({kind,rules:{fee}});
describe('entry fee line',()=>{
 it('shows one fee per team or player',()=>{expect(entryFeeLine([d('doubles',2000),d('doubles',2000)])).toBe('₹2,000 per team');expect(entryFeeLine([d('singles',699)])).toBe('₹699 per player');});
 it('shows "From" when categories differ, and nothing when no fee is set',()=>{expect(entryFeeLine([d('singles',699),d('doubles',1199)])).toBe('₹699 per player · ₹1,199 per team');expect(entryFeeLine([d('doubles')])).toBe('');expect(entryFeeLine([d('doubles',500),d('doubles')])).toBe('From ₹500 per team');});
});
