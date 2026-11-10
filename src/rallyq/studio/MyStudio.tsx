import {useState} from 'react';
import type {Go} from '../../navigation';
import {useLoad} from '../../club/screens/common';
import {PlayerStudio} from '../../club/screens/studio/Studio';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from '../prototypes/MyStudio.dc.html?raw';
import {holes} from '../holes';
import {RallyStudioStore,PRIVATE_SHARING,type SharingOptions} from '../private/backend';
import {INITIAL_UI,studioValues,type StudioUI} from './studioValues';
const source=holes(raw,[
 ['<div class="disp" style="font-size:32px">Goals and coach</div>','<div class="disp" style="font-size:32px">Goals and coach</div><div style="display:grid;grid-template-columns:minmax(0,1fr) 90px auto;gap:8px;align-items:center"><input value="{{goalNew}}" onChange="{{setGoalNew}}" placeholder="New goal, e.g. 4 drop-shot sessions" aria-label="Goal" style="min-height:44px;border-radius:12px;border:0;box-shadow:inset 0 0 0 1px rgba(11,36,24,.2);padding:0 12px;font:inherit;color:#0B2418;background:#FFFFFF;min-width:0"><input value="{{goalNewTarget}}" onChange="{{setGoalNewTarget}}" inputmode="numeric" placeholder="Target" aria-label="Target" style="min-height:44px;border-radius:12px;border:0;box-shadow:inset 0 0 0 1px rgba(11,36,24,.2);padding:0 10px;font:inherit;color:#0B2418;background:#FFFFFF;min-width:0"><button class="btn sm" style="background:#0B2418;color:#D9F24A!important" onClick="{{addGoal}}">Add</button></div><sc-if value="{{goalMsg}}" hint-placeholder-val="{{ false }}"><div style="font-size:12px;color:#4A5D50">{{goalMsg}}</div></sc-if><sc-if value="{{hasGoal}}" hint-placeholder-val="{{ false }}"><button class="btn sm" style="background:#2B6E4B;color:#FFFFFF!important;align-self:flex-start" onClick="{{goalStep}}">+1 on “{{goalTitle}}”</button></sc-if>'],
 ['DUPR 4.62 ▲ 0.18','{{duprLabel}}'],['Hyderabad #14','{{rankLabel}}'],['<div class="disp" style="font-size:clamp(44px,4.2vw,58px)">Kiran Reddy</div>','<h1 class="disp" style="font-size:clamp(44px,4.2vw,58px);margin:0">{{playerName}}</h1>'],
 ['Right side · Two-handed backhand · Loki’s Pickleball Club','{{playerLine}}'],
 ['<br>won on serve</div>','<br>points won</div>'],['<br>won returning</div>','<br>points lost</div>'],['<br>side-outs</div>','<br>lead changes</div>'],
 ['points won on serve · {{scopeLabel}}','points won · {{scopeLabel}}'],
 ['<span>Comebacks from 5+ down</span><b>4</b>','<span>Comebacks after losing game 1</span><b>{{comebacks}}</b>'],
 ['<span>Longest win streak</span><b>9</b>','<span>Longest win streak</span><b>{{streak}}</b>'],
 ['<span>Rival · Varun / Neel</span><b>You lead 3–2</b>','<span>Rival · {{rivalName}}</span><b>{{rivalRecord}}</b>'],
 ['margin-top:8px">5–1</div>','margin-top:8px">{{decLine}}</div>'],
 ['margin-top:8px">82%</div><div style="font-size:11px;color:#4A5D50">wins from 10 points','margin-top:8px">{{closePct}}</div><div style="font-size:11px;color:#4A5D50">games won from 10 points'],
 ['Receiving side loses 3 in a row most often in game 2. Slow the start.','{{workOn}}'],
 [' You win 74% on serve in practice but 68% in tournaments. The drop starts at 9 points.',' {{gapLine}}'],
 ['<b>November goal</b>','<b>{{goalTitle}}</b>'],['{{goalDone}} / 4','{{goalDone}} / {{goalTarget}}'],['Four practice sessions on third-shot drops','Your goal, tracked from your sessions'],
 ['font-size:22px">4.62</span>','font-size:22px">{{duprGoal}}</span>'],
 ['Coach Suresh · 8 Nov','Coach'],['Stay back one more ball after the serve. Your drops land when you are set, not running.','{{coachNote}}'],
 ['color:#2B6E4B">9</div><div style="font-size:11px;color:#4A5D50">wins in a row','color:#2B6E4B">{{badgeStreak}}</div><div style="font-size:11px;color:#4A5D50">wins in a row'],
 ['color:#2B6E4B">5</div><div style="font-size:11px;color:#4A5D50">venues played','color:#2B6E4B">{{badgeVenues}}</div><div style="font-size:11px;color:#4A5D50">venues played'],
 ['color:#2A1D00">QF</div>','color:#2A1D00">{{badgeBest}}</div>'],
 ['font-size:26px">38</div><div style="font-size:11px;color:#9FB4A6">tournament','font-size:26px">{{total}}</div><div style="font-size:11px;color:#9FB4A6">tournament'],
 ['<div style="min-height:48px;border-radius:14px;background:#FFFFFF;box-shadow:inset 0 0 0 1px rgba(11,36,24,.2);display:flex;align-items:center;padding:0 14px;font-weight:700;font-size:18px">{{logValue}}</div>','<input value="{{logValue}}" onChange="{{setLogValue}}" placeholder="{{logPlaceholder}}" aria-label="{{logQ}}" style="min-height:48px;border-radius:14px;background:#FFFFFF;border:0;box-shadow:inset 0 0 0 1px rgba(11,36,24,.2);padding:0 14px;font:inherit;font-weight:700;font-size:18px;color:#0B2418;width:100%;box-sizing:border-box">']]);

/** Private My Player Studio, exactly as the prototype, on the owner's real matches, practice, goals and sharing. */
export function MyStudio({go,section}:{go:Go;section?:string}){
 const[ui,setUi]=useState<StudioUI>(()=>({...INITIAL_UI,f:section==='log'||section?.startsWith('log.')||section==='practice'||section?.startsWith('practice.')?'Log':section==='train'||section==='matches'?'Diary':section==='coach'?'Goals':section?.includes('privacy')?'Sharing':'Overview'}));const set=(p:Partial<StudioUI>)=>setUi(s=>({...s,...p}));
 const state=useLoad(async()=>{const store=new RallyStudioStore();return{store,data:await store.load()};},[]);
 const[sharing,setSharing]=useState<SharingOptions|null>(null);
 const[goal,setGoal]=useState({title:'',target:'',msg:''});
 if(!state.data&&!state.loading)return <div className="app pq-brand"><PlayerStudio section={section??''} go={go}/></div>;
 if(!state.data)return <div className="rq" style={{minHeight:'60vh',display:'grid',placeItems:'center',color:'#9FB4A6',padding:24,textAlign:'center'}}>{state.loading?'Loading your Player Studio…':<span>{state.error??'Sign in to open My Player Studio.'} <button type="button" className="tlink" onClick={()=>go('club-signin')}>Sign in →</button></span>}</div>;
 const{store,data}=state.data;const me=data.official.players[0];
 const share=sharing??data.sharing??PRIVATE_SHARING;
 const save=async()=>{const kinds={'Practice match':'practice_match','Drill':'drill','Training':'training'} as const;const kind=kinds[ui.type];
  try{await store.savePractice({kind,scoreText:kind==='practice_match'?ui.value:'',minutes:kind==='practice_match'?undefined:Number(ui.value),focusTags:Object.entries(ui.focus).filter(([,v])=>v).map(([i])=>['Third-shot drop','Serve','Dinks','Returns'][Number(i)]),feel:ui.feel,playedAt:new Date().toISOString().slice(0,10)});set({saved:true,value:''});state.reload();}
  catch(e){set({error:e instanceof Error?e.message:'Could not save.'});}};
 const toggle=async(k:keyof SharingOptions)=>{const next={...share,[k]:!share[k]};setSharing(next);try{await store.saveSharing(next);}catch{setSharing(share);}};
 const values=studioValues({name:me?.name??'Your Player Studio',club:me?.club??'Claim your player profile to see your matches',dupr:me?.duprDoubles,official:data.official.official,practice:data.practice,goals:data.goals,sharing:share},ui,set,{save:()=>{void save();},share:k=>{void toggle(k);}});
 const g0=data.goals[0];
 const addGoal=async()=>{try{await store.saveGoal({title:goal.title,target:Number(goal.target),progress:0});setGoal({title:'',target:'',msg:'Goal added.'});state.reload();}catch(e){setGoal({...goal,msg:e instanceof Error?e.message:'Could not save the goal.'});}};
 const goalStep=async()=>{if(!g0)return;try{await store.saveGoal({title:g0.title,target:g0.target,progress:Math.min(g0.target,g0.progress+1),due:g0.due},g0.id);state.reload();}catch(e){setGoal({...goal,msg:e instanceof Error?e.message:'Could not update the goal.'});}};
 Object.assign(values,{goalNew:goal.title,goalNewTarget:goal.target,goalMsg:goal.msg,hasGoal:!!g0,setGoalNew:(e:{target:{value:string}})=>setGoal({...goal,title:e.target.value,msg:''}),setGoalNewTarget:(e:{target:{value:string}})=>setGoal({...goal,target:e.target.value.replace(/[^0-9.]/g,''),msg:''}),addGoal:()=>{void addGoal();},goalStep:()=>{void goalStep();}});
 return <PrototypeScreen name="MyStudio" go={go} source={source} values={values} hrefs={me?{Studio:'#/public-player/'+encodeURIComponent(me.playerId)}:undefined}/>;
}
