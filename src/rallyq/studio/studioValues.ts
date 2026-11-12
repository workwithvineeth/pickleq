import type {OfficialMatch} from '../../club/playerStudio';
import type {PracticeSession,PlayerGoal,SharingOptions} from '../private/backend';

export type Feature='Overview'|'Log'|'Compare'|'Diary'|'Goals'|'Sharing';
export type Scope='All'|'Tournament'|'Practice';
export interface StudioUI {f:Feature;scope:Scope;g:number;m:number;type:'Practice match'|'Drill'|'Training';value:string;focus:Record<number,boolean>;feel:number;saved:boolean;error:string}
export const INITIAL_UI:StudioUI={f:'Overview',scope:'All',g:1,m:0,type:'Practice match',value:'',focus:{0:true},feel:3,saved:false,error:''};
export interface StudioInput {name:string;club:string;dupr?:number;official:OfficialMatch[];practice:PracticeSession[];goals:PlayerGoal[];sharing:SharingOptions}
const FOCUS=['Third-shot drop','Serve','Dinks','Returns'];
const SHARE:[keyof SharingOptions,string][]=[['practice_results','Practice match results'],['practice_vs_tournament','Practice vs tournament chart'],['training_hours','Training hours'],['coach_notes','Coach notes'],['goals_badges','Goals and badges']];
const STAGE_RANK:Record<string,number>={final:6,sf:5,qf:4,r16:3,r32:2,pool:1,friendly:0};
const STAGE_LABEL:Record<string,string>={final:'Final',sf:'SF',qf:'QF',r16:'R16',r32:'R32',pool:'Pools',friendly:'—'};
const pct=(a:number,b:number)=>b?Math.round(a/b*100):0;
const mine=(o:OfficialMatch,g:{a:number;b:number})=>o.mySide==='A'?[g.a,g.b]:[g.b,g.a];
export const won=(o:OfficialMatch)=>o.winner===o.mySide;
const names=(o:OfficialMatch,side:'mine'|'them')=>((side==='mine')===(o.mySide==='A')?o.sideA:o.sideB).map(p=>p.name.split(' ')[0]).join(' / ');
function parseScore(s:string){const games=[...s.matchAll(/(\d+)\s*[–\-:]\s*(\d+)/g)].map(m=>[Number(m[1]),Number(m[2])]);return games;}
function runs(points:string|undefined,me:'A'|'B'){let best=0,cur=0,changes=0,lead=0,a=0,b=0;for(const p of points??''){const mineP=p===me;cur=mineP?cur+1:0;best=Math.max(best,cur);if(p==='A')a++;else b++;const l=Math.sign(me==='A'?a-b:b-a);if(l&&lead&&l!==lead)changes++;if(l)lead=l;}return{best,changes};}

export function studioValues(d:StudioInput,ui:StudioUI,set:(p:Partial<StudioUI>)=>void,act:{save:()=>void;share:(k:keyof SharingOptions)=>void}){
 const off=[...d.official].sort((a,b)=>a.playedOn.localeCompare(b.playedOn));
 const practiceMatches=d.practice.filter(p=>p.kind==='practice_match');
 const pr=practiceMatches.map(p=>parseScore(p.scoreText)).filter(g=>g.length);
 const prGames=pr.flat();
 const tPoints=off.flatMap(o=>o.games.map(g=>mine(o,g)));
 const sum=(gs:number[][],i:number)=>gs.reduce((s,g)=>s+g[i],0);
 const tPts=pct(sum(tPoints,0),sum(tPoints,0)+sum(tPoints,1)),pPts=pct(sum(prGames,0),sum(prGames,0)+sum(prGames,1));
 const tGames=pct(tPoints.filter(g=>g[0]>g[1]).length,tPoints.length),pGames=pct(prGames.filter(g=>g[0]>g[1]).length,prGames.length);
 const tMatch=pct(off.filter(won).length,off.length),pMatch=pct(pr.filter(g=>g.filter(x=>x[0]>x[1]).length>g.length/2).length,pr.length);
 const deciding=off.filter(o=>o.games.length===3),decW=deciding.filter(won).length;
 const close=tPoints.filter(g=>g[0]>=10),closeW=close.filter(g=>g[0]>g[1]).length;
 let streak=0,cur=0;for(const o of off){cur=won(o)?cur+1:0;streak=Math.max(streak,cur);}
 const rivals=new Map<string,{w:number;l:number}>();for(const o of off){const k=names(o,'them');const r=rivals.get(k)??{w:0,l:0};if(won(o))r.w++;else r.l++;rivals.set(k,r);}
 const rival=[...rivals.entries()].sort((a,b)=>(b[1].w+b[1].l)-(a[1].w+a[1].l))[0];
 const best=off.reduce((b,o)=>Math.max(b,STAGE_RANK[o.stage]??0),0);const bestLabel=Object.keys(STAGE_RANK).find(k=>STAGE_RANK[k]===best)??'pool';
 const venues=new Set(off.map(o=>o.club)).size;
 const practice=ui.scope==='Practice',tourn=ui.scope==='Tournament';
 const pill=(on:boolean)=>on?'tab on':'tab';
 const F:[Feature,string][]=[['Overview','Overview'],['Log','Log session'],['Compare','Practice vs tournament'],['Diary','Diary'],['Goals','Goals and coach'],['Sharing','Sharing']];
 const is=Object.fromEntries(F.map(([k])=>[k,ui.f===k]));
 // match shown on the court
 const list=off.slice().reverse();const mi=Math.min(ui.m,Math.max(0,list.length-1));const sel=list[mi];
 const gi=Math.min(ui.g,Math.max(1,sel?.games.length??1));const game=sel?.games[gi-1];
 const gm=sel&&game?mine(sel,game):[0,0];const rr=sel&&game?runs(game.points,sel.mySide):{best:0,changes:0};
 const dots=Array.from({length:Math.min(5,Math.max(1,Math.round(gm[0]/3)))},(_,i)=>[20+((i*37)%60),12+i*18]);
 const bar=(v:number,c:string)=>`display:block;height:100%;width:${v}%;background:${c};border-radius:99px`;
 const recent=off.slice(-12);const bv=recent.map(o=>{const g=o.games.map(x=>mine(o,x));return pct(sum(g,0),sum(g,0)+sum(g,1));});
 const diaryRows=[...off.map(o=>({d:o.playedOn,kind:'Tournament',what:o.tournament+(o.stage!=='pool'?' · '+STAGE_LABEL[o.stage]:''),score:o.games.map(g=>mine(o,g).join('–')).join(' · '),ref:true})),
  ...d.practice.map(p=>({d:p.playedAt,kind:p.kind==='practice_match'?'Practice':p.kind==='drill'?'Drill':'Training',what:p.opponents?'vs '+p.opponents:(p.focusTags[0]??(p.kind==='training'?'Training session':'Practice')),score:p.kind==='practice_match'?p.scoreText:(p.minutes??0)+' min',ref:false}))]
  .filter(r=>tourn?r.ref:practice?!r.ref:true).sort((a,b)=>b.d.localeCompare(a.d)).slice(0,8);
 const minutes=d.practice.filter(p=>p.playedAt.slice(0,7)===new Date().toISOString().slice(0,7)).reduce((s,p)=>s+(p.minutes??0),0);
 const goal=d.goals[0];
 return {
  is,feats:F.map(([k,n])=>({name:n,cls:pill(ui.f===k),pick:()=>set({f:k,saved:false,error:''})})),
  scopes:(['All','Tournament','Practice'] as Scope[]).map(n=>({name:n,cls:pill(ui.scope===n),pick:()=>set({scope:n})})),
  scopeLabel:ui.scope==='All'?'all matches':ui.scope.toLowerCase(),
  playerName:d.name,playerLine:d.club,duprLabel:d.dupr?'DUPR '+d.dupr.toFixed(2):'DUPR not linked',rankLabel:venues+' venues',
  matchLabel:sel?(sel.division??'')+' · '+sel.tournament:'No tournament matches yet',
  games:(sel?.games??[{a:0,b:0}]).map((_x,i)=>({label:i+1===gi?'Game '+(i+1):String(i+1),cls:pill(i+1===gi),w:i+1===gi?'min-width:96px':'min-width:40px',pick:()=>set({g:i+1})})),
  g:{srv:gm[0],ret:gm[1],run:rr.best,so:rr.changes,runs:dots.map(([x,y],i)=>({style:`position:absolute;left:${x}%;top:${y}%;width:${12+i*2}px;height:${12+i*2}px;border-radius:50%;background:${i%3===2?'#FF655C':'#D9F24A'};box-shadow:0 0 0 3px rgba(11,36,24,.35);transform:translate(-50%,-50%)`}))},
  scoreLine:sel?sel.games.map(g=>mine(sel,g).join('–')).join(' · '):'–',srcChip:'chip ball',srcLabel:'Referee scored',
  practiceCount:practiceMatches.length,hours:Math.round(minutes/60),gameNo:list.length?mi+1:0,total:list.length,
  prev:()=>set({m:Math.max(0,mi-1),g:1}),next:()=>set({m:Math.min(list.length-1,mi+1),g:1}),
  serve:(practice?pPts:tPts)+'%',bars:(bv.length?bv:[0]).map((h,i,a)=>`display:block;flex:1;border-radius:6px;height:${Math.max(4,h)}%;background:${i===a.length-1?'#2B6E4B':(i>a.length-5?'#7FA88E':'#D7E3D9')}`),
  comebacks:off.filter(o=>won(o)&&o.games.length>1&&mine(o,o.games[0])[0]<mine(o,o.games[0])[1]).length,streak,
  rivalName:rival?rival[0]:'No rival yet',rivalRecord:rival?(rival[1].w>=rival[1].l?'You lead ':'You trail ')+rival[1].w+'–'+rival[1].l:'',
  decLine:decW+'–'+(deciding.length-decW),closePct:pct(closeW,close.length)+'%',
  serveDelta:prGames.length&&tPoints.length?'practice '+(pPts-tPts>=0?'+':'')+(pPts-tPts)+'%':'',hasDelta:!!(prGames.length&&tPoints.length),
  workOn:!off.length&&!prGames.length?'Play a tournament with a referee scoring, or log a practice match, and RallyQ shows what to work on here.':!off.length?'Your practice is logged. Play a tournament scored by a referee to compare.':tGames<50?'You lose more games than you win in tournaments. Log practice matches to see where it changes.':pPts>tPts+3?'You win more points in practice than in tournaments. Practise under match pressure.':'Keep logging practice so RallyQ can spot what to work on.',
  types:(['Practice match','Drill','Training'] as const).map(n=>({name:n,style:ui.type===n?'background:#0B2418;color:#D9F24A':'background:#FFFFFF;color:#0B2418;box-shadow:inset 0 0 0 1px rgba(11,36,24,.2)',pick:()=>set({type:n,saved:false,value:''})})),
  logQ:ui.type==='Practice match'?'Score (for example 11–7, 9–11)':'Minutes',logValue:ui.value,logPlaceholder:ui.type==='Practice match'?'11–7':'40',setLogValue:(e:{target:{value:string}})=>set({value:e.target.value,saved:false,error:''}),
  focus:FOCUS.map((n,i)=>({name:n,style:ui.focus[i]?'background:#2B6E4B;color:#FFFFFF':'background:#FFFFFF;color:#0B2418;box-shadow:inset 0 0 0 1px rgba(11,36,24,.2)',pick:()=>set({focus:{...ui.focus,[i]:!ui.focus[i]}})})),
  feel:[1,2,3,4,5].map(n=>({n,style:ui.feel===n?'background:#0B2418;color:#D9F24A;min-width:44px':'background:#FFFFFF;color:#0B2418;min-width:44px;box-shadow:inset 0 0 0 1px rgba(11,36,24,.2)',pick:()=>set({feel:n})})),
  saveLog:act.save,saveLabel:ui.saved?'Saved to diary ✓':ui.error||'Save to diary',
  compare:[['Points won',tPts,pPts],['Games won',tGames,pGames],['Matches won',tMatch,pMatch],['Games won from 10 points',pct(closeW,close.length),0]].map(([label,t,p])=>({label,note:prGames.length?(Number(p)>Number(t)?'practice +'+(Number(p)-Number(t)):'tournament +'+(Number(t)-Number(p))):'log practice to compare',t:t+'%',p:prGames.length?p+'%':'–',tBar:bar(Number(t),'#2B6E4B'),pBar:bar(Number(p),'#9FB4A6')})),
  gapLine:prGames.length?`You win ${pPts}% of points in practice and ${tPts}% in tournaments.`:'Log a few practice matches to see your pressure gap.',
  diary:diaryRows.map(r=>({d:r.d,kind:r.kind,what:r.what,score:r.score,tag:`font-size:11px;font-weight:800;padding:4px 9px;border-radius:999px;${r.ref?'background:#0B2418;color:#D9F24A':(r.kind==='Training'?'background:#E8C35A;color:#2A1D00':'background:#DCE5DD;color:#0B2418')}`,src:r.ref?'font-size:12px;color:#2B6E4B;font-weight:700':'font-size:12px;color:#4A5D50',srcLabel:r.ref?'Referee scored · counts to rating':'Self-logged · private'})),
  goalTitle:goal?goal.title:'No goal yet',goalDone:goal?goal.progress:0,goalTarget:goal?goal.target:0,goalBar:bar(goal?pct(goal.progress,goal.target):0,'#2B6E4B'),
  duprGoal:d.dupr?d.dupr.toFixed(2):'–',coachNote:'Your coach’s notes appear here when your club adds them.',
  badgeStreak:streak,badgeVenues:venues,badgeBest:STAGE_LABEL[bestLabel]??'—',
  perms:SHARE.map(([k,label])=>{const v=!!d.sharing[k];return{label,aria:(v?'Hide ':'Show ')+label+' on public profile',flip:()=>act.share(k),sw:`width:52px;height:30px;border-radius:999px;border:0;padding:3px;cursor:pointer;display:flex;justify-content:${v?'flex-end':'flex-start'};background:${v?'#2B6E4B':'#DCE5DD'}`,knob:`width:24px;height:24px;border-radius:50%;background:${v?'#E4F75A':'#FFFFFF'};box-shadow:0 1px 2px rgba(0,0,0,.2)`};}),
  sharedCount:SHARE.filter(([k])=>d.sharing[k]).length,
  focusNames:FOCUS
 };
}
