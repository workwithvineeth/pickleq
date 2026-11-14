import {teamWithDupr} from '../../club/duprText';
import {useEffect,useState} from 'react';
import type {Go} from '../../navigation';
import {serverBackend} from '../../club';
import {inLaunchCity} from '../../club/config';
import {useLoad} from '../../club/screens/common';
import {usePublicScores} from '../../club/screens/usePublicScores';
import {courtMatches,matchView,scoredPoints} from '../../club/liveView';
import {PrototypeScreen} from '../PrototypeScreen';
import {liveWinBar,NO_WIN_BAR,winBarFrom,winBarHtml,type WinBar} from '../../club/winBar';
import {winEstimate} from '../../club/winPredictor';
import liveRaw from '../prototypes/Live.dc.html?raw';
import {ShellState,shellSource} from '../ShellState';
/** The Live board with the win chance under the big score. */
const LIVE_SOURCE=liveRaw.replace('scored by court referee</span></div>','scored by court referee</span></div>'+winBarHtml('sel.win'))
 // When nothing is live the page shows the prototype sample: say so plainly, so nobody reads it as real scores.
 .replace('<span class="chip live">Live · {{today}}</span>','<span class="{{topChip}}">{{topLabel}}</span>')
 .replace('font-size:clamp(40px,5vw,64px);margin-top:12px">Live scores</h1>','font-size:clamp(40px,5vw,64px);margin-top:12px">Live scores</h1><sc-if value="{{isSample}}" hint-placeholder-val="{{ false }}"><p class="mut" style="margin:8px 0 0;font-size:14px;max-width:560px">Nothing is live right now. These are sample scores to show how it looks; real matches appear here as referees score them.</p></sc-if>')
 // How fresh the scores are (was a fixed 'Updated 4 s ago'); coral when the last refresh failed.
 .replace('<span class="mut" style="font-size:13px">Updated 4 s ago · ','<span class="mut" style="font-size:13px;{{updStyle}}">{{updated}} · ');
const LOADING=shellSource(liveRaw);
/** "Updated 12s ago" for the first minute, then the clock time of the last good load. */
export function updatedLabel(at:number|null,now:number,error:boolean,sample:boolean){
 if(error)return 'Can’t reach live scores · retrying';
 if(sample)return 'Sample scores';
 if(at===null)return 'Loading scores';
 const s=Math.max(0,Math.round((now-at)/1000));
 return s<60?'Updated '+s+'s ago':'Updated '+new Date(at).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'});
}
/** Two failed refreshes in a row (about 40 s), or a minute with no good refresh: the board may be behind. */
export function connectionLost(failures:number,at:number|null,now:number,finished=false){return !finished&&(failures>=2||(at!==null&&now-at>60_000));}
export function liveChipLabel(o:{lost:boolean;sample:boolean;directoryError:boolean;today:string;finished?:boolean}){
 if(o.finished)return 'Final results · '+o.today;
 if(o.lost)return 'Connection lost · scores may be behind';
 if(o.directoryError)return 'Can’t reach live scores · showing a sample';
 return (o.sample?'Sample scores · ':'Live · ')+o.today;
}
/** Sample win chance for the labelled sample (made-up ratings), so the sample shows what the bar looks like. */
const sampleWin=(a:string,b:string,sa:number,sb:number,gA:number,gB:number,rA:number[],rB:number[])=>winBarFrom(winEstimate({ratingsA:rA,ratingsB:rB,ralliesA:sa+gA*11,ralliesB:sb+gB*11,gamesA:gA,gamesB:gB,pointsA:sa,pointsB:sb,pointsTo:11,bestOf:3}),a,b);

interface Court {court:string;stage:string;a:string;b:string;sa:number;sb:number;game:number;games:string[];status:string;run:number;next:string;pts:string;win?:WinBar}
interface Venue {name:string;club:string;mark:string;courts:Court[];slug?:string}
const mark=(club:string)=>club.split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join('').toUpperCase();
/** Prototype sample, shown (and labelled) only when no event is live. */
export const SAMPLE:Venue[]=[
 {name:'Banyan',club:'Banyan Courts (sample)',mark:'BC',courts:[
  {court:'Court 1',stage:'Pool A',a:'Teja / Kiran',b:'Rohan / Ajay',sa:8,sb:5,game:1,games:[],status:'Live',run:4,next:'Pool A · Sana / Pooja vs Leela / Tara',pts:'AABAAB',win:sampleWin('Teja / Kiran','Rohan / Ajay',8,5,0,0,[4.1,3.9],[3.9,3.8])},
  {court:'Court 2',stage:'Men’s QF',a:'Rao / Iyer',b:'Khan / Patel',sa:9,sb:7,game:2,games:['11–8'],status:'Live',run:5,next:'QF 2 · Reddy / Naidu vs Das / Jain',pts:'ABAAAB',win:sampleWin('Rao / Iyer','Khan / Patel',9,7,1,0,[4.3,4.22],[4.1,4.0])},
  {court:'Court 3',stage:'Women’s SF',a:'Meera / Divya',b:'Ananya / Ritu',sa:11,sb:6,game:2,games:['11–9','11–6'],status:'Final',run:6,next:'Final at 7:40 pm',pts:'AAAABA'}]},
 {name:'Lakeside',club:'Lakeside Pickle Club (sample)',mark:'LPC',courts:[
  {court:'Court 1',stage:'Open SF',a:'Varun / Neel',b:'Imran / Joseph',sa:10,sb:10,game:3,games:['11–7','8–11'],status:'Live',run:3,next:'Final at 8:15 pm',pts:'ABABAB'}]},
 {name:'Deccan',club:'Deccan Dink Club (sample)',mark:'DDC',courts:[
  {court:'Court 1',stage:'DUPR round 3',a:'Mohan / Ravi',b:'Suresh / Prem',sa:6,sb:6,game:1,games:[],status:'Live',run:3,next:'Round 4 at 7:20 pm',pts:'ABBAAB'}]},
 {name:'Granite',club:'Granite Smash Arena (sample)',mark:'GSA',courts:[
  {court:'Court 1',stage:'Mixed QF',a:'Kavya / Arjun',b:'Nisha / Rahul',sa:3,sb:1,game:1,games:[],status:'Live',run:3,next:'QF 3 · Priya / Om vs Zoya / Sam',pts:'AABBAA'}]}
];
function longestRun(pts:string){let best=0,cur=0,prev='';for(const p of pts){cur=p===prev?cur+1:1;prev=p;best=Math.max(best,cur);}return best;}
export function liveValues(venues:Venue[],v:number,c:number,set:(p:{v?:number;c?:number})=>void){
 const venue=venues[v]??venues[0];const courts=venue?.courts??[];const ci=Math.min(c,Math.max(0,courts.length-1));
 const mk=(x:Court)=>({...x,win:x.status==='Live'?x.win??NO_WIN_BAR:NO_WIN_BAR,chip:x.status==='Live'?'chip live':'chip'});
 const s=courts[ci]?mk(courts[ci]):mk({court:'Court 1',stage:'',a:'No matches live right now',b:'Check back soon',sa:0,sb:0,game:1,games:[],status:'Waiting',run:0,next:'',pts:''});
 const first=(n:string)=>n.split(' / ')[0];
 return {venue:venue?.name??'',clubName:venue?.club??'',clubMark:venue?.mark??'',
  venues:venues.map((x,i)=>({name:x.name,cls:i===v?'tab on':'tab',pick:()=>set({v:i,c:0})})),
  courts:courts.map((x,i)=>({...mk(x),ring:i===ci?'box-shadow:inset 0 0 0 2px #D9F24A':'box-shadow:inset 0 0 0 1px rgba(241,244,234,.1)',pick:()=>set({c:i})})),
  sel:{...s,pts:[...s.pts.slice(-6)].map(ch=>({who:ch==='A'?first(s.a):first(s.b),cls:ch==='A'?'chip ball':'chip'})),run:s.run||longestRun(s.pts)}};
}
/** Live scores in the exact prototype layout, fed by the public scores of live events in the launch city. */
export function RallyLive({go,slug}:{go:Go;slug?:string}){
 const[chosen,setPick]=useState<{v:number|null;c:number}>({v:null,c:0});
 const directory=useLoad(async()=>{const server=serverBackend();return server?(await server.publicEvents()).filter(e=>inLaunchCity(e.city)&&e.status==='live'&&e.results):[]},[]);
 const events=directory.data??[];const want=slug?events.findIndex(e=>e.slug===slug):-1;const pick={v:chosen.v??Math.max(0,want),c:chosen.c};const ev=events[pick.v];const scores=usePublicScores(ev?.slug??'');
 const[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const t=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(t);},[]);
 // Real scores are on their way: show the skeleton, never the sample.
 if((directory.loading&&!directory.data)||(ev&&scores.loading&&!scores.data))return <ShellState name="Live" source={LOADING} go={go} loading/>;
 let venues:Venue[]=SAMPLE;
 if(events.length){
  venues=events.map((e,i)=>{const d=i===pick.v?scores.data:undefined;
   const courts:Court[]=d?courtMatches(d).map(({court,match})=>{const view=matchView(d,match);const cur=match.games.at(-1);const ok=cur?scoredPoints(cur,view.division?.kind!=='singles'):'';
    return {court:'Court '+court,stage:view.division?.name??d.name,a:teamWithDupr(d,match.entryA)??view.a,b:teamWithDupr(d,match.entryB)??view.b,sa:view.pointsA,sb:view.pointsB,game:view.game,games:match.games.filter((_g,k)=>k<view.game-1).map(g=>g.a+'–'+g.b),status:match.status==='live'?'Live':'Final',run:0,next:'',pts:ok,win:liveWinBar(d,match)};}):[];
   return {name:e.club,club:e.venue?e.club+' · '+e.venue:e.club,mark:mark(e.club),courts,slug:e.slug};});
 }
 const today=new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});const isSample=venues===SAMPLE;const finished=scores.data?.status==='done';const lost=!isSample&&connectionLost(scores.failures,scores.updatedAt,now,finished);
 const values={...liveValues(venues,pick.v,pick.c,p=>setPick(s=>({...s,...p}))),today,isSample,topChip:isSample||lost||finished?'chip':'chip live',updated:updatedLabel(scores.updatedAt,now,lost||!!scores.error,isSample),updStyle:lost||scores.error?'color:var(--coral)':'',topLabel:liveChipLabel({lost,sample:isSample,directoryError:!!directory.error,today,finished})};
 return <PrototypeScreen name="Live" source={LIVE_SOURCE} go={go} values={values}/>;
}
