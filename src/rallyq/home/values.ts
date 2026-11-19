import type {PrototypeValues} from '../PrototypeScreen';
import type {PublicEvent} from '../../club/backend';
import {entryFeeLine} from '../event/fee';
/** The four sections the top menu scrolls to, in page order. */
export const SECTIONS=['what','coming','first','clubs'] as const;
export type SectionId=typeof SECTIONS[number];
export interface MainState{menu:boolean;slide:number;active:SectionId|null}
export const INITIAL_MAIN:MainState={menu:false,slide:0,active:null};
/** The one real tournament so far: totals only, never player names. */
export const PILOT={name:'TPC Diwali Dhamaka',players:37,matches:60,points:1003,courts:3};
/** The announced calendar (13 Nov evening, from the clubs' posters, minus one club that stepped back on 14 Nov); shown until the clubs publish their events on RallyQ. Logos live in public/rallyq/clubs/. */
export const UPCOMING_EVENTS = [
    {date:'15 Nov',tag:'League',name:'Friendly Pickleball League · Season 2',club:'Elite Picklers',area:'Bowenpally',mark:'EP',logo:'elite-picklers.jpg',detail:'4:00 pm · Men’s and mixed doubles · ₹2,000 per team'},
    {date:'21 Nov',tag:'Tournament',name:'Pickleball Amateur Tournament',club:'The Pickle Yard',area:'Malkajgiri',mark:'PY',logo:'pickle-yard.jpg',detail:'3:00 pm · DUPR 3.5 and under · Singles ₹699 · Doubles ₹1,199'},
    {date:'28 Nov',tag:'Tournament',name:'Pickleball Central',club:'Pickleball Central',area:'Hyderabad',mark:'PC',logo:'',detail:'Details soon'}
  ];
/** Full URL for a club logo file, or '' (the card shows the club's initials). */
export const clubLogoUrl=(file:string)=>file?import.meta.env.BASE_URL+'rallyq/clubs/'+file:'';
type HomeEvent=Pick<PublicEvent,'slug'|'name'|'club'|'startDate'|'startTime'|'status'|'divisions'>&{city?:string};
const mark=(club:string)=>club.split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join('').toUpperCase();
const shortDate=(d:string)=>new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'});
/** Event cards for "Coming up": the clubs' published events that are not finished, else the announced calendar. */
export function comingUp(events:HomeEvent[]){
 const real=events.filter(e=>e.status!=='done').sort((a,b)=>(a.startDate+(a.startTime||'')).localeCompare(b.startDate+(b.startTime||''))).slice(0,6);
 if(!real.length)return UPCOMING_EVENTS.map(e=>({...e,href:'#/events',chipCls:'chip',logoUrl:clubLogoUrl(e.logo),noLogo:!e.logo}));
 return real.map(e=>{const fee=entryFeeLine(e.divisions);return{date:shortDate(e.startDate),tag:e.status==='live'?'Live':'Tournament',name:e.name,club:e.club,area:e.city??'Hyderabad',mark:mark(e.club),logoUrl:'',noLogo:true,chipCls:e.status==='live'?'chip live':'chip',detail:[e.startTime,fee&&'Entry '+fee].filter(Boolean).join(' · ')||'Details on the event page',href:'#/event/'+encodeURIComponent(e.slug)};});
}
/** Slug of the pilot's results page when it is published on RallyQ. */
export const pilotSlug=(events:Pick<HomeEvent,'slug'|'name'>[])=>events.find(e=>/diwali dhamaka/i.test(e.name))?.slug;

export function mainValues(state:MainState,setState:(patch:Partial<MainState>)=>void,data:{events:HomeEvent[]}={events:[]}):PrototypeValues {
  const on=(id:SectionId)=>state.active===id?'on':'';
  const photos=[{label:'Show photo 1 of 3'},{label:'Show photo 2 of 3'},{label:'Show photo 3 of 3'}];
  const slug=pilotSlug(data.events);
  return {
    c0:'s0'+(state.slide===0?' on':''),c1:'s1'+(state.slide===1?' on':''),c2:'s2'+(state.slide===2?' on':''),
    segs:photos.map((p,i)=>({cls:i===state.slide?'on':'',label:p.label,pick:()=>setState({slide:i})})),
    navWhat:on('what'),navComing:on('coming'),navFirst:on('first'),navClubs:on('clubs'),
    menuOpen:state.menu,toggleMenu:()=>setState({menu:!state.menu}),
    cards:[
      {t:'Live scores',d:'Referees score on their phones. Players and families follow every court from anywhere.',to:'#/live',cta:'See live scores'},
      {t:'Player Studio',d:'Your own profile, stats and match history, built from the games you play.',to:'#/club-player-studio',cta:'Open Player Studio'},
      {t:'Tournament desk',d:'Entries, draw, courts and results for the organiser, all in one place.',to:'#/events',cta:'See events'}
    ],
    events:comingUp(data.events),
    pilot:[{n:String(PILOT.players),l:'players'},{n:String(PILOT.matches),l:'matches'},{n:PILOT.points.toLocaleString('en-IN'),l:'points scored'},{n:String(PILOT.courts),l:'courts'}],
    pilotName:PILOT.name,pilotHref:slug?'#/event/'+encodeURIComponent(slug):'#/events',
    steps:[
      {no:'01',t:'Entries open',d:'Share one link. Players sign up and pay the club directly.'},
      {no:'02',t:'Pools and draw',d:'Pools, seeding and knockout built in a minute.'},
      {no:'03',t:'Live on every court',d:'Referees score on phones. Scores land everywhere at once.'},
      {no:'04',t:'Results posted',d:'Champion card and results post ready before the trophies.'}
    ]
  };
}

/** The hero button's words when nothing is live: when the next event starts, instead of a link to sample scores. */
export function nextEventLine(events:{name:string;startDate:string;startTime?:string}[],now:Date=new Date()):string{
  const soon=events.map(e=>({e,at:new Date(e.startDate+'T'+(e.startTime||'00:00'))})).filter(x=>!Number.isNaN(x.at.getTime())&&x.at.getTime()>=now.getTime()-6*3600e3).sort((a,b)=>a.at.getTime()-b.at.getTime())[0];
  if(!soon){const f=UPCOMING_EVENTS[0];return f?'Next: '+f.name+' · '+f.date:'See events';}
  const ms=soon.at.getTime()-now.getTime(),min=Math.round(ms/60000);
  const when=min<=0?'starting now':min<60?'in '+min+' min':min<24*60?'in '+Math.floor(min/60)+' h':min<48*60?'tomorrow':'in '+Math.floor(min/1440)+' days';
  return 'Next: '+soon.e.name+' · '+when;
}
/** The section the menu should highlight: the last one whose top has reached the header. */
export function activeSection(tops:Partial<Record<SectionId,number>>,offset=110):SectionId|null{let a:SectionId|null=null;for(const id of SECTIONS){const t=tops[id];if(t!==undefined&&t<=offset)a=id;}return a;}
