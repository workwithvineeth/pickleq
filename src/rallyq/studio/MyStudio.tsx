import {PlayerCardDialog,type CardRequest} from './PlayerCardDialog';
import {useRef} from 'react';
import {iso} from '../../domain/training';
import {ratingHistory} from '../../club/playerStudio';
import {courtCover} from './AthleteCover';
import {LatestEvent} from './StudioStory';
import {studioRecord} from './records';
import {CountUp} from '../motion/CountUp';
import {useState} from 'react';
import type {Go} from '../../navigation';
import {useLoad} from '../../club/screens/common';
import {PlayerStudio} from '../../club/screens/studio/Studio';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from '../prototypes/MyStudio.dc.html?raw';
import {holes} from '../holes';
import {RallyStudioStore,PRIVATE_SHARING,type SharingOptions} from '../private/backend';
import {INITIAL_UI,studioValues,type StudioUI} from './studioValues';
import {EMPTY_LOG,buildPractice,practiceOutcome} from './logSession';
import {MyTournaments} from './MyTournaments';
import {ClaimStudio} from './ClaimStudio';
import {CoverEditor} from './CoverEditor';
export const COVER_UPLOAD=true;
import {signOutTo} from '../shell/Shell';
import {appLink,shareLink} from '../../club/screens/common';
const source=holes(raw,[
 // No public profile until the player is linked to one: never open the sample profile as if it were theirs.
 ['<a class="btn" href="Studio.dc.html" style="background:#0B2418;color:#D9F24A!important">See my public profile</a>','<sc-if value="{{hasProfile}}" hint-placeholder-val="{{ true }}"><a class="btn" href="Studio.dc.html" style="background:#0B2418;color:#D9F24A!important">See my public profile</a></sc-if>'],
 // Overview: share the public profile link (native share sheet, else copied).
 ['<div class="disp" style="font-size:32px">Your numbers</div>','<div class="between" style="flex-wrap:wrap;gap:10px"><div class="disp" style="font-size:32px">Your numbers</div><sc-if value="{{hasProfile}}" hint-placeholder-val="{{ true }}"><button class="btn sm" style="background:#0B2418;color:#D9F24A!important" onClick="{{shareProfile}}" aria-live="polite">{{shareProfileLabel}}</button></sc-if></div>'],
 // The practice-vs-tournament chip shows only when both exist (it was a fixed '+6%').
 ['<span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;background:#0B2418;color:#D9F24A">+6%</span>','<sc-if value="{{hasDelta}}" hint-placeholder-val="{{ false }}"><span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;background:#0B2418;color:#D9F24A">{{serveDelta}}</span></sc-if>'],
 // My tournaments (entries, status, next match) sits above the Studio panels.
 ['<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:14px">','{{privateCover}}{{latestEvent}}<div>{{myTournaments}}</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:14px">'],
 // Signed-in players can go to My clubs from here (organisers reach this page from My clubs).
 ['<a class="tlink" href="Studio.dc.html">View my public profile ↗</a>','<nav class="studio-account-links" aria-label="Studio account"><a class="tlink" href="Overview.dc.html">My clubs</a><sc-if value="{{hasProfile}}" hint-placeholder-val="{{ true }}"><a class="tlink" href="Studio.dc.html">View my public profile</a></sc-if><button class="tlink" onClick="{{signOut}}">Sign out</button></nav>'],
 ['<div class="disp" style="font-size:32px">Goals and coach</div>','<div class="disp" style="font-size:32px">Goals and coach</div><div style="display:grid;grid-template-columns:minmax(0,1fr) 90px auto;gap:8px;align-items:center"><input value="{{goalNew}}" onChange="{{setGoalNew}}" placeholder="New goal, e.g. 4 drop-shot sessions" aria-label="Goal" style="min-height:44px;border-radius:12px;border:0;box-shadow:inset 0 0 0 1px rgba(11,36,24,.2);padding:0 12px;font:inherit;color:#0B2418;background:#FFFFFF;min-width:0"><input value="{{goalNewTarget}}" onChange="{{setGoalNewTarget}}" inputmode="numeric" placeholder="Target" aria-label="Target" style="min-height:44px;border-radius:12px;border:0;box-shadow:inset 0 0 0 1px rgba(11,36,24,.2);padding:0 10px;font:inherit;color:#0B2418;background:#FFFFFF;min-width:0"><button class="btn sm" style="background:#0B2418;color:#D9F24A!important" onClick="{{addGoal}}">Add</button></div><sc-if value="{{goalMsg}}" hint-placeholder-val="{{ false }}"><div style="font-size:12px;color:#4A5D50">{{goalMsg}}</div></sc-if><sc-if value="{{hasGoal}}" hint-placeholder-val="{{ false }}"><button class="btn sm" style="background:#2B6E4B;color:#FFFFFF!important;align-self:flex-start" onClick="{{goalStep}}">+1 on “{{goalTitle}}”</button></sc-if>'],
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
 ['font-size:26px">38</div><div style="font-size:11px;color:#9FB4A6">tournament','font-size:26px">{{total}}</div><div style="font-size:11px;color:#9FB4A6">tournament']])
 .replace(/<section class="photo ph-woman"[\s\S]*?<\/section>/, '')
 .replace(/<div style="display:flex;gap:12px;align-items:stretch;flex:1;min-height:380px">[\s\S]*?(?=<div style="background:#133022)/, '{{selectedGame}}')
 .replace('<div style="font-size:11px;color:#9FB4A6">Dots = scoring runs by phase of the game. Court position needs the live stream, coming later.</div>', '{{matchNavigation}}')
 .replace('<div class="disp" style="font-size:32px">Log a session</div>', '<h2 id="studio-log-heading" tabindex="-1" class="disp">Log a session</h2>{{sessionDetails}}')
 .replace('Name, for example Ravi', 'Opponent name')
 .replace('<div style="{{e.src}}">{{e.srcLabel}}</div>', '<div class="studio-diary-source"><span style="{{e.src}}">{{e.srcLabel}}</span>{{e.share}}</div>')
 .replace('<div><div class="cap">{{matchLabel}}</div>', '<div id="studio-match-overview" tabindex="-1"><div class="cap">{{matchLabel}}</div>');

/** Private My Player Studio, exactly as the prototype, on the owner's real matches, practice, goals and sharing. */
/** Signed out the Player Studio welcome brings its own v1.2 shell; signed in (no studio data yet) it keeps the app frame. */
function PlayerStudioOrWelcome({go,section}:{go:Go;section:string}){return <div className="app pq-brand pq-studio-wrap"><PlayerStudio section={section} go={go}/></div>;}
export function MyStudio({go,section}:{go:Go;section?:string}){
 const[ui,setUi]=useState<StudioUI>(()=>({...INITIAL_UI,f:section==='log'||section?.startsWith('log.')||section==='practice'||section?.startsWith('practice.')?'Log':section==='train'||section==='matches'?'Diary':section==='coach'?'Goals':section?.includes('privacy')?'Sharing':'Overview'}));const set=(p:Partial<StudioUI>)=>setUi(s=>({...s,...p}));
 const state=useLoad(async()=>{const store=new RallyStudioStore();return{store,data:await store.load()};},[]);
 const[sharing,setSharing]=useState<SharingOptions|null>(null);
 const[goal,setGoal]=useState({title:'',target:'',msg:''});
 const[shared,setShared]=useState('');
 const[card,setCard]=useState<CardRequest>();
 const saving=useRef(false);
 if(!state.data&&!state.loading)return <PlayerStudioOrWelcome section={section??''} go={go}/>;
 if(!state.data)return <div className="rq" style={{minHeight:'60vh',display:'grid',placeItems:'center',color:'#9FB4A6',padding:24,textAlign:'center'}}>{state.loading?'Loading your Player Studio…':<span>{state.error??'Sign in to open My Player Studio.'} <button type="button" className="tlink" onClick={()=>go('club-signin')}>Sign in →</button></span>}</div>;
 const{store,data}=state.data;const me=data.official.players[0];
 const share=sharing??data.sharing??PRIVATE_SHARING;
 const focus=(id:string)=>requestAnimationFrame(()=>document.getElementById(id)?.focus());
 const onLog=()=>{set({f:'Log',saved:false,error:''});focus('studio-log-heading');};
 const onMatch=(id:string)=>{
  const list=[...data.official.official].sort((a,b)=>a.playedOn.localeCompare(b.playedOn)).reverse();
  set({f:'Overview',m:Math.max(0,list.findIndex(m=>m.id===id)),g:1});
  focus('studio-match-overview');
 };
 const save=async()=>{const built=buildPractice(ui,iso(new Date()));
  if(!built.input){set({error:built.problem,saved:false});return;}
  if(saving.current)return;
  saving.current=true;
  try{await store.savePractice(built.input);set({...EMPTY_LOG,saved:true,error:''});state.reload();}
  catch(e){set({error:e instanceof Error?e.message:'Could not save.',saved:false});}finally{saving.current=false;}};
 const toggle=async(k:keyof SharingOptions)=>{const next={...share,[k]:!share[k]};setSharing(next);try{await store.saveSharing(next);}catch{setSharing(share);}};
 const values=studioValues({name:me?.name??'Your Player Studio',club:me?.club??'Your tournament matches show here once you claim them',dupr:me?.duprDoubles,official:data.official.official,practice:data.practice,goals:data.goals,sharing:share},ui,set,{save:()=>{void save();},share:k=>{void toggle(k);},shareMatch:(matchId,playerId)=>setCard({matchId,playerId})});
 const g0=data.goals[0];
 const addGoal=async()=>{try{await store.saveGoal({title:goal.title,target:Number(goal.target),progress:0});setGoal({title:'',target:'',msg:'Goal added.'});state.reload();}catch(e){setGoal({...goal,msg:e instanceof Error?e.message:'Could not save the goal.'});}};
 const goalStep=async()=>{if(!g0)return;try{await store.saveGoal({title:g0.title,target:g0.target,progress:Math.min(g0.target,g0.progress+1),due:g0.due},g0.id);state.reload();}catch(e){setGoal({...goal,msg:e instanceof Error?e.message:'Could not update the goal.'});}};
 Object.assign(values,{goalNew:goal.title,goalNewTarget:goal.target,goalMsg:goal.msg,hasGoal:!!g0,setGoalNew:(e:{target:{value:string}})=>setGoal({...goal,title:e.target.value,msg:''}),setGoalNewTarget:(e:{target:{value:string}})=>setGoal({...goal,target:e.target.value.replace(/[^0-9.]/g,''),msg:''}),addGoal:()=>{void addGoal();},goalStep:()=>{void goalStep();}});
 const shareProfile=async()=>{if(!me)return;const r=await shareLink(me.name+' on RallyQ',appLink('#/public-player/'+encodeURIComponent(me.playerId)));setShared(r==='Shared'?'Shared ✓':r==='Link copied'?'Link copied ✓':'');};
 const photo=data.photo || courtCover;
 const doubles=ratingHistory('doubles',data.official), singles=ratingHistory('singles',data.official);
 const history=doubles.length?doubles:singles;
 const rating=history[0]?.value;
 const delta=rating===undefined||history.length<2?undefined:rating-history[history.length-1].value;
 const record=studioRecord(data.official.official);
 const practiceMatches=data.practice.filter(p=>p.kind==='practice_match');
 const practice=practiceMatches.map(p=>practiceOutcome(p.scoreText)).filter(Boolean);
 const practiceRate=practice.length?Math.round(practice.filter(p=>p==='won').length/practice.length*100):undefined;
 const field=(key:'date'|'partner'|'venue'|'count'|'wins', label:string, type='text')=>
  <label>{label}<input type={type} value={key==='date'?(ui.date||iso(new Date())):ui[key]} maxLength={120} onChange={e=>set({[key]:e.target.value,saved:false,error:''})}/></label>;
 Object.assign(values,{
  privateCover:<section className="studio-private-cover" aria-label="Private Athlete cover">
   <img className="studio-cover-backdrop" src={photo} alt=""/>
   <img className="studio-cover-portrait" src={photo} alt=""/>
   <div className="studio-cover-copy">
    <p>My Studio · only you see this</p>
    <h1>{me?.name??'Your Player Studio'}</h1>
    <div className="studio-cover-metrics">
     <div className="studio-rating"><b>{rating?.toFixed(2)??'Unrated'}</b><span>DUPR {doubles.length?'doubles':singles.length?'singles':''}</span>
      {delta!==undefined&&<small>{delta>=0?'+':''}{delta.toFixed(2)} since first rating</small>}</div>
     <div><b>{record.rate===undefined?'—':`${record.rate}%`}</b><br/>Official win rate (all formats)</div>
    </div>
    {ui.f!=='Log'&&<button type="button" className="btn studio-action" onClick={onLog}>Log a session</button>}
    <button type="button" className="btn studio-action studio-card-action" onClick={()=>setCard({playerId:me?.playerId})}>Share my card</button>
    {COVER_UPLOAD&&<CoverEditor store={store} hasPhoto={!!data.photo} onSaved={state.reload} canPublish={!!me}/>}
   </div>
  </section>,
  latestEvent:<>
   <LatestEvent matches={data.official.official} onLog={onLog} showLog={ui.f!=='Log'} onMatch={onMatch}
    goalExists={title=>data.goals.some(g=>g.title===title)} onGoal={async goal=>{await store.saveGoal(goal);state.reload();}}/>
   {practiceMatches.length>=3&&<section className="card studio-story" aria-label="Practice versus tournament win rate">
    <h2>Practice vs tournament win rate</h2>
    <p>Practice {practiceRate===undefined?'—':`${practiceRate}%`} · Tournament {record.rate===undefined?'—':`${record.rate}%`}</p>
   </section>}
  </>,
  selectedGame:values.total>0&&<dl className="athlete-tiles">
   <div><dt>Points won</dt><dd>{values.g.srv}</dd></div>
   <div><dt>Points lost</dt><dd>{values.g.ret}</dd></div>
  </dl>,
  matchNavigation:values.total>1&&<div className="athlete-chips">
   <button type="button" onClick={values.prev} disabled={values.gameNo<=1}>Previous match</button>
   <span>Match {values.gameNo} of {values.total}</span>
   <button type="button" onClick={values.next} disabled={values.gameNo>=values.total}>Next match</button>
  </div>,
  sessionDetails:<div className="studio-fields">{field('date','Date','date')}
   {ui.type==='Practice match'&&<>{field('partner','Partner name')}{field('venue','Venue')}</>}
   {ui.type==='Casual games'&&<>{field('count','Games played','number')}{field('wins','Games won','number')}</>}
  </div>,
 });
 Object.assign(values,{shareProfile:()=>{void shareProfile();},shareProfileLabel:shared||'Share my profile',hasProfile:!!me,myTournaments:<div style={{display:'grid',gap:14}}><ClaimStudio go={go} claimed={data.official.players.length}/><MyTournaments go={go}/></div>,signOut:()=>{void signOutTo(go);}});
 // Motion board: the Studio numbers count up once when the page opens.
 const counted={...values,diary:values.diary.map(row=>({...row,share:row.share&&<button type="button" className="btn sm studio-action studio-card-action" onClick={row.share}>Share</button>})),practiceCount:<CountUp text={String(values.practiceCount)}/>,hours:<CountUp text={String(values.hours)}/>,serve:<CountUp text={String(values.serve)}/>};
 return <PrototypeScreen name="MyStudio" go={go} source={source} values={counted} hrefs={me?{Studio:'#/public-player/'+encodeURIComponent(me.playerId)}:undefined}>
  {card&&<PlayerCardDialog request={card} onClose={()=>setCard(undefined)}/>}
 </PrototypeScreen>;
}
