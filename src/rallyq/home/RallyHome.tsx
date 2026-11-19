import {useEffect,useState} from 'react';
import type {Go} from '../../navigation';
import {serverBackend} from '../../club';
import {inLaunchCity} from '../../club/config';
import {useLoad} from '../../club/screens/common';
import {PrototypeScreen} from '../PrototypeScreen';
import {INITIAL_MAIN,SECTIONS,activeSection,mainValues,nextEventLine,type MainState,type SectionId} from './values';
import source from './Main.html?raw';
/** Home: one-screen hero with one button, then four sections the top menu scrolls to. No made-up numbers: totals come from the real pilot. */
export function RallyHome({go}:{go:Go}){
 const[state,set]=useState<MainState>(INITIAL_MAIN);
 const directory=useLoad(async()=>{const server=serverBackend();return server?(await server.publicEvents().catch(()=>[])).filter(e=>inLaunchCity(e.city)):[]},[]);
 const events=directory.data??[],live=events.some(e=>e.status==='live'&&e.results);
 useEffect(()=>{
  const f=()=>{const tops:Partial<Record<SectionId,number>>={};for(const id of SECTIONS){const el=document.getElementById(id);if(el)tops[id]=el.getBoundingClientRect().top;}
   const end=innerHeight+scrollY>=document.documentElement.scrollHeight-4;const a=end?SECTIONS[SECTIONS.length-1]:activeSection(tops);
   set(s=>s.active===a?s:{...s,active:a});};
  f();addEventListener('scroll',f,{passive:true});addEventListener('resize',f);
  return()=>{removeEventListener('scroll',f);removeEventListener('resize',f)};
 },[]);
 const values=mainValues(state,patch=>set(s=>({...s,...patch})),{events});
 return <PrototypeScreen name="Main" go={go} source={source} hrefs={{HeroCta:live?'#/live':'#/events'}} values={{...values,heroCta:live?'Live now · See live scores':nextEventLine(events)}}/>;
}
