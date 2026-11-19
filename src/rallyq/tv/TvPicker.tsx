import {useEffect} from 'react';
import type {Go} from '../../navigation';
import {serverBackend} from '../../club';
import {inLaunchCity} from '../../club/config';
import {useLoad} from '../../club/screens/common';

/**
 * Venue TV with no event in the link (#/club-tv): open the only live event straight away, otherwise let the venue pick.
 * Before this, a TV link without an event showed an empty page.
 */
/** Social Studio with no event in the link (#/club-social): same picker, opening the Social Studio (UX-07). */
export function SocialPicker({go}:{go:Go}){return <TvPicker go={go} target="club-social"/>;}

export function TvPicker({go,target='club-tv'}:{go:Go;target?:'club-tv'|'club-social'}){
 const tv=target==='club-tv';
 const list=useLoad(async()=>{const server=serverBackend();return server?(await server.publicEvents()).filter(e=>inLaunchCity(e.city)&&e.status!=='done'):[]},[]);
 const events=list.data??[];const live=events.filter(e=>e.status==='live');
 useEffect(()=>{if(live.length===1)go(target,live[0].slug,{replace:true});},[live.length===1?live[0].slug:'',go,target]); // eslint-disable-line react-hooks/exhaustive-deps
 return <main className="wrap" style={{minHeight:'100vh',background:'#06140D',color:'#F1F4EA',padding:'48px max(16px,env(safe-area-inset-left,0px))',display:'grid',alignContent:'start',gap:18}}>
  <h1 className="disp" style={{fontSize:'clamp(32px,5vw,56px)',margin:0}}>{tv?'Venue TV board':'Social Studio'}</h1>
  <p style={{margin:0,color:'#BFD0C4'}}>{tv?'Pick the event for this screen. The board then updates on its own.':'Pick the event to make posts for: results, champions and match-day stories.'}</p>
  {list.loading&&<p role="status">Loading events…</p>}
  {list.error&&<p role="alert">Can’t reach the events right now. Check the connection and reload.</p>}
  {!list.loading&&!list.error&&!events.length&&<p role="status">No events are live or coming up yet.</p>}
  <div style={{display:'grid',gap:10,maxWidth:560}}>
   {events.map(e=><button key={e.slug} type="button" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,minHeight:64,padding:'12px 18px',borderRadius:18,border:0,background:'#0D2218',color:'#F1F4EA',boxShadow:'inset 0 0 0 1px rgba(241,244,234,.12)',font:'inherit',fontWeight:700,fontSize:16,cursor:'pointer',textAlign:'left'}} onClick={()=>go(target,e.slug)} aria-label={(tv?'Open the TV board for ':'Open Social Studio for ')+e.name}>
    <span>{e.name}</span><span style={e.status==='live'?{background:'#FF655C',color:'#1A0603',borderRadius:999,padding:'4px 10px',fontSize:12,fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase'}:{color:'#9FB4A6',fontWeight:500,fontSize:14}}>{e.status==='live'?'Live now':'Starts '+e.startDate}</span></button>)}
  </div>
 </main>;
}
