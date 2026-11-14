import {useEffect,useState} from 'react';
import type {Go} from '../../navigation';
import type {ClubBundle} from '../../club/backend';
import {backend} from '../../club/index';
import {useLoad} from '../../club/screens/common';
import {isStaff} from '../../club/types';
import {ClubHome} from '../../club/screens/ClubHome';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from '../prototypes/Overview.dc.html?raw';
import {holes} from '../holes';
import {eventsBoardHref} from '../../club/boardLink';
const coming=/<div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">\s*<div class="between"><span style="font-weight:600">Cedar Open[\s\S]*?12 Dec<\/span><\/div>\s*<\/div>/;
const source=holes(raw.replace(/<aside[\s\S]*?<\/aside>/,'').replace(coming,'<div style="display:flex;flex-direction:column;gap:10px;margin-top:10px"><sc-for list="{{coming}}" as="c" hint-placeholder-count="3"><div class="between"><span style="{{c.style}}">{{c.name}}</span><span class="n" style="font-size:18px">{{c.date}}</span></div></sc-for><sc-if value="{{noComing}}" hint-placeholder-val="{{ false }}"><span class="mut">No events booked yet.</span></sc-if></div>'),[
 ['Tuesday 10 Nov','{{today}}'],['Five days to Cedar Open.','{{headline}}'],
 ['href="Event.dc.html">View public page ↗','href="{{publicHref}}">Find it on the Events board ↗'],['href="Desk.dc.html">Open tournament desk','href="{{deskHref}}">{{deskLabel}}'],
 ['Teams entered</div><div class="n acc">24</div><div class="mut" style="font-size:13px">of 32 · 2 waitlist','Teams entered</div><div class="n acc">{{entered}}</div><div class="mut" style="font-size:13px">{{enteredNote}}'],
 ['Courts</div><div class="n">4</div><div class="mut" style="font-size:13px">all with a referee','Courts</div><div class="n">{{courts}}</div><div class="mut" style="font-size:13px">{{courtNote}}'],
 ['Matches planned</div><div class="n">46</div><div class="mut" style="font-size:13px">5:00 to 9:30 pm','Matches planned</div><div class="n">{{matches}}</div><div class="mut" style="font-size:13px">{{matchNote}}'],
 ['Page views</div><div class="n">1,240</div><div class="mut" style="font-size:13px">this week','Need you</div><div class="n">{{needs}}</div><div class="mut" style="font-size:13px">{{needsNote}}'],
 ['href="Social.dc.html" style="align-self:flex-start">Make poster →','href="{{socialHref}}" style="align-self:flex-start">Make poster →']]);
const ticksKey=(id:string)=>'rq-overview-ticks:'+id;
const readTicks=(id?:string):Record<number,boolean>=>{if(!id)return {};try{return JSON.parse(localStorage.getItem(ticksKey(id))??'{}') as Record<number,boolean>;}catch{return {};}};
const day=(iso:string)=>new Date(iso+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'});
/** Organiser home in the prototype look, on the club's real events. The classic overview stays one tap away. */
export function RallyOverview({d,go}:{d:ClubBundle;go:Go}){
 const b=backend();const staff=isStaff(d.role);const[manual,setManual]=useState<Record<number,boolean>>({});
 const today=new Date().toISOString().slice(0,10);
 const open=d.tournaments.filter(t=>!t.cancelledAt&&!t.archivedAt);
 const live=open.filter(t=>t.status==='live');
 const upcoming=open.filter(t=>t.status==='draft'&&t.startDate>=today).sort((a,c)=>a.startDate.localeCompare(c.startDate));
 const focus=live[0]??upcoming[0];
 useEffect(()=>{setManual(readTicks(focus?.id));},[focus?.id]);
 const tick=(i:number)=>{const next={...manual,[i]:!manual[i]};setManual(next);if(focus)try{localStorage.setItem(ticksKey(focus.id),JSON.stringify(next));}catch{/* private mode: ticks last this visit */}};
 const regs=useLoad(async()=>b&&staff&&focus?b.registrations(focus.id):[],[b,staff,focus?.id]);
 const links=useLoad(async()=>b&&staff&&focus?b.scorerLinks(focus.id):[],[b,staff,focus?.id]);
 const r=(regs.data??[]).filter(x=>!['withdrawn','rejected'].includes(x.status));
 const pending=r.filter(x=>x.status==='pending').length,claims=r.filter(x=>x.payment==='claimed').length;
 const fm=focus?d.matches.filter(m=>m.tournamentId===focus.id&&m.status!=='void'):[];
 const courtsCovered=focus?Array.from({length:focus.courts},(_,i)=>i+1).filter(c=>(links.data??[]).some(l=>!l.revoked&&(!l.court||l.court===c))).length:0;
 const days=focus?Math.round((Date.parse(focus.startDate)-Date.parse(today))/864e5):0;
 const auto=[
  ['Event created',!!focus,'Done','club-desk'],['Entries reviewed',!!focus&&pending===0,pending+' pending','club-inbox'],['Payments checked',!!focus&&claims===0,claims+' to confirm','club-inbox'],
  ['Draw made',fm.length>0,'Desk','club-desk'],['Scorer link on every court',!!focus&&courtsCovered===focus.courts,courtsCovered+' of '+(focus?.courts??0),'club-scorers']] as [string,boolean,string,'club-desk'|'club-inbox'|'club-scorers'][];
 const man=['TV board tested on the venue screen','Dress rehearsal run'];
 const tasks=[...auto.map(([name,done,when,tool])=>({name,done,when,toggle:()=>focus?go(tool,focus.id):go('club-tournament-new',d.club.id)})),...man.map((name,i)=>({name,done:!!manual[i],when:manual[i]?'✓':'Tap when done',toggle:()=>tick(i)}))];
 const nx=tasks.findIndex(t=>!t.done);const done=tasks.filter(t=>t.done).length;
 const slug=(focus as {slug?:string}|undefined)?.slug??focus?.id??'';
 const values={
  today:new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'}),
  headline:!focus?'No event booked yet.':focus.status==='live'?focus.name+' is live.':days<=0?focus.name+' is today.':days===1?'Tomorrow: '+focus.name+'.':days+' days to '+focus.name+'.',
  publicHref:eventsBoardHref(focus),deskHref:focus?'#/club-desk/'+encodeURIComponent(focus.id):'#/club-tournament-new/'+encodeURIComponent(d.club.id),deskLabel:focus?'Open tournament desk':'Create tournament',socialHref:'#/club-social/'+encodeURIComponent(slug),
  entered:r.length,enteredNote:pending?pending+' waiting for you':'all confirmed',courts:focus?.courts??0,courtNote:focus?courtsCovered+' with a scorer link':'',
  matches:fm.length,matchNote:fm.length?fm.filter(m=>m.status==='done').length+' played':'draw not made yet',needs:pending+claims,needsNote:claims?claims+' payments to confirm':'nothing waiting',
  tasks:tasks.map((t,i)=>({...t,isNext:i===nx,cls:i===nx?'next':'',box:t.done?'width:22px;height:22px;border-radius:7px;background:#D9F24A;flex:none':'width:22px;height:22px;border-radius:7px;box-shadow:inset 0 0 0 2px #9FB4A6;flex:none',txt:t.done?'color:#9FB4A6;text-decoration:line-through':'font-weight:600'})),
  done,total:tasks.length,pct:Math.round(done/tasks.length*100)+'%',
  coming:upcoming.slice(0,3).map((t,i)=>({name:t.name,date:day(t.startDate),style:i?'color:#9FB4A6':'font-weight:600'})),noComing:!upcoming.length
 };
 if(live.length)return <><section aria-label="Club tools" style={{padding:'16px max(16px,2.4vw) 0'}}><ClubHome d={d} go={go}/></section><PrototypeScreen name="Overview" go={go} source={source} values={values}/></>;
 return <PrototypeScreen name="Overview" go={go} source={source} values={values}><section aria-label="Club tools" style={{padding:'0 max(16px,2.4vw) 32px'}}><ClubHome d={d} go={go}/></section></PrototypeScreen>;
}
