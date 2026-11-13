import {liveWinBar,winBarHtml} from '../../club/winBar';
import {useEffect,useMemo,useState} from 'react';
import {gameOver} from '../../club/domain/momentum';
import {COUNT_STEP_MS,MOTION_CSS,flipOnChange,pointLabel,serveOf,settled,stepAll,type Scores} from './motion';
import {useReducedMotion} from '../useReducedMotion';
import type {Go} from '../../navigation';
import {usePublicScores} from '../../club/screens/usePublicScores';
import {courtMatches,matchView} from '../../club/liveView';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from '../prototypes/TV.dc.html?raw';
import {holes} from '../holes';
import {friendlyDate} from '../../club/dates';
import {useClubLogo,logoTile} from '../useClubLogo';
const source=holes(raw,[
 ['width:1280px;height:720px','width:100vw;height:100vh;min-height:560px'],
 ['font-size:18px">CC</div>','font-size:18px;overflow:hidden">'+logoTile('{{clubMark}}')+'</div>'],
 ['Hosted by Cedar at Maple Courts','Hosted by {{clubName}}'],
 ['font-size:44px">Cedar Open</div>','font-size:44px">{{eventName}}</div>'],
 ['font-size:40px">6:42</span>','font-size:40px">{{clock}}</span>'],
 // The chip follows the event (Live / Final results / Starts …); the Desk link is for organisers, not the venue screen.
 ['<span class="chip live" style="font-size:13px;min-height:32px">Live</span>','<span class="{{statusChip}}" style="font-size:13px;min-height:32px">{{statusLabel}}</span>'],
 ['<a href="Desk.dc.html" class="btn ghost sm">← Desk</a>',''],
 ['Fatima / Zara vs Gita / Rekha · Sid / Rahul vs Leela / Tara · Open final 8:15 pm','{{upNext}}'],
 // Motion (team picks): score count, serve pulse, point wash, game/match point label (see ./motion.ts).
 ['<style>','<style>'+MOTION_CSS],
 ['display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;flex:1','display:grid;{{gridCols}};gap:16px;flex:1;min-height:0;grid-auto-rows:minmax(0,1fr)'],
 ['padding:18px 22px;display:flex;flex-direction:column;justify-content:space-between','padding:18px 22px;display:flex;flex-direction:column;justify-content:space-between;min-height:0;overflow:hidden'],
 ['<span class="cap">{{c.stage}}</span>','<span class="cap"><span class="{{c.chip}}" style="margin-right:8px;font-size:11px;min-height:22px">{{c.status}}</span>{{c.stage}}</span>'],
 ['class="card mini"','class="card mini {{c.wash}}"'],
 ['<span class="disp" style="font-size:26px">{{c.name}}</span>','<span class="disp" style="font-size:26px">{{c.name}}<span class="rqm-gpl">{{c.point}}</span></span>'],
 ['text-overflow:ellipsis">{{c.a}}</span>','text-overflow:ellipsis"><span class="rqm-srv {{c.sva}}" aria-hidden="true"></span>{{c.a}}</span>'],
 ['text-overflow:ellipsis">{{c.b}}</span>','text-overflow:ellipsis"><span class="rqm-srv {{c.svb}}" aria-hidden="true"></span>{{c.b}}</span>'],
 ['<span class="n acc" style="font-size:72px">{{c.sa}}</span>','<span class="n acc" style="font-size:72px"><span class="{{c.ka}}">{{c.sa}}</span></span>'],
 ['<span class="n" style="font-size:72px">{{c.sb}}</span>','<span class="n" style="font-size:72px"><span class="{{c.kb}}">{{c.sb}}</span></span>']]).replace(/(\{\{c\.sb\}\}<\/span>(?:<\/span>)?\s*<\/div>)/,'$1'+winBarHtml('c.win'));
const mark=(club:string)=>club.split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join('').toUpperCase();
/** Venue TV board: every court of one event, live from the public scores. Open it full screen on the venue TV. */
export function RallyTV({slug,go}:{slug:string;go:Go}){
 const scores=usePublicScores(slug);const logoUrl=useClubLogo(slug);const[now,setNow]=useState(new Date());
 useEffect(()=>{const t=setInterval(()=>setNow(new Date()),15000);return()=>clearInterval(t)},[]);
 const d=scores.data;const reduced=useReducedMotion();
 // Motion "count": when several points arrive in one update, the shown score steps up to the real one.
 const targets=useMemo(()=>{const t:Record<string,{a:number;b:number}>={};if(d)for(const{match}of courtMatches(d)){const v=matchView(d,match);t[match.id]={a:v.pointsA,b:v.pointsB};}return t;},[d]);
 const[shown,setShown]=useState<Scores>({});
 useEffect(()=>{if(settled(shown,targets))return;const fresh=Object.keys(targets).some(id=>!shown[id]);
  const h=setTimeout(()=>setShown(prev=>stepAll(prev,targets,reduced)),fresh||reduced?0:COUNT_STEP_MS);return()=>clearTimeout(h);},[shown,targets,reduced]);
 // Motion classes remember each court's last value, so only a change animates (the 15 s clock tick never re-animates).
 const[seen]=useState(()=>new Map<string,{value:string;cls:string}>());
 const courts=useMemo(()=>d?courtMatches(d).map(({court,match})=>{const v=matchView(d,match);const live=match.status==='live';
  const show=shown[match.id]??{a:v.pointsA,b:v.pointsB};
  const sa=match.status==='scheduled'?'':show.a,sb=match.status==='scheduled'?'':show.b;
  const over=!v.current||gameOver(v.pointsA,v.pointsB,v.format.pointsTo,!!v.format.golden);
  const serve=live?serveOf(v.current,v.division?.kind!=='singles',over):null;
  const point=live?pointLabel(v.pointsA,v.pointsB,v.format.pointsTo,!!v.format.golden,v.gamesA,v.gamesB,Math.ceil(v.format.bestOf/2)):'';
  const id=match.id;
  return{chip:live?'chip live':'chip',status:live?'Live':match.status==='done'?'Final':'Next',name:'Court '+court,stage:(v.division?.name??'')+(v.game>1?' · G'+v.game:'')+(serve?' · '+serve.call:''),a:v.a,b:v.b,sa,sb,
   ka:flipOnChange(seen,id+':a',String(sa),['rqm-t0','rqm-t1']),kb:flipOnChange(seen,id+':b',String(sb),['rqm-t0','rqm-t1']),
   // "wash" once per real point (not per count step); "pulse" re-runs because the dot only gets "on" when the serve moves.
   wash:live?flipOnChange(seen,id+':w',v.pointsA+'-'+v.pointsB,['rqm-w0','rqm-w1']):'',
   sva:serve?.side==='A'?'on':'',svb:serve?.side==='B'?'on':'',point,win:liveWinBar(d,match),tap:()=>undefined};}):[],[d,shown,seen]);
 const next=d?d.matches.filter(m=>m.status==='scheduled').sort((a,b)=>(a.slot??0)-(b.slot??0)).slice(0,3).map(m=>{const v=matchView(d,m);return v.a+' vs '+v.b;}).join(' · '):'';
 return <PrototypeScreen name="TV" go={go} source={source} values={{logoUrl:logoUrl??'',noLogo:!logoUrl,courts,gridCols:'grid-template-columns:repeat('+(courts.length<=4?2:courts.length<=6?3:4)+',minmax(0,1fr))',clubName:d?.club??'',clubMark:d?mark(d.club):'',eventName:d?.name??(scores.loading?'Loading…':'The board opens when the draw is made'),statusChip:d?.status==='live'?'chip live':'chip',statusLabel:!d?'':d.status==='live'?'Live':d.status==='done'?'Final results':'Starts '+friendlyDate(d.startDate),clock:now.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}),upNext:next||'Next matches appear here when the desk calls them.'}}/>;
}
