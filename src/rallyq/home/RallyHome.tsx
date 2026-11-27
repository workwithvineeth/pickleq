import {useEffect,useState} from 'react';
import type {Go} from '../../navigation';
import {serverBackend} from '../../club';
import {inLaunchCity} from '../../club/config';
import {useLoad} from '../../club/screens/common';
import {usePublicScores} from '../../club/screens/usePublicScores';
import {PrototypeScreen} from '../PrototypeScreen';
import {INITIAL_MAIN,PILOT,SECTIONS,activeSection,mainValues,nextEventLine,type MainState,type SectionId} from './values';
import {boardUpdated,featured,heroChip,heroCta,heroEvent,liveBoards,liveCourts,schedule,tickerLines,type FeaturedMatch} from './home20';
import {winBarHtml} from '../../club/winBar';
import {LivingQ} from '../arena/LivingQ';
import {flip,type Seen} from '../motion/motion';
import {CountUp} from '../motion/CountUp';
import {useReducedMotion} from '../useReducedMotion';
import {SLIDES,useHeroSlides} from './useHeroSlides';
const SEEN:Seen=new Map();
import source from './Main.html?raw';
import raw20 from './Home20.html?raw';
/** Home with the win chance under the big court scoreboard (same bar as the Live page). */
const source20=raw20.replace('{{board.winBar}}',winBarHtml('board.win'));
/** One partner per line on the big scoreboard, so long names never break mid-word on a phone. */
const partners=(side:string)=><>{side.split(' / ').map((n,i)=><span key={i}>{n}</span>)}</>;

/** Home 20/10 (final prototype). Set to false to fall back to the previous Home in one line. */
export const HOME20=true;

function MatchCentre({f}:{f:FeaturedMatch}){
 const row=(t:'a'|'b')=>{const srv=f.serving===(t==='a'?'A':'B');return <div className={'mrow '+t+(srv?' srv':'')}><span className="dot" aria-hidden="true"/><b>{t==='a'?f.a:f.b}</b><span className="p"><span className={flip(SEEN,t+f.court+(t==='a'?f.a:f.b),String(t==='a'?f.sa:f.sb),'rqr')}>{t==='a'?f.sa:f.sb}</span></span></div>;};
 return <a className="mc" href="#/live" aria-label={`Match Centre: ${f.court} live, ${f.a} ${f.sa}, ${f.b} ${f.sb}. Open live scores.`}>
  <div className="mch"><i aria-hidden="true"/><span>{f.court} · {f.stage}</span></div>
  {row('a')}{row('b')}
  {f.rallies.length>0&&<div className="mcq"><div className="lq"><LivingQ rallies={f.rallies}/></div><div><b>{f.rallies.length} {f.rallies.length===1?'rally':'rallies'} so far</b><small>The Q grows with every rally</small></div><span className="qgo">Full board →</span></div>}
  <div className="mft"><span>Game {f.game}</span>{f.win.show&&<span>Win chance (estimate) <b>{f.win.wa} {f.a.split(' & ')[0]}</b></span>}</div>
 </a>;
}

/** Home: hero that follows the event (before, during, after), the live Match Centre, today's courts, the calendar and the clubs. No made-up scores: live parts come from the real event and hide when nothing is on. */
export function RallyHome({go}:{go:Go}){
 const[state,set]=useState<MainState>(INITIAL_MAIN);
 const reduced=useReducedMotion();
 // Hero photos change by themselves every 6.5 s (restored 27 Nov; lost in the 15 Nov release). Off with reduced motion.
 useHeroSlides(state.slide,()=>set(s=>({...s,slide:(s.slide+1)%SLIDES})),reduced);
 const directory=useLoad(async()=>{const server=serverBackend();return server?(await server.publicEvents().catch(()=>[])).filter(e=>inLaunchCity(e.city)):[]},[]);
 const events=directory.data??[],live=events.some(e=>e.status==='live'&&e.results);
 const hero=heroEvent(events);
 const scores=usePublicScores(HOME20&&hero&&hero.state==='during'?hero.event.slug:'');
 useEffect(()=>{
  const f=()=>{const tops:Partial<Record<SectionId,number>>={};for(const id of SECTIONS){const el=document.getElementById(id);if(el)tops[id]=el.getBoundingClientRect().top;}
   const end=innerHeight+scrollY>=document.documentElement.scrollHeight-4;const a=end?SECTIONS[SECTIONS.length-1]:activeSection(tops);
   set(s=>s.active===a?s:{...s,active:a});};
  f();addEventListener('scroll',f,{passive:true});addEventListener('resize',f);
  return()=>{removeEventListener('scroll',f);removeEventListener('resize',f)};
 },[]);
 const values=mainValues(state,patch=>set(s=>({...s,...patch})),{events});
 const[pick,setPick]=useState<string|null>(null);
 const[now,setNow]=useState(()=>Date.now());
 const live20=HOME20&&hero?.state==='during';
 // Ticks "Updated 9s ago" on the big scoreboard, only while an event is live.
 useEffect(()=>{if(!live20)return;const t=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(t);},[live20]);
 if(!HOME20)return <PrototypeScreen name="Main" go={go} source={source} hrefs={{HeroCta:live?'#/live':'#/events'}} values={{...values,heroCta:live?'Live now · See live scores':nextEventLine(events)}}/>;
 const d=scores.data,cta=heroCta(hero),f=featured(d),tick=tickerLines(d),today=schedule(d),courts=liveCourts(d);
 // Big scoreboard: the court picked below, else the Match Centre's court, else the first live court.
 const boards=liveBoards(d),b=boards.find(x=>x.court===pick)??boards.find(x=>x.court===f?.court)??boards[0];
 const board=b?{...b,nmA:partners(b.a),nmB:partners(b.b),tA:'t'+(b.servingA?' srv':''),tB:'t b'+(b.servingB?' srv':''),svA:b.servingA?'Serving':'',svB:b.servingB?'Serving':'',
  fA:flip(SEEN,'hbA'+b.court+b.a,String(b.sa),'rqr'),fB:flip(SEEN,'hbB'+b.court+b.b,String(b.sb),'rqr'),updated:boardUpdated(scores.updatedAt,now,!!scores.error||scores.failures>=2)}:undefined;
 const evs=(values.events as Array<Record<string,unknown>>).map((e,i)=>({...e,cls:'ev p'+(i%3)}));
 const v20={
  chip:heroChip(hero),chipCls:'hchip'+(hero?.state==='during'?'':' next'),heroCta:cta.label,
  matchCentre:f?<MatchCentre f={f}/>:undefined,
  ticker:tick.length?<div className="ticker" aria-hidden="true"><div className="tr">{[...tick,...tick].map((t,i)=><span key={i}>{t.live?<b>LIVE </b>:null}{t.text}</span>)}</div></div>:undefined,
  hasToday:today.length>0,today,todayCap:hero&&d?`${d.name} · ${d.club}`:'',
  events:evs,
  hasBoard:!!board,board,
  hasCourts:courts.length>0,courts:courts.map(c=>({...c,on:c.court===b?.court?'on':'',pressed:String(c.court===b?.court),pick:()=>setPick(c.court),fl:flip(SEEN,'lc'+c.court+c.a,c.sa+'-'+c.sb,'rqf'),ra:'r'+(c.servingA?' srv':'')+(c.leadB?' lose':''),rb:'r b'+(c.servingB?' srv':'')+(c.leadA?' lose':'')})),
  pilot3:[{n:<CountUp text={String(PILOT.matches)}/>,l:'matches scored'},{n:<CountUp text={PILOT.points.toLocaleString('en-IN')}/>,l:'points recorded live'},{n:<CountUp text={String(PILOT.players)}/>,l:'players'}],
 };
 return <PrototypeScreen name="Main" go={go} source={source20} hrefs={{HeroCta:cta.href}} values={{...values,...v20}}/>;
}
