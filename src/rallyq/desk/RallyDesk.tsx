import {useMemo,useState} from 'react';
import type {Go} from '../../navigation';
import {Desk,useTournament} from '../../club/screens/Organiser';
import {names,errorText} from '../../club/screens/common';
import {courtBoard,upNext} from '../../club/plan';
import type {ClubMatch} from '../../club/types';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from '../prototypes/Desk.dc.html?raw';
import {holes} from '../holes';
const source=holes(raw.replace(/<aside[\s\S]*?<\/aside>/,'').replace('</main>','<sc-if value="{{msg}}"><p role="status" style="padding:12px 16px">{{msg}}</p></sc-if></main>'),[
 ['Rally33 Open · Desk','{{title}}'],['Sun 15 Nov · 6:42 pm','{{when}}'],['+6 min','{{running}}'],['Running</div>','Done</div>'],['behind plan','of all matches'],['of 46 matches','of {{total}} matches'],
 ['Finish a match (demo)','Results, walkovers and court changes →'],
 ['class="tlink mut" href="TV.dc.html">TV board ↗</a><a class="tlink mut" href="Live.dc.html">Public live scores ↗</a>','class="tlink mut" href="{{tvHref}}">TV board ↗</a><a class="tlink mut" href="{{socialHref}}">Social studio ↗</a><a class="tlink mut" href="{{liveHref}}">Public live scores ↗</a>'],
 ['<div class="card mini" style="padding:18px;','<div class="card mini" role="group" aria-label="{{c.name}}" style="padding:18px;'],
 ['<div class="cap" style="position:relative">Courts · drawn as courts</div>','<div class="cap" style="position:relative">Courts</div><sc-if value="{{hasReal}}"><progress aria-label="Matches completed" max="{{realCount}}" value="{{played}}" style="position:relative;width:100%;height:6px;accent-color:#D9F24A"></progress></sc-if>'],
 ['<sc-if value="{{msg}}"','<sc-if value="{{msg}}"']]);
const STAGE:Record<string,string>={pool:'Pool',r32:'R32',r16:'R16',qf:'QF',sf:'SF',final:'Final',friendly:'Friendly'};
/** Match-day desk in the prototype look: courts drawn as courts, call the next match, the queue. The classic desk keeps results, walkovers and moves. */
export function RallyDesk({id,go,onBack}:{id:string;go:Go;onBack:()=>void}){
 const{b,state}=useTournament(id,8000);const[classic,setClassic]=useState(false);const[msg,setMsg]=useState('');
 const d=state.data;const pmap=useMemo(()=>new Map((d?.players??[]).map(p=>[p.id,p])),[d]);
 if(classic)return <><div style={{padding:'12px 16px'}}><button type="button" className="btn btn-outline" onClick={()=>setClassic(false)}>← Back to courts</button></div><Desk id={id} go={go} onBack={onBack}/></>;
 if(!d||!b)return <div className="rq" style={{minHeight:'50vh',display:'grid',placeItems:'center',color:'#9FB4A6'}}>{state.error??'Loading the desk…'}</div>;
 const t=d.tournament;const active=d.matches.filter(m=>m.status!=='void');
 const board=courtBoard(active,t.courts);const queue=upNext(active,8).filter(m=>!m.court||m.status==='scheduled');
 const real=active.filter(m=>m.entryB||m.sideB.length||m.stage==='pool'||m.stage==='friendly');const played=real.filter(m=>m.status==='done').length;
 const div=(m:ClubMatch)=>d.divisions.find(x=>x.id===m.divisionId)?.name??'';
 const last=(m:ClubMatch)=>m.games.at(-1)??{a:0,b:0};
 const head=queue.find(m=>m.status==='scheduled');
 const call=async(court:number)=>{if(!head)return;try{await b.patchMatches([{id:head.id,patch:{court}}]);setMsg('Sent to court '+court);state.reload();}catch(e){setMsg(errorText(e));}};
 const slug=t.publicSlug||id;
 const courts=board.map(s=>s.now?{name:'Court '+s.court,busy:true,free:false,status:'Live',chip:'chip live',stage:[div(s.now),STAGE[s.now.stage]].filter(Boolean).join(' · '),ref:'court link',a:names(s.now.sideA,pmap),b:names(s.now.sideB,pmap),sa:last(s.now).a,sb:last(s.now).b}
  :{name:'Court '+s.court,busy:false,free:true,status:'Free',chip:'chip ball',blocked:!head,callLabel:head?'Call to Court '+s.court:'Queue empty',call:()=>{void call(s.court);}});
 const values={title:t.name+' · Desk',when:new Date().toLocaleString('en-IN',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}),running:real.length?Math.round(played/real.length*100)+'%':'0%',
  played,realCount:Math.max(1,real.length),hasReal:real.length>0,total:real.length,onCourt:board.filter(s=>s.now).length,waiting:queue.length,nextUp:head?names(head.sideA,pmap)+' vs '+names(head.sideB,pmap):'Queue empty',courts,
  queue:queue.map((m,i)=>({no:i+1,m:names(m.sideA,pmap)+' vs '+names(m.sideB,pmap),s:[div(m),STAGE[m.stage]].filter(Boolean).join(' · '),ci:m.court?'On court '+m.court:'Waiting',cls:m.court?'chip ball':'chip gold',t:m.slot!=null?'#'+(m.slot+1):'—',checkin:()=>undefined})),
  finish:()=>setClassic(true),msg,tvHref:'#/club-tv/'+encodeURIComponent(slug),socialHref:'#/club-social/'+encodeURIComponent(slug),liveHref:'#/event/'+encodeURIComponent(slug)};
 return <PrototypeScreen name="Desk" go={go} source={source} values={values}/>;
}
