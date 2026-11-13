import {useEffect} from 'react';
import type {Go} from '../../navigation';
import {serverBackend} from '../../club';
import {inLaunchCity} from '../../club/config';
import {useLoad} from '../../club/screens/common';

/**
 * Venue TV with no event in the link (#/club-tv): open the only live event straight away, otherwise let the venue pick.
 * Before this, a TV link without an event showed an empty page.
 */
export function TvPicker({go}:{go:Go}){
 const list=useLoad(async()=>{const server=serverBackend();return server?(await server.publicEvents()).filter(e=>inLaunchCity(e.city)&&e.status!=='done'):[]},[]);
 const events=list.data??[];const live=events.filter(e=>e.status==='live');
 useEffect(()=>{if(live.length===1)go('club-tv',live[0].slug,{replace:true});},[live.length===1?live[0].slug:'',go]); // eslint-disable-line react-hooks/exhaustive-deps
 return <main className="wrap" style={{minHeight:'100vh',background:'#06140D',color:'#F1F4EA',padding:'48px max(16px,env(safe-area-inset-left,0px))',display:'grid',alignContent:'start',gap:18}}>
  <h1 className="disp" style={{fontSize:'clamp(32px,5vw,56px)',margin:0}}>Venue TV board</h1>
  <p style={{margin:0,color:'#BFD0C4'}}>Pick the event for this screen. The board then updates on its own.</p>
  {list.loading&&<p role="status">Loading events…</p>}
  {list.error&&<p role="alert">Can’t reach the events right now. Check the connection and reload.</p>}
  {!list.loading&&!list.error&&!events.length&&<p role="status">No events are live or coming up yet.</p>}
  <div style={{display:'grid',gap:10,maxWidth:560}}>
   {events.map(e=><button key={e.slug} type="button" className="btn" style={{justifyContent:'space-between',minHeight:56}} onClick={()=>go('club-tv',e.slug)} aria-label={'Open the TV board for '+e.name}>
    <span>{e.name}</span><span style={{opacity:.8}}>{e.status==='live'?'Live now':'Starts '+e.startDate}</span></button>)}
  </div>
 </main>;
}
