import {useState} from 'react';
import type {Go} from '../../navigation';
import {eventsBackend} from '../../club/index';
import {useLoad,errorText} from '../../club/screens/common';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from '../prototypes/Admin.dc.html?raw';
import {holes} from '../holes';
const source=holes(raw.replace(/<aside[\s\S]*?<\/aside>/,''),[
 ['<span class="chip gold">{{pending}} waiting for you</span></div>','<span class="chip gold">{{pending}} waiting for you</span></div><div class="tabs" role="tablist" aria-label="Admin sections"><sc-for list="{{menu}}" as="m" hint-placeholder-count="3"><button role="tab" class="{{m.cls}}" onClick="{{m.pick}}">{{m.name}} {{m.count}}</button></sc-for><a class="tab" href="{{moreHref}}" style="display:inline-flex;align-items:center">More admin tools →</a></div><sc-if value="{{msg}}" hint-placeholder-val="{{ false }}"><div class="card" style="padding:10px 14px;font-size:14px">{{msg}}</div></sc-if>'],
 ['Clubs live</div><div class="n acc">6</div>','Clubs live</div><div class="n acc">{{clubsLive}}</div>'],['Events in Nov</div><div class="n">6</div>','Events this month</div><div class="n">{{eventsMonth}}</div>'],
 ['Players</div><div class="n">420</div>','Entries</div><div class="n">{{entries}}</div>'],['Matches scored</div><div class="n">1,180</div>','Matches scored</div><div class="n">{{scored}}</div>'],
 ['<a href="Desk.dc.html" style="font-size:13px">View as organiser →</a>','<a href="{{e.href}}" style="font-size:13px">Public page →</a>']]);
type Tab='Clubs'|'Events'|'Brand';
const day=(iso:string)=>new Date(iso+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'});
/** Platform admin (RallyQ team only) in the prototype look: clubs to approve, events, brand. Every other admin tool stays in the classic dashboard. */
export function RallyAdmin({go}:{go:Go}){
 const b=eventsBackend();const[tab,setTab]=useState<Tab>('Clubs');const[msg,setMsg]=useState('');
 const data=useLoad(async()=>{if(!(await b.isPlatformAdmin()))return null;const[clubs,events]=await Promise.all([b.adminClubs(),b.adminTournaments()]);return{clubs:clubs.filter(c=>!c.isTest),events:events.filter(e=>!e.isTest)};},[b]);
 if(data.data===null&&!data.loading)return <div className="rq" style={{minHeight:'50vh',display:'grid',placeItems:'center',color:'#9FB4A6'}}>Only RallyQ admins can see this.</div>;
 if(!data.data)return <div className="rq" style={{minHeight:'50vh',display:'grid',placeItems:'center',color:'#9FB4A6'}}>{data.error??'Loading admin…'}</div>;
 const{clubs,events}=data.data;const month=new Date().toISOString().slice(0,7);
 // Approve calls setClubTrusted (admin_set_club_trusted): it marks the club trusted AND approves every unfinished tournament it has. Product decision pending.
 const approve=async(id:string,name:string)=>{try{await b.setClubTrusted(id,true);setMsg(name+' can now host events.');data.reload();}catch(e){setMsg(errorText(e));}};
 const status=(s:string)=>s==='live'?['Live','chip live']:s==='done'?['Done','chip']:['Draft','st wait'];
 const values={
  title:({Clubs:'Clubs on RallyQ',Events:'Events',Brand:'Brand for clubs'} as Record<Tab,string>)[tab],
  pending:clubs.filter(c=>!c.trusted).length,msg,moreHref:'#/admin/overview',
  menu:([['Clubs',clubs.length],['Events',events.length],['Brand','']] as [Tab,number|string][]).map(([n,c])=>({name:n,count:c,cls:n===tab?'tab on':'tab',pick:()=>setTab(n)})),
  isClubs:tab==='Clubs',isEvents:tab==='Events',isBrand:tab==='Brand',
  clubsLive:clubs.filter(c=>c.trusted).length,eventsMonth:events.filter(e=>e.startDate.slice(0,7)===month).length,entries:events.reduce((s,e)=>s+e.registrations,0),scored:events.reduce((s,e)=>s+e.matchesDone,0),
  clubs:clubs.map(c=>({n:c.name,a:c.city??'',e:c.lastEvent?day(c.lastEvent.slice(0,10)):'—',p:c.members+' members',st:c.trusted?'Live':'Pending',cls:c.trusted?'chip ball':'st wait',canApprove:!c.trusted,approve:()=>{void approve(c.id,c.name);}})),
  events:events.slice().sort((a,c)=>c.startDate.localeCompare(a.startDate)).slice(0,12).map(e=>{const[s,cls]=status(e.status);return{d:day(e.startDate),n:e.name,c:e.club,s,cls,href:'#/event/'+encodeURIComponent(e.slug)};})
 };
 return <PrototypeScreen name="Admin" go={go} source={source} values={values}/>;
}
