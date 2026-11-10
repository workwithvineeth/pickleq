import {expect,it} from 'vitest';
import {studioValues,INITIAL_UI} from './studioValues';
import {PRIVATE_SHARING} from '../private/backend';
it('counts and displays only canonical practice_sessions, never legacy logs',()=>{const values=studioValues({name:'Sample',club:'Sample',official:[],practice:[{id:'p',kind:'practice_match',scoreText:'11-7',focusTags:[],playedAt:'2026-01-01'}],goals:[],sharing:PRIVATE_SHARING},INITIAL_UI,()=>{},{save:()=>{},share:()=>{}});expect(values.practiceCount).toBe(1);expect(values.diary).toHaveLength(1);expect(values.total).toBe(0)});
