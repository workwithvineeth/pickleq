import type { CSSProperties } from 'react';
import type { Go } from '../../navigation';
import type { ClubBackend, TournamentBundle } from '../backend';
import { isApproved, isStaff } from '../types';
import { friendlyDate, friendlyTime } from '../dates';
import { Header, useLoad } from './common';
const courtPhoto=import.meta.env.BASE_URL+'prototype6/court-night.jpg';
export function EventPhotoHeader({id,title,status,date,time,venue,onBack,club,logoUrl}: {id:string;title:string;poster?:string;status:string;date:string;time:string;venue?:string;club?:string;logoUrl?:string;onBack:()=>void}) { return <section className="photo pq-event-photo"><div className="ph" style={{backgroundImage:"url("+courtPhoto+")"}}/><div className="pq-event-photo-content"><div className="pq-event-topline"><span className="pq-event-club">{logoUrl && <img src={logoUrl} alt="" />}{club}</span><span className={"chip b"+(status==='Live'?' pq-live-badge':'')}>{status}</span></div><div><Header id={id} title={title} onBack={onBack}/><p>{[friendlyDate(date),friendlyTime(time),venue].filter(Boolean).join(" · ")}</p></div></div></section>; }
export function TournamentEntrySummary({d,b,go}: {d:TournamentBundle;b:ClubBackend|null;go:Go}) {
 const t=d.tournament,staff=isStaff(d.role),registration=t.entryMode==='registration';
 const regs=useLoad(async()=>b&&staff&&registration?b.registrations(t.id):null,[b,t.id,staff,registration]);
 const accepted=registration?regs.data?.filter(r=>r.status==='accepted').length:d.entries.filter(e=>e.status!=='withdrawn').length;
 const cap=d.divisions.every(v=>v.rules?.cap!==undefined)?d.divisions.reduce((n,v)=>n+(v.rules?.cap??0),0):undefined;
 const paid=regs.data?.filter(r=>r.payment==='paid'&&!['rejected','withdrawn'].includes(r.status));
 const total=paid?.reduce((n,r)=>n+(d.divisions.find(v=>v.id===r.divisionId)?.rules?.fee??0),0);
 const percent=accepted!==undefined&&cap?Math.min(100,accepted/cap*100):100;
 return <aside className="photo pq-entry-summary" aria-label="Entry summary">
  <div className="ph" style={{backgroundImage:"url("+import.meta.env.BASE_URL+"prototype6/ball-court.jpg)"}}/>
  <div className="ch"><h2>Entries</h2></div>
  <div className="pq-entry-statline">
   {accepted!==undefined&&<div className="pq-entry-ring" style={{"--entry-progress":percent+"%"} as CSSProperties}><span><b className="pq-score">{accepted}</b>{cap!==undefined?" of "+cap:""}<small>entries</small></span></div>}
   <div className="pq-entry-details"><p>{d.divisions.length} {d.divisions.length===1?"category":"categories"}</p>
    {total!==undefined&&<p>₹{total.toLocaleString("en-IN")} marked paid</p>}
    {regs.data&&<p>{regs.data.filter(r=>r.status==="waitlist").length} on waitlist</p>}
   </div>
  </div>
  {regs.error&&<p role="alert">Entry totals unavailable. <button className="link-btn" onClick={regs.reload}>Try again</button></p>}
  <div className="pq-entry-actions">
   {t.registrationOpen&&t.isPublic&&isApproved(t)&&registration&&<button type="button" className="btn btn-primary" onClick={()=>go("event-enter",t.publicSlug)}>Enter now</button>}
   {staff&&<button type="button" className="btn btn-outline" onClick={()=>go("club-tournament-new",d.club.id)}>+ New tournament</button>}
  </div>
 </aside>;
}

export function DeskNeedsYou({b,d,go}: {b:ClubBackend;d:TournamentBundle;go:Go}) {
 const t=d.tournament;
 const links=useLoad(()=>b.scorerLinks(t.id),[b,t.id]);
 const missing=links.data?Array.from({length:t.courts},(_,i)=>i+1).filter(c=>!links.data!.some(l=>!l.revoked&&(!l.court||l.court===c))).length:undefined;
 return <section className="pq-glass section pq-desk-needs" aria-label="Needs you"><div className="row"><h2>Needs you</h2><span className="pq-overview-count pq-score">{missing??'—'}</span></div>
 {links.error?<p>Referee links unavailable. <button className="link-btn" onClick={links.reload}>Try again</button></p>:missing===undefined?<p role="status">Loading referee links…</p>:missing>0?<><p>Referee links not created · {missing} courts</p><button className="btn btn-outline" onClick={()=>go('club-scorers',t.id)}>Create referee links</button></>:<p className="small muted">Every court has a referee link.</p>}</section>;
}
