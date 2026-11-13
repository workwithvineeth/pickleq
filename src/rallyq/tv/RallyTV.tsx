import {liveWinBar,winBarHtml} from '../../club/winBar';
import {useEffect,useMemo,useRef,useState} from 'react';
import {gameOver} from '../../club/domain/momentum';
import {COUNT_STEP_MS,HOLD_MS,MOTION_CSS,STALE_FAILURES,STALE_MS,finishedHandOffs,flipOnChange,leadAccent,pointLabel,serveOf,settled,stepAll,type Scores} from './motion';
import {useReducedMotion} from '../useReducedMotion';
import type {Go} from '../../navigation';
import {usePublicScores} from '../../club/screens/usePublicScores';
import {courtMatches,matchView} from '../../club/liveView';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from '../prototypes/TV.dc.html?raw';
import {holes} from '../holes';
import {friendlyDate} from '../../club/dates';
import {useClubLogo,logoTile} from '../useClubLogo';
// TV sizes are in vh, read from across the room: scores, names, chips and the Up next line grow with the screen.
const source=holes(raw,[
 ['width:1280px;height:720px','width:100vw;height:100vh;min-height:560px'],
 ['font-size:18px">CC</div>','font-size:18px;overflow:hidden">'+logoTile('{{clubMark}}')+'</div>'],
 ['Hosted by Cedar at Maple Courts','Hosted by {{clubName}}'],
 ['<div class="disp" style="font-size:44px">Cedar Open</div>','<div class="disp {{titleCls}}" style="font-size:44px">{{eventName}}</div>'],
 ['font-size:40px">6:42</span>','font-size:40px">{{clock}}</span>'],
 // The chip follows the event (Live / Final results / Starts …); the Desk link is for organisers, not the venue screen.
 // Next to it: when the scores last arrived, or a coral warning once they stop arriving (a stale board never says Live).
 ['<span class="chip live" style="font-size:13px;min-height:32px">Live</span>','<sc-if value="{{statusLabel}}" hint-placeholder-val="{{ true }}"><span class="{{statusChip}}" style="font-size:max(13px,2.2vh);min-height:1.9em">{{statusLabel}}</span></sc-if><sc-if value="{{syncLabel}}" hint-placeholder-val="{{ false }}"><span class="{{syncChip}}" role="status" style="font-size:max(13px,2.2vh);min-height:1.9em">{{syncLabel}}</span></sc-if>'],
 ['<a href="Desk.dc.html" class="btn ghost sm">← Desk</a>',''],
 ['<span class="chip ball">Up next</span><span style="font-weight:600;font-size:18px;','<span class="chip ball" style="font-size:max(13px,2.2vh);min-height:1.9em">Up next</span><span style="font-weight:600;font-size:max(18px,2.6vh);'],
 ['Fatima / Zara vs Gita / Rekha · Sid / Rahul vs Leela / Tara · Open final 8:15 pm','{{upNext}}'],
 // Motion (team picks): score count, serve pulse, game/match point chip, finished-match hold (see ./motion.ts).
 ['<style>','<style>'+MOTION_CSS],
 ['display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;flex:1','display:grid;{{gridCols}};gap:16px;flex:1;min-height:0;grid-auto-rows:minmax(0,1fr)'],
 ['padding:18px 22px;display:flex;flex-direction:column;justify-content:space-between','padding:18px 22px;display:flex;flex-direction:column;justify-content:space-between;min-height:0;overflow:hidden'],
 ['<span class="cap">{{c.stage}}</span>','<span class="cap" style="font-size:max(11px,2.2vh)"><span class="{{c.chip}}" style="margin-right:8px;font-size:max(11px,2.2vh);min-height:1.9em">{{c.status}}</span>{{c.stage}}</span>'],
 ['class="card mini"','class="card mini {{c.cls}}"'],
 ['<span class="disp" style="font-size:26px">{{c.name}}</span>','<span class="disp" style="font-size:clamp(26px,3.6vh,44px)">{{c.name}}<span class="rqm-gpl {{c.pk}}">{{c.point}}</span></span>'],
 ['<span style="font-size:24px;font-weight:700;','<span style="font-size:clamp(24px,3.4vh,40px);font-weight:700;'],
 ['<span style="font-size:24px;font-weight:600;','<span style="font-size:clamp(24px,3.4vh,40px);font-weight:600;'],
 ['text-overflow:ellipsis">{{c.a}}</span>','text-overflow:ellipsis"><span class="rqm-srv {{c.sva}}" aria-hidden="true"></span><span class="rqm-win">{{c.wa}}</span>{{c.a}}</span>'],
 ['text-overflow:ellipsis">{{c.b}}</span>','text-overflow:ellipsis"><span class="rqm-srv {{c.svb}}" aria-hidden="true"></span><span class="rqm-win">{{c.wb}}</span>{{c.b}}</span>'],
 ['<span class="n acc" style="font-size:72px">{{c.sa}}</span>','<span class="n {{c.aca}}" style="font-size:{{c.fs}}"><span class="{{c.ka}}">{{c.sa}}</span></span>'],
 ['<span class="n" style="font-size:72px">{{c.sb}}</span>','<span class="n {{c.acb}}" style="font-size:{{c.fs}}"><span class="{{c.kb}}">{{c.sb}}</span></span>']]).replace(/(\{\{c\.sb\}\}<\/span>(?:<\/span>)?\s*<\/div>)/,'$1'+winBarHtml('c.win'));
const mark=(club:string)=>club.split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join('').toUpperCase();
/** Static placeholder courts while the first scores load (no shimmer: TV browsers repaint slowly). */
const BLANK=' '.repeat(14);
const SKELETON=Array.from({length:4},()=>({chip:'chip',status:'',name:' '.repeat(8),stage:'',a:BLANK,b:BLANK,sa:'  ',sb:'  ',fs:'clamp(72px,11vh,160px)',aca:'',acb:'',ka:'',kb:'',pk:'',point:'',wa:'',wb:'',sva:'',svb:'',cls:'rqm-skel',win:'',tap:()=>undefined}));
const hm=(t:Date|number)=>new Date(t).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'});
/** Venue TV board: every court of one event, live from the public scores. Open it full screen on the venue TV. */
export function RallyTV({slug,go}:{slug:string;go:Go}){
 const scores=usePublicScores(slug);const logoUrl=useClubLogo(slug);const[now,setNow]=useState(new Date());
 useEffect(()=>{const t=setInterval(()=>setNow(new Date()),15000);return()=>clearInterval(t)},[]);
 const d=scores.data;const reduced=useReducedMotion();
 // Polling stops once the event is final, so only a running event can go stale.
 const stale=!!d&&d.status!=='done'&&(scores.failures>=STALE_FAILURES||(scores.updatedAt!=null&&now.getTime()-scores.updatedAt>STALE_MS));
 // Match end hold: when a court moves on from a finished match, that match stays up for HOLD_MS with its winners.
 const lastOnCourt=useRef<Record<number,string>>({});
 const[held,setHeld]=useState<Record<number,string>>({});
 useEffect(()=>{if(!d)return;const on=courtMatches(d).map(({court,match})=>({court,id:match.id}));
  const fresh=finishedHandOffs(lastOnCourt.current,on,id=>d.matches.find(m=>m.id===id)?.status==='done');
  lastOnCourt.current=Object.fromEntries(on.map(x=>[x.court,x.id]));
  if(!Object.keys(fresh).length)return;
  setHeld(h=>({...h,...fresh}));
  // No cleanup: a newer poll inside the hold must not cancel this release.
  setTimeout(()=>setHeld(h=>Object.fromEntries(Object.entries(h).filter(([c,id])=>fresh[Number(c)]!==id))),HOLD_MS);},[d]);
 // Motion "count": when several points arrive in one update, the shown score steps up to the real one.
 const targets=useMemo(()=>{const t:Record<string,{a:number;b:number}>={};if(d)for(const{match}of courtMatches(d)){const v=matchView(d,match);t[match.id]={a:v.pointsA,b:v.pointsB};}return t;},[d]);
 const[shown,setShown]=useState<Scores>({});
 useEffect(()=>{if(settled(shown,targets))return;const fresh=Object.keys(targets).some(id=>!shown[id]);
  const h=setTimeout(()=>setShown(prev=>stepAll(prev,targets,reduced)),fresh||reduced?0:COUNT_STEP_MS);return()=>clearTimeout(h);},[shown,targets,reduced]);
 // Motion classes remember each court's last value, so only a change animates (the 15 s clock tick never re-animates).
 const[seen]=useState(()=>new Map<string,{value:string;cls:string}>());
 const courts=useMemo(()=>d?courtMatches(d).map(({court,match:onCourt},_,all)=>{
  const match=(held[court]&&d.matches.find(m=>m.id===held[court]))||onCourt;const hold=match!==onCourt;
  const v=matchView(d,match);const live=match.status==='live';
  const show=shown[match.id]??{a:v.pointsA,b:v.pointsB};
  const sa=match.status==='scheduled'?'':show.a,sb=match.status==='scheduled'?'':show.b;
  const over=!v.current||gameOver(v.pointsA,v.pointsB,v.format.pointsTo,!!v.format.golden);
  const serve=live?serveOf(v.current,v.division?.kind!=='singles',over):null;
  const point=live?pointLabel(v.pointsA,v.pointsB,v.format.pointsTo,!!v.format.golden,v.gamesA,v.gamesB,Math.ceil(v.format.bestOf/2)):'';
  const id=match.id,acc=leadAccent(sa,sb);
  // The card fades in each time its court shows a different match (after a hold, or when the desk calls the next one).
  const fade=flipOnChange(seen,'court:'+court,id,['rqm-f0','rqm-f1']);
  return{chip:live&&!stale?'chip live':'chip',status:live?(stale?'In play':'Live'):match.status==='done'?'Final':'Next',name:'Court '+court,stage:(v.division?.name??'')+(v.game>1?' · G'+v.game:'')+(serve?' · '+serve.call:''),a:v.a,b:v.b,sa,sb,
   // Smaller scores once there are more than four courts, so nothing is cut off in a 3- or 4-column grid.
   fs:all.length<=4?'clamp(72px,11vh,160px)':'clamp(48px,7vh,110px)',aca:acc.a,acb:acc.b,
   ka:flipOnChange(seen,id+':a',String(sa),['rqm-t0','rqm-t1']),kb:flipOnChange(seen,id+':b',String(sb),['rqm-t0','rqm-t1']),
   pk:(point==='Golden point'?'gold ':'')+flipOnChange(seen,id+':p',point,['rqm-p0','rqm-p1']),
   wa:hold&&match.winner==='A'?'Winners':'',wb:hold&&match.winner==='B'?'Winners':'',cls:(hold?'rqm-hold ':'')+fade,
   sva:serve?.side==='A'?'on':'',svb:serve?.side==='B'?'on':'',point,win:liveWinBar(d,match),tap:()=>undefined};}):[],[d,shown,seen,held,stale]);
 const next=d?d.matches.filter(m=>m.status==='scheduled').sort((a,b)=>(a.slot??0)-(b.slot??0)).slice(0,3).map(m=>{const v=matchView(d,m);return v.a+' vs '+v.b;}).join(' · '):'';
 const loading=!d&&scores.loading;const board=loading?SKELETON:courts;
 return <PrototypeScreen name="TV" go={go} source={source} values={{logoUrl:logoUrl??'',noLogo:!logoUrl,courts:board,gridCols:'grid-template-columns:repeat('+(board.length<=4?2:board.length<=6?3:4)+',minmax(0,1fr))',clubName:d?.club??'',clubMark:d?mark(d.club):'',
  eventName:d?.name??(loading?' '.repeat(16):'The board opens when the draw is made'),titleCls:loading?'rqm-skel':'',
  statusChip:d?.status==='live'?'chip live':'chip',statusLabel:!d||stale?'':d.status==='live'?'Live':d.status==='done'?'Final results':'Starts '+friendlyDate(d.startDate),
  syncChip:stale?'chip rqm-stale':'chip rqm-muted',syncLabel:!d?'':stale?'Reconnecting · scores may be behind':scores.updatedAt?'Updated '+hm(scores.updatedAt):'',
  clock:hm(now),upNext:loading?'Loading the board…':next||'Next matches appear here when the desk calls them.'}}/>;
}
