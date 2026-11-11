import {useRef,useState} from 'react';
 import type {PublicTournament} from '../backend';
 import {courtMatches,headToHead,isMatchPoint,matchView,pointHistory,videoState,type CourtVideo} from '../liveView';
 import {STAGE_LABEL} from '../types';
 import {LiveCourtCard} from './LiveCourtCard';
 export interface ServeCall {side:'A'|'B';server?:1|2}
 export function CourtStage({d,court,match,video,serve}:{d:PublicTournament;court:number;match:PublicTournament['matches'][number];video?:CourtVideo;serve?:ServeCall}){
  const [failed,setFailed]=useState<string>();const state=failed===video?.videoId&&video?'Video unavailable':videoState(video),valid=!!video&&/^[A-Za-z0-9_-]{11}$/.test(video.videoId),show=valid&&state!=='Video unavailable'&&state!=='Stream ended';const v=matchView(d,match);
  return <section className={'photo stage pq-watch-stage'+(show?' has-video':'')} aria-label={'Watch Court '+court}>
   <div className="ph pq-watch-picture" style={{backgroundImage:'url('+import.meta.env.BASE_URL+'prototype6/court-night.jpg)'}}/>
   {show&&<iframe className="pq-watch-video" title={d.club+' · Court '+court+' video'} src={'https://www.youtube-nocookie.com/embed/'+video.videoId+'?playsinline=1&origin='+encodeURIComponent(window.location.origin)} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>}
   <div className="pq-watch-top"><span className="chip pq-live-badge">{match.status==='live'&&<i className="pq-live-dot" aria-hidden="true"/>}{match.status==='live'?'LIVE':match.status==='done'?'Finished':'Next up'}</span><span className="chip">Court {court}</span><span className="chip">Game {v.game}</span>{video&&<span className="pq-video-state">{state}</span>}</div>
   <div className="sbug lgd pq-broadcast" aria-label="Match score"><div className="tag pq-broadcast-tag">{d.name}</div><div className="pq-broadcast-body">
    {(['A','B'] as const).map(side=><div className="r pq-broadcast-team" key={side}><b>{match.status==='live'&&serve?.side===side&&<i className="pq-live-dot" aria-label="Serving"/>}{side==='A'?v.a:v.b}</b><span className="n pq-games" aria-label="Games won">{side==='A'?v.gamesA:v.gamesB}</span><strong className="n p pq-flash-score" key={match.id+':'+v.game+':'+(side==='A'?v.pointsA:v.pointsB)}>{side==='A'?v.pointsA:v.pointsB}</strong></div>)}
    <div className="spons pq-broadcast-call"><span>{match.status==='live'?serve?'CALL':'IN PLAY':match.status==='done'?'FINAL':'UP NEXT'} <b className="n">{serve?.side==='B'?v.pointsB+' · '+v.pointsA:v.pointsA+' · '+v.pointsB}{serve?.server&&match.status==='live'?' · '+serve.server:''}</b></span><span>Game {v.game} to {v.format.pointsTo}</span></div>
   </div></div>
   <div className="pq-watch-note">{!show&&<span>{video?'Scores continue':'Court photo · illustrative'}</span>}{video&&valid&&<a href={'https://www.youtube.com/watch?v='+video.videoId} target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a>}{show&&<button type="button" onClick={()=>setFailed(video.videoId)}>Video not playing?</button>}</div>
  </section>;
 }
 export function LiveCourts({d,videos={},serves={},initialCourt}:{d:PublicTournament;videos?:Record<number,CourtVideo>;serves?:Record<number,ServeCall>;initialCourt?:number}){
  const courts=courtMatches(d),[court,setCourt]=useState(initialCourt),[mode,setMode]=useState<'watch'|'courts'>('watch'),heading=useRef<HTMLHeadingElement>(null);
  const selected=courts.find(c=>c.court===court)??courts.find(c=>c.match.status==='live')??courts[0];
  if(!selected)return <section className="lg card"><h2>Live scores</h2><p>Courts appear when matches are assigned.</p></section>;
  const score=matchView(d,selected.match),points=pointHistory(score.current?.points??'',score.pointsA,score.pointsB),h2h=headToHead(d,selected.match),maxLead=Math.max(2,...points.map(p=>Math.abs(p.a-p.b)));
  const path=[{a:0,b:0},...points].map((p,i)=>(i?'L':'M')+(20+i/Math.max(1,points.length)*360)+','+(90-(p.a-p.b)/maxLead*65)).join(' ');
  const watch=(c:number)=>{setCourt(c);setMode('watch');heading.current?.focus();heading.current?.scrollIntoView?.({behavior:'instant',block:'start'});};
  return <section className="pq-live-view pq-proto" aria-label="Live courts"><header className="ptl pq-live-title"><div><p className="cap">{d.name} · {d.club}</p><h1 ref={heading} tabIndex={-1}>{mode==='watch'?'Court view':'Live scores'}</h1></div><div className="pq-live-tabs" role="group" aria-label="Spectator view"><button type="button" aria-pressed={mode==='watch'} onClick={()=>setMode('watch')}>Court view</button><button type="button" aria-pressed={mode==='courts'} onClick={()=>setMode('courts')}>Live scores</button></div></header>
   <div hidden={mode!=='watch'} className="pq-watch-view"><p className="loc pq-watch-location">{d.club} · Court {selected.court}</p><CourtStage d={d} court={selected.court} match={selected.match} video={videos[selected.court]} serve={serves[selected.court]}/>
    {(points.length>0||h2h.total>0)&&<div className="pq-live-insights">{points.length>0&&<section className="lg card pq-live-panel" aria-label="Momentum"><div className="ch"><h2>Momentum</h2><span className="chip">Game {score.game}</span></div><svg viewBox="0 0 400 180" role="img" aria-label={'Score lead in game '+score.game+'; '+score.a+' above the line'}><path d="M20 90H380" stroke="currentColor" opacity=".2" strokeDasharray="4 5"/><path d={path} fill="none" stroke="var(--pq-maroon-text)" strokeWidth="3"/></svg><p className="small muted">{score.a} above the line</p></section>}
     {h2h.total>0&&<section className="lg card pq-live-panel" aria-label="Head to head"><div className="ch"><h2>Head to head</h2><span className="chip">This tournament</span></div><table><thead><tr><th>Previous wins</th><th>{score.a}</th><th>{score.b}</th></tr></thead><tbody><tr><td>{h2h.total} meetings</td><td className="n">{h2h.a}</td><td className="n">{h2h.b}</td></tr></tbody></table></section>}
     {points.length>0&&<section className="lg card pq-live-panel" aria-label="Point by point"><div className="ch"><h2>Point by point</h2><span className="cap">Latest first</span></div><ol className="feed pq-point-feed">{points.slice(-12).reverse().map(p=><li key={p.index}><b className="n">{p.a} – {p.b}</b><span>{p.side==='A'?score.a:score.b}</span><small>Point {p.index}</small></li>)}</ol></section>}</div>}
    <button className="btn btn-outline pq-all-courts" type="button" onClick={()=>setMode('courts')}>All courts →</button>
   </div>
   <section hidden={mode!=='courts'} aria-label="On court now" className="pq-live-courts-view"><div className="pq-live-court-grid">{courts.map(({court:c,match:m})=>{const v=matchView(d,m);return <LiveCourtCard key={c} data={{court:c,teamA:v.a,teamB:v.b,pointsA:v.pointsA,pointsB:v.pointsB,category:(v.division?.name??d.name)+' · '+STAGE_LABEL[m.stage],status:m.status==='done'?'done':m.status==='live'?'live':'scheduled',chance:null,matchPoint:isMatchPoint(d,m)}} onWatch={()=>watch(c)}/>;})}</div><p className="small muted">Scores refresh every 20 seconds.</p></section>
  </section>;
 }
 