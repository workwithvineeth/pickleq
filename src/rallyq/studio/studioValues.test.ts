import {expect,it} from 'vitest';
import {studioValues,INITIAL_UI} from './studioValues';
import {PRIVATE_SHARING} from '../private/backend';
it('counts and displays only canonical practice_sessions, never legacy logs',()=>{const values=studioValues({name:'Sample',club:'Sample',official:[],practice:[{id:'p',kind:'practice_match',scoreText:'11-7',focusTags:[],playedAt:'2026-01-01'}],goals:[],sharing:PRIVATE_SHARING},INITIAL_UI,()=>{},{save:()=>{},share:()=>{}});expect(values.practiceCount).toBe(1);expect(values.diary).toHaveLength(1);expect(values.total).toBe(0)});
it('a new player sees honest empty-state words and no made-up practice chip',()=>{const v=studioValues({name:'New',club:'Ask your club for your player invite link to see your matches here',official:[],practice:[],goals:[],sharing:PRIVATE_SHARING},INITIAL_UI,()=>undefined,{save:()=>undefined,share:()=>undefined}) as Record<string,unknown>;
 expect(v.workOn).toBe('Play a tournament with a referee scoring, or log a practice match, and RallyQ shows what to work on here.');
 expect(v.hasDelta).toBe(false);expect(v.serveDelta).toBe('');});
