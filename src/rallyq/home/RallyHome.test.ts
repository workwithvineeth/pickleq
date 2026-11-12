import {describe,expect,it} from 'vitest';
import {demoRally} from './RallyHome';
import {INITIAL_MAIN,mainValues} from './values';
describe('Home sample content never names a real club as live',()=>{
 it('labels sample courts and ticker, and falls back to the real event calendar',()=>{const v=mainValues(INITIAL_MAIN,()=>{});for(const m of v.live as Array<{club:string}>)expect(m.club).toMatch(/\(sample\)$/);for(const t of v.tick as Array<{club:string}>)expect(t.club).toMatch(/\(sample\)$/);expect((v.events as Array<{club:string;date:string}>).map(e=>e.date+' '+e.club)).toEqual(['15 Nov The Pickle Club','15 Nov Elite Picklers','15 Nov PKL Zone','15 Nov Rally33','21 Nov Pickleyard','28 Nov Pickleball Central']);expect(JSON.stringify(v.live)+v.cap).not.toMatch(/Loki|TPC/);});
});
describe('Home demo court follows the prototype side-out loop',()=>{
 it('scores only on serve and moves first/second serve without inventing a point',()=>{expect(demoRally(INITIAL_MAIN,()=>.1)).toMatchObject({sa:8});expect(demoRally({...INITIAL_MAIN,srvNo:1},()=>.9)).toMatchObject({srvNo:2});expect(demoRally(INITIAL_MAIN,()=>.9)).toMatchObject({srvA:false,srvNo:1});expect(demoRally(INITIAL_MAIN,()=>.9)).not.toHaveProperty('sa')});
 it('resets only after a win-by-two game and cycles the illustrated series',()=>{expect(demoRally({...INITIAL_MAIN,sa:11,sb:10},()=>.1)).toMatchObject({sa:12});expect(demoRally({...INITIAL_MAIN,sa:11,sb:9,game:3},()=>.1)).toMatchObject({sa:0,sb:0,game:1});});
});
