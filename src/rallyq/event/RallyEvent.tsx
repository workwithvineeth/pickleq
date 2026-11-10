import {useState} from 'react';
import type {Go} from '../../navigation';
import type {PublicEvent,PublicTournament} from '../../club/backend';
import {publicSourcesFor} from '../../club';
import {useLoad} from '../../club/screens/common';
import {usePublicScores} from '../../club/screens/usePublicScores';
import {friendlyDate,friendlyTime} from '../../club/dates';
import {matchView} from '../../club/liveView';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from '../prototypes/Event.dc.html?raw';
import {holes} from '../holes';
const R:[string,string][]=[
 ['<span class="chip ball">Entries open</span><span class="cap" style="color:#DDE7DC">Sun 15 Nov · 5:00 pm · Crosscourts</span>','<span class="{{statusChip}}">{{statusLabel}}</span><span class="cap" style="color:#DDE7DC">{{whenWhere}}</span>'],
 ['>Rally33 Open</h1>','>{{eventName}}</h1>'],
 ['<span class="chip">Men’s doubles</span><span class="chip">Women’s doubles</span><span class="chip">Mixed</span><span class="chip">4 courts</span>','<sc-for list="{{cats}}" as="c" hint-placeholder-count="3"><span class="chip">{{c}}</span></sc-for>'],
 ['font-weight:800;font-size:18px">R33</div>','font-weight:800;font-size:18px;overflow:hidden"><sc-if value="{{logoUrl}}" hint-placeholder-val="{{ false }}"><img src="{{logoUrl}}" alt="{{clubName}} logo" style="width:100%;height:100%;object-fit:contain"></sc-if><sc-if value="{{noLogo}}" hint-placeholder-val="{{ true }}">{{clubMark}}</sc-if></div>'],
 ['font-size:20px">Rally33 at Crosscourts</div>','font-size:20px">{{hostLine}}</div>'],
 ['<span class="mut">of 32 teams</span>','<span class="mut">{{capLabel}}</span>'],
 ['[YOUR PRICE] per team','{{entryLine}}'],
 ['Pay the club directly at the venue desk. Entries close Friday, 13 November at 9 pm.','{{entryNote}}'],
 ['Final · 8:15 pm','{{finalLabel}}'],
 ['Pools of 4, top 2 to knockouts. Games to 11, win by 2. Finals best of 3.','{{infoFormat}}'],
 ['Crosscourts, Hyderabad. 4 outdoor courts under lights. Parking on site.','{{infoVenue}}'],
 ['Rally33 desk on WhatsApp: [CLUB NUMBER]','{{infoContact}}']];
const source=holes(raw,R);

const mark=(club:string)=>club.split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join('').toUpperCase();
type Tab='Entries'|'Pools'|'Knockout'|'Info';
async function findEvent(slug:string){let last:unknown=null;for(const src of await publicSourcesFor(slug)){try{const event=await src.publicEvent(slug);if(event)return{src,event};}catch(e){last=e;}}if(last)throw last;return null;}

/** Standings per pool from finished pool matches: wins, losses, point difference. */
export function poolTables(d:PublicTournament){
 const out:{name:string;court:string;rows:{t:string;w:number;l:number;d:string;style:string}[]}[]=[];
 for(const div of d.divisions){const pools=[...new Set(d.entries.filter(e=>e.divisionId===div.id).map(e=>e.pool??1))].sort((a,b)=>a-b);
  for(const pool of pools){const ents=d.entries.filter(e=>e.divisionId===div.id&&(e.pool??1)===pool);
   const t=new Map(ents.map(e=>[e.id,{t:e.names.join(' / '),w:0,l:0,pd:0}]));
   for(const m of d.matches.filter(m=>m.divisionId===div.id&&m.stage==='pool'&&(m.pool??1)===pool&&m.status==='done')){const pa=m.games.reduce((s,g)=>s+g.a,0),pb=m.games.reduce((s,g)=>s+g.b,0);const A=t.get(m.entryA??''),B=t.get(m.entryB??'');if(A){A.pd+=pa-pb;if(m.winner==='A')A.w++;else if(m.winner==='B')A.l++;}if(B){B.pd+=pb-pa;if(m.winner==='B')B.w++;else if(m.winner==='A')B.l++;}}
   const rows=[...t.values()].sort((a,b)=>b.w-a.w||b.pd-a.pd).map((r,i)=>({t:r.t,w:r.w,l:r.l,d:(r.pd>0?'+':r.pd<0?'−':'')+Math.abs(r.pd),style:i<(div.advance??2)?'font-weight:700;color:#D9F24A':'color:#9FB4A6'}));
   out.push({name:(pools.length>1?'Pool '+String.fromCharCode(64+pool):div.name),court:div.name,rows});}}
 return out;
}
function koRows(d:PublicTournament,stage:'qf'|'sf'){return d.matches.filter(m=>m.stage===stage).map(m=>{const v=matchView(d,m);return{a:v.a,b:v.b,sa:v.pointsA,sb:v.pointsB,court:m.court?'Court '+m.court:'',as:m.winner==='A'?'font-weight:700':'color:#9FB4A6',bs:m.winner==='B'?'font-weight:700':'color:#9FB4A6'};});}

export function eventValues(e:PublicEvent,d:PublicTournament|undefined,logoUrl:string|undefined,tab:Tab,setTab:(t:Tab)=>void,enter:()=>void){
 const taken=e.divisions.reduce((s,x)=>s+x.taken,0);
 const caps=e.divisions.map(x=>(x.rules as {maxEntries?:number}).maxEntries).filter((n):n is number=>typeof n==='number');const cap=caps.length===e.divisions.length&&caps.length?caps.reduce((a,b)=>a+b,0):0;
 const live=e.status==='live';
 const entries=d?d.entries.map((x,i)=>({no:String(i+1).padStart(2,'0'),team:x.names.join(' / '),cat:d.divisions.find(v=>v.id===x.divisionId)?.name??'',dupr:x.seed?'#'+x.seed:'—',st:'Confirmed',cls:'chip ball'})):e.divisions.map((x,i)=>({no:String(i+1).padStart(2,'0'),team:x.taken+' teams entered',cat:x.name,dupr:'—',st:e.registrationOpen?'Open':'Closed',cls:e.registrationOpen?'chip ball':'chip'}));
 return {
  eventName:e.name,clubName:e.club,clubMark:mark(e.club),logoUrl:logoUrl??'',noLogo:!logoUrl,
  hostLine:e.venue?e.club+' at '+e.venue:e.club,
  statusLabel:live?'Live now':e.registrationOpen?'Entries open':e.status==='done'?'Results':'Entries closed',statusChip:live?'chip live':e.registrationOpen?'chip ball':'chip',
  whenWhere:[friendlyDate(e.startDate),friendlyTime(e.startTime),e.venue].filter(Boolean).join(' · '),
  cats:e.divisions.map(x=>x.name),
  tabs:(['Entries','Pools','Knockout','Info'] as Tab[]).map(n=>({name:n,cls:n===tab?'tab on':'tab',pick:()=>setTab(n)})),
  isEntries:tab==='Entries',isPools:tab==='Pools',isKo:tab==='Knockout',isInfo:tab==='Info',
  entries,filled:taken,capLabel:cap?'of '+cap+' teams':'teams entered',pct:(cap?Math.min(100,Math.round(taken/cap*100)):100)+'%',
  entryLine:e.registrationOpen?'Entries open':'Entries closed',entryNote:e.entriesClose?'Entries close '+friendlyDate(e.entriesClose.slice(0,10))+'.':e.upiId?'Pay the club by UPI after you enter.':'Pay the club at the desk.',
  join:enter,joinLabel:e.registrationOpen?'Enter the event':'See live scores',
  pools:d?poolTables(d):[],qf:d?koRows(d,'qf'):[],sf:d?koRows(d,'sf'):[],finalLabel:'Final',
  infoFormat:e.about||e.divisions.map(x=>x.name).join(' · '),infoVenue:[e.venue,e.city].filter(Boolean).join(', ')||'Venue to be announced',infoContact:e.contact||'Ask the host club at the desk.'
 };
}
/** Public event page in the exact prototype layout. Entering still uses the existing entry form. */
export function RallyEvent({slug,go}:{slug:string;go:Go}){
 const[tab,setTab]=useState<Tab>('Entries');
 const state=useLoad(()=>findEvent(slug),[slug]);
 const logo=useLoad(async()=>state.data?state.data.src.publicClubLogo(slug).catch(()=>null):null,[state.data,slug]);
 const scores=usePublicScores(state.data?.event.drawn||state.data?.event.results?slug:'');
 if(!state.data)return <div className="rq" style={{minHeight:'60vh',display:'grid',placeItems:'center',color:'#9FB4A6'}}>{state.loading?'Loading event…':state.error??'This event could not be found.'}</div>;
 const e=state.data.event;
 return <PrototypeScreen name="Event" go={go} source={source} values={eventValues(e,scores.data??undefined,logo.data?.logoUrl,tab,setTab,()=>e.registrationOpen?go('event-enter',e.divisions.length===1?slug+'~'+e.divisions[0].id:slug):go('live'))}/>;
}
