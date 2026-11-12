import {useEffect,useState} from 'react';
import type {Go} from '../../navigation';
import {serverBackend} from '../../club';
import {inLaunchCity} from '../../club/config';
import {useLoad} from '../../club/screens/common';
import {usePublicScores} from '../../club/screens/usePublicScores';
import {courtMatches,matchView} from '../../club/liveView';
import {PrototypeScreen} from '../PrototypeScreen';
import {useReducedMotion} from '../useReducedMotion';
import {INITIAL_MAIN,mainValues,type MainState} from './values';
import mainRaw from './Main.html?raw';
import {liveWinBar,winBarFrom,winBarHtml} from '../../club/winBar';
import {winEstimate} from '../../club/winPredictor';
/** Home hero: the win chance sits under the two score rows. */
const source=mainRaw.replace('{{sb}}</span></div>','{{sb}}</span></div>'+winBarHtml('heroWin'));
export function demoRally(state:MainState,random:()=>number=Math.random):Partial<MainState>{const w=state.w+Math.round(random()*9);if((state.sa>=11||state.sb>=11)&&Math.abs(state.sa-state.sb)>=2)return{sa:0,sb:0,srvA:!state.srvA,srvNo:2,game:state.game===3?1:state.game+1,w};if(random()<.58)return state.srvA?{sa:state.sa+1,ba:state.ba+1,w}:{sb:state.sb+1,bb:state.bb+1,w};if(state.srvNo===1)return{srvNo:2,w};return{srvA:!state.srvA,srvNo:1,w};}
/** Exact Main prototype. Public live data replaces its clearly labelled demo loop when available. */
export function RallyHome({go}:{go:Go}){
 const[state,set]=useState(INITIAL_MAIN),reduced=useReducedMotion();
 const directory=useLoad(async()=>{const server=serverBackend();return server?(await server.publicEvents().catch(()=>[])).filter(e=>inLaunchCity(e.city)):[]},[]);
 const event=directory.data?.find(e=>e.status==='live'&&e.results),scores=usePublicScores(event?.slug??'');
 const live=scores.data?courtMatches(scores.data).filter(c=>c.match.status==='live'):[],first=live[0],v=first&&scores.data?matchView(scores.data,first.match):null;
 const sample=!v;
 useEffect(()=>{if(reduced)return;const timer=setInterval(()=>set(s=>({...s,slide:(s.slide+1)%3})),6500);return()=>clearInterval(timer)},[reduced]);
 useEffect(()=>{if(reduced||!sample)return;const timer=setInterval(()=>{if(!document.hidden)set(s=>({...s,...demoRally(s)}))},2600);return()=>clearInterval(timer)},[reduced,sample]);
 const values=mainValues(state,patch=>set(s=>({...s,...patch})));
 const actual=live.map(({court,match})=>{const view=matchView(scores.data!,match);return{court:'Court '+court,club:scores.data!.club,mark:scores.data!.club.split(/\s+/).slice(0,3).map(w=>w[0]).join(''),a:view.a,b:view.b,sa:view.pointsA,sb:view.pointsB,stage:view.division?.name??scores.data!.name,game:view.game}});
 return <PrototypeScreen name="Main" go={go} source={source} values={{...values,heroCourt:first?'Court '+first.court:'Court 2',heroStage:v?v.division?.name??scores.data?.name:'Men’s QF',heroWin:v&&first&&scores.data?liveWinBar(scores.data,first.match):winBarFrom(winEstimate({ratingsA:[4.3,4.22],ratingsB:[4.1,4.0],ralliesA:state.sa,ralliesB:state.sb,gamesA:0,gamesB:0,pointsA:state.sa,pointsB:state.sb,pointsTo:11,bestOf:3}),'Rao / Iyer','Khan / Patel'),heroA:v?.a??'Rao / Iyer',heroB:v?.b??'Khan / Patel',heroClub:scores.data?.club??'Banyan Courts (sample)',heroMark:scores.data?.club.split(/\s+/).slice(0,3).map(w=>w[0]).join('')??'BC',liveChip:actual.length?'Live':'Sample',liveChipCls:actual.length?'chip live':'chip',sa:v?.pointsA??state.sa,sb:v?.pointsB??state.sb,game:v?.game??state.game,pointsTo:v?.format.pointsTo??11,call:v?v.pointsA+' · '+v.pointsB:values.call,callLabel:sample?'Call':'In play',srvA:sample?values.srvA:'sv off',srvB:sample?values.srvB:'sv off',showFollowers:sample,demoLabel:sample?'Demo court · illustrative scores':'Live from the referee',liveCount:actual.length||3,live:actual.length?actual:values.live,tick:actual.length?[...actual,...actual].map(c=>({a:c.a,b:c.b,s:c.sa+'–'+c.sb,club:c.club})):values.tick,events:directory.data?.length?directory.data.slice(0,6).map(e=>({date:new Date(e.startDate+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'}),tag:e.status==='live'?'Live':'Tournament',name:e.name,club:e.club,area:e.city??'Hyderabad',mark:e.club.split(/\s+/).slice(0,3).map(w=>w[0]).join(''),chipCls:e.status==='live'?'chip live':'chip',href:'#/event/'+encodeURIComponent(e.slug)})):(values.events as Array<Record<string,unknown>>).map(e=>({...e,href:'#/events'}))}}/>;
}
