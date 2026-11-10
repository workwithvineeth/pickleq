import {useEffect,useState} from 'react';
import type {Go} from '../../navigation';
import {usePublicScores} from '../../club/screens/usePublicScores';
import {courtMatches,matchView} from '../../club/liveView';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from '../prototypes/TV.dc.html?raw';
import {holes} from '../holes';
import {useClubLogo,logoTile} from '../useClubLogo';
const source=holes(raw,[
 ['width:1280px;height:720px','width:100vw;height:100vh;min-height:560px'],
 ['font-size:18px">R33</div>','font-size:18px;overflow:hidden">'+logoTile('{{clubMark}}')+'</div>'],
 ['Hosted by Rally33 at Crosscourts','Hosted by {{clubName}}'],
 ['font-size:44px">Rally33 Open</div>','font-size:44px">{{eventName}}</div>'],
 ['font-size:40px">6:42</span>','font-size:40px">{{clock}}</span>'],
 ['Fatima / Zara vs Gita / Rekha · Sid / Rahul vs Leela / Tara · Open final 8:15 pm','{{upNext}}']]);
const mark=(club:string)=>club.split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join('').toUpperCase();
/** Venue TV board: every court of one event, live from the public scores. Open it full screen on the venue TV. */
export function RallyTV({slug,go}:{slug:string;go:Go}){
 const scores=usePublicScores(slug);const logoUrl=useClubLogo(slug);const[now,setNow]=useState(new Date());
 useEffect(()=>{const t=setInterval(()=>setNow(new Date()),15000);return()=>clearInterval(t)},[]);
 const d=scores.data;
 const courts=d?courtMatches(d).map(({court,match})=>{const v=matchView(d,match);return{name:'Court '+court,stage:(v.division?.name??'')+(v.game>1?' · G'+v.game:''),a:v.a,b:v.b,sa:match.status==='scheduled'?'–':v.pointsA,sb:match.status==='scheduled'?'–':v.pointsB,tap:()=>undefined};}):[];
 const next=d?d.matches.filter(m=>m.status==='scheduled').sort((a,b)=>(a.slot??0)-(b.slot??0)).slice(0,3).map(m=>{const v=matchView(d,m);return v.a+' vs '+v.b;}).join(' · '):'';
 return <PrototypeScreen name="TV" go={go} source={source} values={{logoUrl:logoUrl??'',noLogo:!logoUrl,courts,clubName:d?.club??'',clubMark:d?mark(d.club):'',eventName:d?.name??(scores.loading?'Loading…':'No event'),clock:now.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}),upNext:next||'Next matches appear here when the desk calls them.'}}/>;
}
