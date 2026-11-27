import {AthleteCover,PlayerRecord} from './AthleteCover';
import {useState} from 'react';
import type {Go} from '../../navigation';
import {useLoad} from '../../club/screens/common';
import type {OfficialMatch} from '../../club/playerStudio';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from '../prototypes/Studio.dc.html?raw';
import {holes} from '../holes';
import {loadPublicPlayer,samplePublicPlayer,type PublicRallyPlayer} from '../private/backend';
import {posterPng,sharePoster} from '../social/posterExport';
import {ShellState,shellSource} from '../ShellState';
const source=holes(raw,[
 ['<span class="chip">Signed in · Arjun</span>','<sc-if value="{{isSample}}" hint-placeholder-val="{{ false }}"><span class="chip">Demo profile</span><span class="mut" style="font-size:13px">Sample data for preview only.</span></sc-if>'],
 ['<span class="chip ball">Win</span>','<span class="{{lastChip}}">{{lastResult}}</span>'],
 ['<div class="cap" style="color:#DDE7DC">Banyan DUPR Night</div><div class="disp" style="font-size:34px;margin-top:4px">Arjun Rao</div><div class="n acc" style="font-size:40px;margin-top:6px">11–8 · 11–7</div>','<div class="cap" style="color:#DDE7DC">{{lastEvent}}</div><div class="disp" style="font-size:34px;margin-top:4px">{{name}}</div><div class="n acc" style="font-size:40px;margin-top:6px">{{lastScore}}</div>'],
 ['Hosted by Banyan Pickleball Club · RallyQ','Hosted by {{lastClub}} · RallyQ']])
 .replace(/<div class="photo ph-competitor"[\s\S]*?(?=<div style="flex:999)/, '{{athleteCover}}')
 .replace(/<div class="between"><span class="row" style="gap:8px"><span class="chip ball">Public profile<\/span>[\s\S]*?<\/div>/, '')
 .replace(/<div class="grid g4">[\s\S]*?(?=<div class="card" style="padding:20px;flex:1")/, '{{recordCard}}<a class="tlink athlete-studio-link" href="MyStudio.dc.html">Open My Player Studio →</a>');
// Built from the filled-in source, so the not-found page never shows the prototype's sample "Signed in" chip.
const SHELL=shellSource(source);
const mine=(o:OfficialMatch,g:{a:number;b:number})=>o.mySide==='A'?[g.a,g.b]:[g.b,g.a];
const won=(o:OfficialMatch)=>o.winner===o.mySide;
const first=(ps:{id:string;name:string}[],go?:Go)=>!ps.length?'':go?<span>{ps.map((p,i)=><span key={p.id}>{i?' / ':''}<a href={'#/public-player/'+encodeURIComponent(p.id)} aria-label={p.name} onClick={e=>{e.preventDefault();go('public-player',p.id)}}>{p.name.split(' ').slice(-1)[0]}</a></span>)}</span>:ps.map(p=>p.name.split(' ').slice(-1)[0]).join(' / ');
export function profileValues(p:PublicRallyPlayer,tab:string,setTab:(t:string)=>void,shareLabel:string,onShare:()=>void,go?:Go){
 const RANK:Record<string,number>={final:5,sf:4,qf:3,r16:2,r32:1,pool:0};
 const off=[...p.official].sort((a,b)=>b.playedOn.localeCompare(a.playedOn)||(RANK[b.stage]??0)-(RANK[a.stage]??0));
 const byClub=new Map<string,{w:number;n:number}>();for(const o of off){const v=byClub.get(o.club)??{w:0,n:0};v.n++;if(won(o))v.w++;byClub.set(o.club,v);}
 const last=off[0];
 const score=(o:OfficialMatch)=>o.games.map(g=>mine(o,g).join('–')).join(' · ');
 return {
  name:p.name,
  tabs:['Matches','Venues','Share card'].map(n=>({name:n,cls:n===tab?'tab on':'tab',pick:()=>setTab(n)})),
  isMatches:tab==='Matches',isVenues:tab==='Venues',isShare:tab==='Share card',
  matches:off.slice(0,12).map(o=>{const side=o.mySide==='A'?o.sideA:o.sideB,them=o.mySide==='A'?o.sideB:o.sideA;return{d:new Date(o.playedOn+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'}),e:o.tournament,w:first(side.filter(x=>x.id!==o.me),go)||'—',v:first(them,go),s:score(o),r:won(o)?'W':'L',cls:won(o)?'chip ball':'chip'};}),
  venues:[...byClub.entries()].map(([n,v])=>({n,w:v.w,p:Math.round(v.w/v.n*100)+'%'})),
  lastEvent:last?.tournament??'No tournament results yet',lastScore:last?score(last):'',lastClub:last?.club??p.club,lastResult:last?(won(last)?'Win':'Result'):'',lastChip:last&&won(last)?'chip ball':'chip',
  share:onShare,shareLabel
 };
}
/** The share card as a 4:5 PNG: shared where the phone can, otherwise saved. Returns the button label. */
export async function exportShareCard(p:PublicRallyPlayer){
 const v=profileValues(p,'Share card',()=>{},'',()=>{});
 const blob=await posterPng({club:v.lastClub,mark:v.lastClub.split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join('').toUpperCase(),kicker:v.lastEvent,head:p.name,big:v.lastScore,foot:'Hosted by '+v.lastClub+' · RallyQ',chip:v.lastResult,bg:'#0B2418',ink:'#F1F4EA',accent:'#D9F24A',photo:'photos/desktop/club-night.jpg',size:'Post 4:5'});
 return await sharePoster(blob,'rallyq-'+p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.png',p.name+' · '+v.lastEvent)==='Shared'?'Shared ✓':'Image saved ✓';
}
/** Public player profile (#/public-player/<id>): tournament matches only, scored by referees. */
export function PublicProfile({playerId,go}:{playerId?:string;go:Go}){
 const[tab,setTab]=useState('Matches'),[shareLabel,setShareLabel]=useState('Save for Instagram');
 const state=useLoad(async()=>playerId?loadPublicPlayer(playerId):samplePublicPlayer(),[playerId]);
 if(!state.data)return <ShellState name="Studio" source={SHELL} go={go} loading={state.loading} title="Player not found" message="This profile isn't available." linkLabel="Find players"/>;
 const p=state.data;
 const share=async()=>{if(shareLabel==='Making image…')return;setShareLabel('Making image…');
  try{setShareLabel(await exportShareCard(p));}catch(e){setShareLabel(e instanceof Error&&e.name==='AbortError'?'Save for Instagram':'Couldn’t save · try again');}};
 return <PrototypeScreen name="Studio" go={go} source={source} values={{...profileValues(p,tab,setTab,shareLabel,()=>{void share();},go),isSample:!playerId,athleteCover:<div className="athlete-wrap" style={{flex:'0 0 100%',minWidth:0}}><AthleteCover player={p}/></div>,recordCard:<PlayerRecord key={p.playerId} player={p}/>}}>
  {!p.official.length&&<section className="card" aria-label="Tournament results" style={{margin:'0 max(16px,2.4vw) 32px',padding:22}}><h2 style={{margin:0}}>No tournament results yet</h2><p className="mut" style={{margin:'6px 0 0'}}>Referee-scored tournament matches will appear here when results are saved.</p></section>}
 </PrototypeScreen>;
}
