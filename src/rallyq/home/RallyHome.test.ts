import {describe,expect,it} from 'vitest';
import {demoRally} from './RallyHome';
import {INITIAL_MAIN} from './values';
describe('Home demo court follows the prototype side-out loop',()=>{
 it('scores only on serve and moves first/second serve without inventing a point',()=>{expect(demoRally(INITIAL_MAIN,()=>.1)).toMatchObject({sa:8});expect(demoRally({...INITIAL_MAIN,srvNo:1},()=>.9)).toMatchObject({srvNo:2});expect(demoRally(INITIAL_MAIN,()=>.9)).toMatchObject({srvA:false,srvNo:1});expect(demoRally(INITIAL_MAIN,()=>.9)).not.toHaveProperty('sa')});
 it('resets only after a win-by-two game and cycles the illustrated series',()=>{expect(demoRally({...INITIAL_MAIN,sa:11,sb:10},()=>.1)).toMatchObject({sa:12});expect(demoRally({...INITIAL_MAIN,sa:11,sb:9,game:3},()=>.1)).toMatchObject({sa:0,sb:0,game:1});});
});
