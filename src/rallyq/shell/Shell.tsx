import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useState,type ReactNode} from 'react';
import type {Go} from '../../navigation';
import {chooseTheme,currentTheme,subscribeTheme} from '../../theme';
import {eventsBackend} from '../../club/index';
import {scopedCSS} from '../PrototypeScreen';
import raw from './v12.css?raw';
import {Q_PATH,Watermark} from './Watermark';

/** RallyQ v1.2 shell: the final prototype's styles (docs/final-prototype/*.dc.html) around real screens.
 * Inside a shell, write markup with the prototype's classes: card, list, tbl, btn, st ok, tabs, fld, inp, opt, cglass… */
const CSS=scopedCSS(raw).replaceAll('%BASE%',import.meta.env.BASE_URL);
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
export const ALL_CLUBS:Host={marks:['R33','LP','TPC','EP'],cap:'Hosted by',name:'Hyderabad’s clubs'};
/** Short club name: "Rally33 at Crosscourts" → "Rally33". */
export function clubShort(name:string){return name.trim().split(/\s+(?:at|@)\s+/i)[0]||name.trim();}
/** Club tile letters: "Rally33 at Crosscourts" → "R33", "The Pickleball Company" → "TPC", "Loki" → "LOK". */
export function clubMark(name:string){const w=clubShort(name).split(/\s+/).filter(Boolean);if(w.length===1){const m=w[0].match(/^(\p{L})\p{L}*(\d+)$/u);return(m?m[1]+m[2]:w[0]).slice(0,3).toUpperCase();}return w.map(x=>x[0]).join('').slice(0,3).toUpperCase();}
export function HostBlock({host,onClick}:{host:Host;onClick?:()=>void}){
 const tiles=host.marks.map((m,i)=><span key={i} className="tile">{m}</span>);
 return <a className="host" href="#/" onClick={e=>{e.preventDefault();onClick?.()}}>{host.marks.length>1?<span className="tiles">{tiles}</span>:tiles}<span><span className="cap">{host.cap??'Hosted by'}</span><b>{host.name}</b></span></a>;
}
function Frame({children,watermark=true}:{children:ReactNode;watermark?:boolean}){
 const day=useDay();const style=useMemo(()=><style>{CSS}</style>,[]);
 return <div className="rallyq-prototype rq-v12">{style}<div className={day?'rq day':'rq'} style={{minHeight:'100vh'}}>{watermark&&<Watermark/>}{children}</div></div>;
}
export type PublicTab='live'|'events'|'studio'|'clubs'|null;
/** Public pages: club leads in the header, RallyQ signs off small and last. */
export function PublicShell({go,active=null,host=ALL_CLUBS,right,children,footNote}:{go:Go;active?:PublicTab;host?:Host;right?:ReactNode;children:ReactNode;footNote?:string}){
 const[signedIn,setSignedIn]=useState(false),[menu,setMenu]=useState(false);
 useEffect(()=>{let on=true;eventsBackend().currentUser().then(u=>{if(on)setSignedIn(!!u)},()=>undefined);return()=>{on=false}},[]);
 const links:[PublicTab,string,()=>void][]=[['live','Live scores',()=>go('live')],['events','Events',()=>go('events')],['studio','Player Studio',()=>go('club-player-studio')],['clubs','For clubs',()=>go(signedIn?'club':'club-signin')]];
 const nav=(cls:string)=>links.map(([k,label,f])=><a key={k} className={cls&&k===active?'on':undefined} href="#/" aria-current={k===active?'page':undefined} onClick={e=>{e.preventDefault();setMenu(false);f()}}>{label}</a>);
 return <Frame><header className="hdr"><div className="wrap"><HostBlock host={host} onClick={()=>go('events')}/><nav className="nav" aria-label="Main">{nav('x')}</nav>
  <div className="right">{right??<a className="tlink" href="#/" onClick={e=>{e.preventDefault();go(signedIn?'club':'club-signin')}}>{signedIn?'My club':'Club sign in'}</a>}<ModeButton/><button type="button" className="menu" aria-label="Menu" aria-expanded={menu} onClick={()=>setMenu(!menu)}><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><Signoff/></div></div></header>
  {menu&&<nav className="mpanel" aria-label="Menu">{nav('')}{!right&&<a href="#/" onClick={e=>{e.preventDefault();setMenu(false);go(signedIn?'club':'club-signin')}}>{signedIn?'My club':'Club sign in'}</a>}</nav>}
  <main className="wrap" style={{paddingBlock:'28px 40px',display:'flex',flexDirection:'column',gap:28}}>{children}</main>
  <div className="wrap pfoot"><span>{footNote??''}</span><Signoff/></div></Frame>;
}
export type OrgTab='home'|'tournaments'|'club'|'social'|'entries'|'draw'|'desk'|'referees'|'tv';
/** Organiser pages: host club on top of the side menu, event steps below, RallyQ sign-off last. */
export function OrgShell({go,active,clubName='Your club',clubId,tournament,children}:{go:Go;active:OrgTab;clubName?:string;clubId?:string;tournament?:{id:string;name:string;slug?:string|null};children:ReactNode}){
 const item=(k:OrgTab,label:string,f:()=>void)=><a key={k} className={k===active?'on':undefined} aria-current={k===active?'page':undefined} href="#/" onClick={e=>{e.preventDefault();f()}}>{label}</a>;
 const t=tournament;
 const[n,setN]=useState({mode:0,head:0});
 const reg=useCallback((k:'mode'|'head')=>{setN(c=>({...c,[k]:c[k]+1}));return()=>setN(c=>({...c,[k]:c[k]-1}));},[]);
 const slot=useMemo(()=>({reg,hasMode:n.mode>0}),[reg,n.mode]);
 return <Frame><div className="shell"><aside className="side" aria-label="Organiser menu"><HostBlock host={{marks:[clubMark(clubName)],name:clubName}} onClick={()=>go('club')}/>
  <span className="cap grp">{clubShort(clubName)}</span>{item('home','Home',()=>go('club'))}{item('tournaments','Tournaments',()=>go('club-tournaments'))}{clubId&&item('club','Club & team',()=>go('club-view',clubId))}{t?.slug&&item('social','Social studio',()=>go('club-social',t.slug!))}
  {t&&<><span className="cap grp">{t.name}</span>{item('entries','Entries & UPI',()=>go('club-inbox',t.id))}{item('draw','Pools & knockouts',()=>go('club-tournament',t.id))}{item('desk','Desk',()=>go('club-desk',t.id))}{item('referees','Referees & results',()=>go('club-scorers',t.id))}{t.slug&&item('tv','TV board',()=>go('club-tv',t.slug!))}</>}
  <Signoff text="Run on" onClick={()=>go('club')}/></aside>
  <main className="main" style={{display:'flex',flexDirection:'column',gap:22}}><OrgSlot.Provider value={slot}>{n.mode===0&&n.head===0&&<div className="row" style={{justifyContent:'flex-end'}}><ModeButton auto/></div>}{children}</OrgSlot.Provider></main></div></Frame>;
}
/** Page heading used on every v1.2 screen. */
export function PageHead({cap,title,sub,actions}:{cap?:ReactNode;title:ReactNode;sub?:ReactNode;actions?:ReactNode}){
 const slot=useContext(OrgSlot),reg=slot?.reg;useLayoutEffect(()=>reg?reg('head'):undefined,[reg]);const mode=!!slot&&!slot.hasMode;
 return <div className="between" style={{alignItems:'flex-end'}}><div className="pg-h">{cap&&<span className="cap">{cap}</span>}<h1 className="disp">{title}</h1>{sub&&<span className="mut">{sub}</span>}</div>{(actions||mode)&&<div className="row" style={{flexWrap:'wrap'}}>{mode&&<ModeButton auto/>}{actions}</div>}</div>;
}
