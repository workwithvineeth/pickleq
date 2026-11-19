import {expect,it} from 'vitest';
import {studioValues,INITIAL_UI,type StudioUI} from './studioValues';
import {PRIVATE_SHARING} from '../private/backend';
it('counts and displays only canonical practice_sessions, never legacy logs',()=>{const values=studioValues({name:'Sample',club:'Sample',official:[],practice:[{id:'p',kind:'practice_match',scoreText:'11-7',focusTags:[],playedAt:'2026-01-01'}],goals:[],sharing:PRIVATE_SHARING},INITIAL_UI,()=>{},{save:()=>{},share:()=>{}});expect(values.practiceCount).toBe(1);expect(values.diary).toHaveLength(1);expect(values.total).toBe(0)});
it('a new player sees honest empty-state words and no made-up practice chip',()=>{const v=studioValues({name:'New',club:'Ask your club for your player invite link to see your matches here',official:[],practice:[],goals:[],sharing:PRIVATE_SHARING},INITIAL_UI,()=>undefined,{save:()=>undefined,share:()=>undefined}) as Record<string,unknown>;
 expect(v.workOn).toBe('Play a tournament with a referee scoring, or log a practice match, and RallyQ shows what to work on here.');
 expect(v.hasDelta).toBe(false);expect(v.serveDelta).toBe('');});
it('Log a session: one Drill or training type, the real tags, game rows you can tap point by point, a quick result',()=>{
 let ui:StudioUI={...INITIAL_UI,f:'Log'};const set=(p:Partial<StudioUI>)=>{ui={...ui,...p};};
 const make=()=>studioValues({name:'Sample',club:'Sample',official:[],practice:[],goals:[],sharing:PRIVATE_SHARING},ui,set,{save:()=>{},share:()=>{}}) as Record<string,any>;
 let v=make();
 expect(v.types.map((t:{label:string})=>t.label)).toEqual(['Practice match','Drill or training']);
 expect(v.tags.map((t:{label:string})=>t.label)).toEqual(expect.arrayContaining(['Backhand drive','Forehand drive','Serve']));
 expect(JSON.stringify(v)).not.toMatch(/How did it feel/);
 v.gameRows[0].plusMe();v=make();v.gameRows[0].plusMe();v=make();v.gameRows[0].plusThem();v=make();
 expect(ui.games[0]).toEqual({me:'2',them:'1'});
 v.addGame();v=make();expect(ui.games).toHaveLength(2);v.removeGame();expect(ui.games).toHaveLength(1);
 v=make();v.entries[1].pick();expect(ui.entry).toBe('quick');v=make();expect(v.isQuick).toBe(true);v.results[0].pick();expect(ui.quick).toBe('Won');
 v=make();v.tags.find((t:{label:string})=>t.label==='Backhand drive').pick();expect(ui.tags).toEqual(['Backhand drive']);
 v=make();expect(v.tags.find((t:{label:string})=>t.label==='Backhand drive').on).toBe(true);
 v.types[1].pick();v=make();expect(v.isDrill).toBe(true);
});
it('a quick Won/Lost practice counts toward matches won; drills show as Drill or training',()=>{
 const v=studioValues({name:'S',club:'S',official:[],practice:[{id:'1',kind:'practice_match',scoreText:'Won',focusTags:[],playedAt:'2026-01-02',opponents:'Ravi (stronger)'},{id:'2',kind:'practice_match',scoreText:'Lost 9–11',focusTags:[],playedAt:'2026-01-03'},{id:'3',kind:'drill',scoreText:'',minutes:30,focusTags:['Serve'],playedAt:'2026-01-04'}],goals:[],sharing:PRIVATE_SHARING},INITIAL_UI,()=>{},{save:()=>{},share:()=>{}}) as Record<string,any>;
 const m=v.compare.find((c:{label:string})=>c.label==='Matches won');expect(m.p).toBe('50%');
 expect(v.diary.map((d:{kind:string})=>d.kind)).toEqual(['Drill or training','Practice','Practice']);
 expect(v.diary.find((d:{what:string})=>d.what.includes('Ravi')).what).toBe('vs Ravi · stronger');
});

it('quick-only history shows the match win rate without inventing point or game data',()=>{
 const v=studioValues({name:'Sample',club:'Sample',official:[],practice:['Won','Lost'].map((scoreText,i)=>({id:String(i),kind:'practice_match' as const,scoreText,focusTags:[],playedAt:'2026-01-02'})),goals:[],sharing:PRIVATE_SHARING},INITIAL_UI,()=>{},{save:()=>{},share:()=>{}});
 expect(v.compare.find(c=>c.label==='Matches won')?.p).toBe('50%');
 for(const label of ['Points won','Games won']){
  const row=v.compare.find(c=>c.label===label);
  expect(row?.p).toBe('–');expect(row?.note).toBe('log practice to compare');
 }
});
