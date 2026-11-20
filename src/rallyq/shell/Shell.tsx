import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useState,type ReactNode} from 'react';
import type {Go} from '../../navigation';
import {chooseTheme,currentTheme,subscribeTheme} from '../../theme';
import {eventsBackend} from '../../club/index';
import {accountLink,useHome} from '../useHome';
import {scopedCSS} from '../PrototypeScreen';
import raw from './v12.css?raw';
import arenaRaw from './arena-v2.css?raw';
import resultsRaw from './results-2010.css?raw';
import { padCSS as padRaw } from './pad';
import {Q_PATH,Watermark} from './Watermark';

/** RallyQ v1.2 shell: the final prototype's styles (docs/final-prototype/*.dc.html) around real screens.
 * Inside a shell, write markup with the prototype's classes: card, list, tbl, btn, st ok, tabs, fld, inp, opt, cglass… */
const CSS=scopedCSS(raw+'\n'+(arenaRaw+'\n'+padRaw+'\n'+resultsRaw).replaceAll('url(./','url(%BASE%rallyq/')).replaceAll('%BASE%',import.meta.env.BASE_URL);
const Q=Q_PATH;
export function QMark({ink='#F1F4EA',accent='#D9F24A',className,size}:{ink?:string;accent?:string;className?:string;size?:number}){
 return <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true"><path d={Q} fill="none" stroke={ink} strokeWidth="10" strokeLinecap="butt"/><line x1="28" y1="50" x2="72" y2="50" stroke={accent} strokeWidth="3"/><circle cx="83" cy="83" r="11" fill={accent}/></svg>;
}
export function useDay(){const[day,setDay]=useState(currentTheme()==='light');useEffect(()=>subscribeTheme(()=>setDay(currentTheme()==='light')),[]);return day;}
/** Organiser pages keep the Night/Day switch in the page head (prototype). The shell adds it when the page did not. */
const OrgSlot=createContext<{reg:(k:'mode'|'head')=>()=>void;hasMode:boolean}|null>(null);
export function ModeButton({auto=false}:{auto?:boolean}={}){const day=useDay(),slot=useContext(OrgSlot),reg=slot?.reg;useLayoutEffect(()=>auto||!reg?undefined:reg('mode'),[auto,reg]);return <button type="button" className="mode" aria-label={day?'Switch to night mode':'Switch to day mode'} onClick={()=>chooseTheme(day?'dark':'light')}><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d={day?'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4':'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'}/></svg></span></button>;}
export function Signoff({text='Scores by',onClick}:{text?:string;onClick?:()=>void}){const inner=<><span>{text}</span><QMark/><span className="word">RallyQ</span></>;return onClick?<a className="signoff" href="#/" onClick={e=>{e.preventDefault();onClick()}}>{inner}</a>:<span className="signoff">{inner}</span>;}
export interface Host{marks:string[];cap?:string;name:string}
/** Short club name: "Rally33 at Crosscourts" → "Rally33". */
export function clubShort(name:string){return name.trim().split(/\s+(?:at|@)\s+/i)[0]||name.trim();}
/** Club tile letters: "Rally33 at Crosscourts" → "R33", "The Pickleball Company" → "TPC", "Loki" → "LOK". */
/** Letters a club tile must never spell (file types, rude words): then the first letter plus the last two words' letters. */
const BAD_MARKS=new Set(['PDF','ZIP','SOS','ASS','SEX','WTF','FCK','KKK','FAT','PIG','CUM','GAY','XXX']);
export function clubMark(name:string){const w=clubShort(name).split(/\s+/).filter(Boolean);if(w.length===1){const m=w[0].match(/^(\p{L})\p{L}*(\d+)$/u);return(m?m[1]+m[2]:w[0]).slice(0,3).toUpperCase();}const i=w.map(x=>x[0].toUpperCase());const mark=i.join('').slice(0,3);return BAD_MARKS.has(mark)&&i.length>3?i[0]+i.slice(-2).join(''):mark;}
export function HostBlock({host,onClick}:{host:Host;onClick?:()=>void}){
 const tiles=host.marks.map((m,i)=><span key={i} className="tile">{m}</span>);
 return <a className="host" href="#/" onClick={e=>{e.preventDefault();onClick?.()}}>{host.marks.length>1?<span className="tiles">{tiles}</span>:tiles}<span><span className="cap">{host.cap??'Hosted by'}</span><b>{host.name}</b></span></a>;
}
function Frame({children,watermark=true}:{children:ReactNode;watermark?:boolean}){
 const day=useDay();const style=useMemo(()=><style>{CSS}</style>,[]);
 return <div className="rallyq-prototype rq-v12">{style}<div className={day?'rq day':'rq'} style={{minHeight:'100vh'}}>{watermark&&<Watermark/>}{children}</div></div>;
}
export type PublicTab='live'|'events'|'entries'|'studio'|'clubs'|null;
/** Sign out from any v1.2 page, then open the sign-in page. */
export async function signOutTo(go:Go){await eventsBackend().signOut().catch(()=>undefined);go('club-signin',undefined,{replace:true});}
/** Public pages: club leads in the header, RallyQ signs off small and last. */
/** Public pages lead with the RallyQ logo alone. A club tile shows only when a page passes that club's own `host` (its event, its results). */
export function PublicShell({go,active=null,host,right,children,footNote}:{go:Go;active?:PublicTab;host?:Host;right?:ReactNode;children:ReactNode;footNote?:string}){
 const home=useHome(),signedIn=home.signedIn,acct=accountLink(home),[menu,setMenu]=useState(false);
 // Signed out: the four public links. Signed in: My entries instead of "For clubs" (the header's account link is already My clubs or My Studio), so nothing shows twice.
 const links:[PublicTab,string,()=>void][]=signedIn?[['live','Live scores',()=>go('live')],['events','Events',()=>go('events')],['entries','My entries',()=>go('my-entries')],['studio','Player Studio',()=>go('club-player-studio')]]:[['live','Live scores',()=>go('live')],['events','Events',()=>go('events')],['studio','Player Studio',()=>go('club-player-studio')],['clubs','For clubs',()=>go('club-signin')]];
 const nav=(cls:string)=>links.map(([k,label,f])=><a key={k} className={cls&&k===active?'on':undefined} href="#/" aria-current={k===active?'page':undefined} onClick={e=>{e.preventDefault();setMenu(false);f()}}>{label}</a>);
 return <Frame><header className="hdr"><div className="wrap"><div className="lead"><a className="brand" href="#/" aria-label="RallyQ home" onClick={e=>{e.preventDefault();go(home.route)}}><QMark/><span className="word">RallyQ</span></a>{host&&<HostBlock host={host} onClick={()=>go('events')}/>}</div><nav className="nav" aria-label="Main">{nav('x')}</nav>
  <div className="right">{right??<a className="tlink" href="#/" onClick={e=>{e.preventDefault();go(acct.route)}}>{acct.label}</a>}<ModeButton/><button type="button" className="menu" aria-label="Menu" aria-expanded={menu} onClick={()=>setMenu(!menu)}><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><Signoff/></div></div></header>
  {menu&&<nav className="mpanel" aria-label="Menu">{nav('')}{!right&&(!signedIn||home.staff)&&<a href="#/" onClick={e=>{e.preventDefault();setMenu(false);go(acct.route)}}>{acct.label}</a>}{signedIn&&<a href="#/" onClick={e=>{e.preventDefault();setMenu(false);void signOutTo(go)}}>Sign out</a>}</nav>}
  <main className="wrap" style={{paddingBlock:'28px 40px',display:'flex',flexDirection:'column',gap:28}}>{children}</main>
  <div className="wrap pfoot"><span>{footNote??''}</span><Signoff/></div></Frame>;
}
export type OrgTab='home'|'tournaments'|'results'|'club'|'social'|'entries'|'draw'|'desk'|'referees'|'tv'|'studio';
/** Organiser pages: host club on top of the side menu, event steps below, RallyQ sign-off last. */
export function OrgShell({go,active,clubName='Your club',clubId,tournament,children}:{go:Go;active:OrgTab;clubName?:string;clubId?:string;tournament?:{id:string;name:string;slug?:string|null};children:ReactNode}){
 // Each menu link carries its real address, so copy-link / open-in-new-tab land on that page (UX-06).
 const item=(k:OrgTab,label:string,to:Parameters<Go>[0],id?:string)=><a key={k} className={k===active?'on':undefined} aria-current={k===active?'page':undefined} href={'#/'+to+(id?'/'+encodeURIComponent(id):'')} onClick={e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;e.preventDefault();go(to,id)}}>{label}</a>;
 const t=tournament;
 const[n,setN]=useState({mode:0,head:0});
 const reg=useCallback((k:'mode'|'head')=>{setN(c=>({...c,[k]:c[k]+1}));return()=>setN(c=>({...c,[k]:c[k]-1}));},[]);
 const slot=useMemo(()=>({reg,hasMode:n.mode>0}),[reg,n.mode]);
 return <Frame><div className="shell"><aside className="side" aria-label="Organiser menu"><HostBlock host={{marks:[clubMark(clubName)],name:clubName}} onClick={()=>go('club')}/>
  <span className="cap grp">{clubShort(clubName)}</span>{item('home','Home','club')}{item('tournaments','Tournaments','club-tournaments')}{item('results','Results & DUPR','club-results')}{clubId&&item('club','Club & team','club-view',clubId)}{t?.slug&&item('social','Social studio','club-social',t.slug!)}{item('studio','My Player Studio','club-player-studio')}<a href="#/" onClick={e=>{e.preventDefault();void signOutTo(go)}}>Sign out</a>
  {t&&<><span className="cap grp">{t.name}</span>{item('entries','Entries & UPI','club-inbox',t.id)}{item('draw','Pools & knockouts','club-tournament',t.id)}{item('desk','Desk','club-desk',t.id)}{item('referees','Referees & results','club-scorers',t.id)}{t.slug&&item('tv','TV board','club-tv',t.slug!)}</>}
  <Signoff text="Run on" onClick={()=>go('club')}/></aside>
  <main className="main" style={{display:'flex',flexDirection:'column',gap:22}}><OrgSlot.Provider value={slot}>{n.mode===0&&n.head===0&&<div className="row" style={{justifyContent:'flex-end'}}><ModeButton auto/></div>}{children}</OrgSlot.Provider></main></div></Frame>;
}
/** Page heading used on every v1.2 screen. */
export function PageHead({cap,title,sub,actions}:{cap?:ReactNode;title:ReactNode;sub?:ReactNode;actions?:ReactNode}){
 const slot=useContext(OrgSlot),reg=slot?.reg;useLayoutEffect(()=>reg?reg('head'):undefined,[reg]);const mode=!!slot&&!slot.hasMode;
 return <div className="between" style={{alignItems:'flex-end'}}><div className="pg-h">{cap&&<span className="cap">{cap}</span>}<h1 className="disp">{title}</h1>{sub&&<span className="mut">{sub}</span>}</div>{(actions||mode)&&<div className="row" style={{flexWrap:'wrap'}}>{mode&&<ModeButton auto/>}{actions}</div>}</div>;
}
