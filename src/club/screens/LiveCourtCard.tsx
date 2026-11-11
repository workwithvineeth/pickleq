import type {CSSProperties} from 'react';
 export interface LiveCourtCardData {court:number;teamA:string;teamB:string;pointsA:number;pointsB:number;category:string;status:'live'|'scheduled'|'done';chance:number|null;matchPoint?:boolean;watching?:number}
 const photos=['court-night.jpg','court-day.jpg','under-lights.jpg','arena-night.jpg','ball-court.jpg'];
 /** Shared by public Live scores and Home; presentation only, no private player data. */
 export function LiveCourtCard({data,onWatch,photo}:{data:LiveCourtCardData;onWatch:()=>void;photo?:string}){return <article className="photo court pq-live-court" aria-label={'Court '+data.court}>
  <img className="ph" src={import.meta.env.BASE_URL+'prototype6/'+(photo??photos[(data.court-1)%photos.length])} alt="" loading="lazy" />
  <div className="pq-live-card-top"><span className="chip pq-live-court-chip">{data.status==='live'&&<i className="pq-live-dot" aria-hidden="true"/>}Court {data.court}</span>{data.watching!==undefined&&<span className="chip pq-watchers">{data.watching.toLocaleString('en-IN')} watching</span>}</div>
  <div className="lgd pq-live-card-score"><div className="cap">{data.category}</div><div className="tmr"><b>{data.teamA}</b><span className="n">{data.pointsA}</span></div><div className="tmr"><span>{data.teamB}</span><span className="n pq-opponent-score">{data.pointsB}</span></div>
   {data.chance!==null&&<><div className="pq-win-bar" role="img" aria-label={'Win chance estimate '+data.chance+' percent'}><i style={{'--chance':data.chance+'%'} as CSSProperties}/></div><span className="pq-chance-label">Win chance (est.) {data.chance}%</span></>}
   <div className="pq-live-card-foot"><span>{data.matchPoint?<span className="pq-match-point">Match point</span>:data.status==='scheduled'?'Next up':data.status==='done'?'Finished':''}</span><button type="button" className="pq-court-watch" aria-label={'Watch Court '+data.court} onClick={onWatch}>Scores →</button></div>
  </div></article>}
 