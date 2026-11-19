import {duprLineOf,teamWithDupr} from '../../club/duprText';
import {liveWinBar,winBarHtml} from '../../club/winBar';
import {useState} from 'react';
import {entryFeeLine} from './fee';
import {MessageSheet,StickyEnter} from './EventExtras';
import {callHref,contactHref} from './contact';
export {contactHref} from './contact';
// Owner approval is required before contact details can leave through a public link.
const MESSAGE_CLUB_ENABLED = false;
// Listed-only events take entries outside RallyQ, so their page must reach the organiser (audit 19 Nov, needs Vineeth's OK before merge).
// The organiser gave this number for players to contact them; public_events already returns it. Set false to hide the buttons.
const LISTED_CONTACT_ENABLED = true;
/** A listed-only event that hasn't finished: players enter with the organiser, never "Entries closed". */
export const isListedUpcoming=(e:{listing?:string;status?:string})=>e.listing==='listed'&&e.status!=='done';
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
import {ShellState,shellSource} from '../ShellState';
const R:[string,string][]=[
 ['<span class="chip ball">Entries open</span><span class="cap" style="color:#DDE7DC">Sun 15 Nov · 5:00 pm · Maple Courts</span>','<span class="{{statusChip}}">{{statusLabel}}</span><span class="cap" style="color:#DDE7DC">{{whenWhere}}</span>'],
 ['>Cedar Open</h1>','>{{eventName}}</h1>'],
 ['<span class="chip">Men’s doubles</span><span class="chip">Women’s doubles</span><span class="chip">Mixed</span><span class="chip">4 courts</span>','<sc-for list="{{cats}}" as="c" hint-placeholder-count="3"><span class="chip">{{c}}</span></sc-for>'],
 ['font-weight:800;font-size:18px">CC</div>','font-weight:800;font-size:18px;overflow:hidden"><sc-if value="{{logoUrl}}" hint-placeholder-val="{{ false }}"><img src="{{logoUrl}}" alt="{{clubName}} logo" style="width:100%;height:100%;object-fit:contain"></sc-if><sc-if value="{{noLogo}}" hint-placeholder-val="{{ true }}">{{clubMark}}</sc-if></div>'],
 ['font-size:20px">Cedar at Maple Courts</div>','font-size:20px">{{hostLine}}</div>'],
 // Listed events show no entry count; the bar only shows against a real cap, so it never looks full at 0.
 ['<div class="card" style="padding:20px"><div class="cap">Spots filled</div><div class="row" style="align-items:baseline;margin-top:6px"><span class="n acc" style="font-size:56px">{{filled}}</span><span class="mut">of 32 teams</span></div><div class="bar" style="margin-top:12px"><i style="width:{{pct}}"></i></div></div>',
  '<sc-if value="{{showFill}}" hint-placeholder-val="{{ true }}"><div class="card" style="padding:20px"><div class="cap">Spots filled</div><div class="row" style="align-items:baseline;margin-top:6px"><span class="n acc" style="font-size:56px">{{filled}}</span><span class="mut">{{capLabel}}</span></div><sc-if value="{{hasCap}}" hint-placeholder-val="{{ true }}"><div class="bar" style="margin-top:12px"><i style="width:{{pct}}"></i></div></sc-if></div></sc-if>'],
 ['[YOUR PRICE] per team','{{entryLine}}'],
 ['Pay the club directly at the venue desk. Entries close Friday, 13 November at 9 pm.','{{entryNote}}'],
 ['Final · 8:15 pm','{{finalLabel}}'],
 ['Pools of 4, top 2 to knockouts. Games to 11, win by 2. Finals best of 3.','{{infoFormat}}'],
 ['Maple Courts, Hyderabad. 4 outdoor courts under lights. Parking on site.','{{infoVenue}}'],
 ['Cedar desk on WhatsApp: [CLUB NUMBER]','{{infoContact}}'],
 ['<div class="cap">Entry</div><div style="font-weight:700">','<div class="cap">Entry fee</div><div style="font-weight:700">'],
 // One primary button that follows the event: results, live, enter, or message the organiser.
 ['<button class="btn" onClick="{{join}}">{{joinLabel}}</button>','<button class="btn" data-hero-cta onClick="{{join}}" disabled="{{joinOff}}">{{joinLabel}}</button><sc-if value="{{canMessage}}" hint-placeholder-val="{{ false }}"><button class="btn ghost" onClick="{{message}}">{{messageLabel}}</button></sc-if>'],
 // Public entries carry no status: show the column only for the per-category rows (Open / Closed).
 ['<th>Status</th>','<sc-if value="{{hasStatus}}" hint-placeholder-val="{{ true }}"><th>Status</th></sc-if>'],
 ['<td><span class="{{e.cls}}">{{e.st}}</span></td>','<sc-if value="{{hasStatus}}" hint-placeholder-val="{{ true }}"><td><span class="{{e.cls}}">{{e.st}}</span></td></sc-if>']];
const SHELL=shellSource(raw);
// Semi-final cards: the status chip comes from the match (coral only while live) and live ones carry the win chance.
const SF_CARD='<span class="chip live">Live</span><span class="cap">{{m.court}}</span></div><div class="score" style="margin-top:8px"><span class="t">{{m.a}}</span><span class="n acc" style="font-size:20px">{{m.sa}}</span><span class="t">{{m.b}}</span><span class="n" style="font-size:20px">{{m.sb}}</span></div></div></sc-for>';
const source=holes(raw,R).replace(SF_CARD,'<span class="{{m.chip}}">{{m.st}}</span><span class="cap">{{m.court}}</span></div><div class="score" style="margin-top:8px"><span class="t">{{m.a}}</span><span class="n acc" style="font-size:20px">{{m.sa}}</span><span class="t">{{m.b}}</span><span class="n" style="font-size:20px">{{m.sb}}</span></div>'+winBarHtml('m.win')+'</div></sc-for>');

const mark=(club:string)=>club.split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join('').toUpperCase();
type Tab='Entries'|'Pools'|'Knockout'|'Info';
/** "Club at Venue", unless the venue already names the club ("Cedar Club, Maple Road"): then just the venue. */
export const hostLine=(club:string,venue?:string)=>!venue?club:venue.toLowerCase().includes(club.toLowerCase())?venue:club+' at '+venue;

export type EventAction='results'|'live'|'enter'|'contact'|'call';
/** The event page's one primary button, by the event's state. */
export function primaryAction(e:Pick<PublicEvent,'status'|'registrationOpen'|'contact'>&Partial<Pick<PublicEvent,'listing'>>):{label:string;to:EventAction|null}{
 if(e.status==='done')return{label:'See the results',to:'results'};
 if(e.status==='live')return{label:'Live scores',to:'live'};
 if(e.registrationOpen)return{label:'Enter the event',to:'enter'};
 if(isListedUpcoming(e))return LISTED_CONTACT_ENABLED&&contactHref(e.contact)?{label:'WhatsApp the organiser',to:'contact'}:{label:'Enter with the organiser',to:null};
 return MESSAGE_CLUB_ENABLED&&contactHref(e.contact)?{label:'Entries closed · Message the club',to:'contact'}:{label:'Entries closed',to:null};
}
async function findEvent(slug:string){let last:unknown=null;for(const src of await publicSourcesFor(slug)){try{const event=await src.publicEvent(slug);if(event)return{src,event};}catch(e){last=e;}}if(last)throw last;return null;}

/** Standings per pool from finished pool matches: wins, losses, point difference. */
export function poolTables(d:PublicTournament){
 const out:{name:string;court:string;rows:{t:string;w:number;l:number;d:string;style:string}[]}[]=[];
 for(const div of d.divisions){const pools=[...new Set(d.entries.filter(e=>e.divisionId===div.id).map(e=>e.pool??1))].sort((a,b)=>a-b);
  for(const pool of pools){const ents=d.entries.filter(e=>e.divisionId===div.id&&(e.pool??1)===pool);
   const t=new Map(ents.map(e=>[e.id,{t:teamWithDupr(d,e.id)??e.names.join(' / '),w:0,l:0,pd:0}]));
   for(const m of d.matches.filter(m=>m.divisionId===div.id&&m.stage==='pool'&&(m.pool??1)===pool&&m.status==='done')){const pa=m.games.reduce((s,g)=>s+g.a,0),pb=m.games.reduce((s,g)=>s+g.b,0);const A=t.get(m.entryA??''),B=t.get(m.entryB??'');if(A){A.pd+=pa-pb;if(m.winner==='A')A.w++;else if(m.winner==='B')A.l++;}if(B){B.pd+=pb-pa;if(m.winner==='B')B.w++;else if(m.winner==='A')B.l++;}}
   const rows=[...t.values()].sort((a,b)=>b.w-a.w||b.pd-a.pd).map((r,i)=>({t:r.t,w:r.w,l:r.l,d:(r.pd>0?'+':r.pd<0?'−':'')+Math.abs(r.pd),style:i<(div.advance??2)?'font-weight:700;color:#D9F24A':'color:#9FB4A6'}));
   out.push({name:(pools.length>1?'Pool '+String.fromCharCode(64+pool):div.name),court:div.name,rows});}}
 return out;
}
function koRows(d:PublicTournament,stage:'qf'|'sf'){return d.matches.filter(m=>m.stage===stage).map(m=>{const v=matchView(d,m);return{a:teamWithDupr(d,m.entryA)??v.a,b:teamWithDupr(d,m.entryB)??v.b,sa:v.pointsA,sb:v.pointsB,court:m.court?'Court '+m.court:'',win:liveWinBar(d,m),chip:m.status==='live'?'chip live':'chip',st:m.status==='live'?'Live':m.status==='done'?'Final':'Next',as:m.winner==='A'?'font-weight:700':'color:#9FB4A6',bs:m.winner==='B'?'font-weight:700':'color:#9FB4A6'};});}

export function eventValues(e:PublicEvent,d:PublicTournament|undefined,logoUrl:string|undefined,tab:Tab,setTab:(t:Tab)=>void,act:(to:EventAction)=>void){
 const listed=isListedUpcoming(e),reach=listed&&LISTED_CONTACT_ENABLED;
 // Listed: the second button calls the organiser. Run on RallyQ: "Message the club" stays off until the owner approves.
 const fee=entryFeeLine(e.divisions),canMessage=reach?!!callHref(e.contact):MESSAGE_CLUB_ENABLED&&!!contactHref(e.contact);
 const taken=e.divisions.reduce((s,x)=>s+x.taken,0);
 const caps=e.divisions.map(x=>(x.rules as {maxEntries?:number}).maxEntries).filter((n):n is number=>typeof n==='number');const cap=caps.length===e.divisions.length&&caps.length?caps.reduce((a,b)=>a+b,0):0;
 const live=e.status==='live';
 const entries=d?d.entries.map((x,i)=>({no:String(i+1).padStart(2,'0'),team:x.names.join(' / '),cat:d.divisions.find(v=>v.id===x.divisionId)?.name??'',dupr:duprLineOf(d,x.id).replace(/^DUPR /,'')||'—',st:'',cls:''})):e.divisions.map((x,i)=>({no:String(i+1).padStart(2,'0'),team:x.taken+' teams entered',cat:x.name,dupr:'—',st:e.registrationOpen?'Open':'Closed',cls:e.registrationOpen?'chip ball':'chip'}));
 const primary=primaryAction(e);
 return {
  hasStatus:!d&&!listed,showFill:!listed,hasCap:cap>0,messageLabel:reach?'Call the organiser':'Message the club',
  eventName:e.name,clubName:e.club,clubMark:mark(e.club),logoUrl:logoUrl??'',noLogo:!logoUrl,
  // "Hosted by" names the club; the venue is already in the date line above (audit 19 Nov).
  hostLine:e.club,
  statusLabel:live?'Live now':e.registrationOpen?'Entries open':e.status==='done'?'Results':listed?'Enter with the organiser':'Entries closed',statusChip:live?'chip live':e.registrationOpen||listed?'chip ball':'chip',
  whenWhere:[friendlyDate(e.startDate),friendlyTime(e.startTime),e.venue].filter(Boolean).join(' · '),
  cats:e.divisions.map(x=>x.name),
  tabs:(['Entries','Pools','Knockout','Info'] as Tab[]).map(n=>({name:n,cls:n===tab?'tab on':'tab',pick:()=>setTab(n)})),
  isEntries:tab==='Entries',isPools:tab==='Pools',isKo:tab==='Knockout',isInfo:tab==='Info',
  entries:listed&&!d?e.divisions.map((x,i)=>({no:String(i+1).padStart(2,'0'),team:'Enter with the organiser',cat:x.name,dupr:'—',st:'',cls:''})):entries,
  filled:taken,capLabel:listed?'':cap?'of '+cap+' teams':'teams entered',pct:(cap?Math.min(100,Math.round(taken/cap*100)):0)+'%',
  entryLine:fee||(e.registrationOpen?'Entries open':listed?'Enter with the organiser':'Entries closed'),canMessage,message:()=>act(reach?'call':'contact'),entryNote:listed?(reach&&contactHref(e.contact)?'Enter with the organiser: message them on WhatsApp or call.':'Enter with the organiser. Ask the host club for their number.'):e.entriesClose?'Entries close '+friendlyDate(e.entriesClose.slice(0,10))+'.':e.upiId?'Pay the club by UPI after you enter.':'Pay the club at the desk.',
  join:()=>{if(primary.to)act(primary.to);},joinLabel:primary.label,joinOff:!primary.to,
  pools:d?poolTables(d):[],qf:d?koRows(d,'qf'):[],sf:d?koRows(d,'sf'):[],finalLabel:'Final',
  infoFormat:e.about||e.divisions.map(x=>x.name).join(' · '),infoVenue:[e.venue,e.city].filter(Boolean).join(', ')||'Venue to be announced',infoContact:reach&&contactHref(e.contact)?'Use “WhatsApp the organiser” or “Call the organiser” at the top of this page.':canMessage?'Use “Message the club” at the top of this page. The club’s number stays private.':'Ask the host club at the desk.'
 };
}
/** Public event page in the exact prototype layout. Entering still uses the existing entry form. */
export function RallyEvent({slug,go}:{slug:string;go:Go}){
 const[tab,setTab]=useState<Tab>('Entries'),[msg,setMsg]=useState(false);
 const state=useLoad(()=>findEvent(slug),[slug]);
 const logo=useLoad(async()=>state.data?state.data.src.publicClubLogo(slug).catch(()=>null):null,[state.data,slug]);
 const scores=usePublicScores(state.data?.event.drawn||state.data?.event.results?slug:'');
 if(!state.data)return <ShellState name="Event" source={SHELL} go={go} loading={state.loading} message="This event link isn’t working."/>;
 const e=state.data.event;
 const act=(to:EventAction)=>{
  if(to==='results')go('results',slug);else if(to==='live')go('live',slug);
  else if(to==='enter')go('event-enter',e.divisions.length===1?slug+'~'+e.divisions[0].id:slug);
  else if(to==='call'){const tel=callHref(e.contact);if(tel)window.location.href=tel;}
  else if(isListedUpcoming(e)&&LISTED_CONTACT_ENABLED){const wa=contactHref(e.contact);if(wa)window.open(wa,'_blank','noopener');}
  else if(MESSAGE_CLUB_ENABLED&&contactHref(e.contact))setMsg(true);};
 const primary=primaryAction(e);
 return <PrototypeScreen name="Event" go={go} source={source} values={eventValues(e,scores.data??undefined,logo.data?.logoUrl,tab,setTab,act)}>
  <StickyEnter label={primary.label} disabled={!primary.to} onClick={()=>{if(primary.to)act(primary.to);}}/>
  {MESSAGE_CLUB_ENABLED&&msg&&<MessageSheet eventName={e.name} club={e.club} href={contactHref(e.contact)!} onClose={()=>setMsg(false)}/>}
 </PrototypeScreen>;
}
