import {useEffect,useState} from 'react';
import type {Go} from '../navigation';
import {eventsBackend} from '../club/index';
import {PrototypeScreen} from './PrototypeScreen';
import raw from './prototypes/Live.dc.html?raw';

type Active='live'|'events'|'studio'|'clubs'|null;
const symbol=raw.match(/<svg width="0"[\s\S]*?<\/svg>/)?.[0]??'';
const header=(raw.match(/<header class="hdr">[\s\S]*?<\/header>/)?.[0]??'').replace(/ class="on"/g,'');
const menu=raw.match(/<sc-if value="\{\{menuOpen\}\}"[\s\S]*?<\/sc-if>/)?.[0]??'';
const LINKS:Record<Exclude<Active,null>,string>={live:'Live scores',events:'Events',studio:'Player Studio',clubs:'For clubs'};
function build(active:Active){let h=header.replace(/>Club sign in</g,'>{{clubLabel}}<');if(active)h=h.replace(new RegExp('(<a )(href="[^"]*">'+LINKS[active]+'</a>)'),'$1class="on" $2');return '<x-dc>'+symbol+'<div class="{{rqCls}}">'+h+menu.replace(/>Club sign in</g,'>{{clubLabel}}<')+'</div></x-dc>';}

/** The RallyQ public header (logo, main links, Club sign in, Night/Day) for the older screens that aren't prototype files yet. */
export function RallyHeader({go,active=null}:{go:Go;active?:Active}){
 const[signedIn,setSignedIn]=useState(false);
 useEffect(()=>{let on=true;eventsBackend().currentUser().then(u=>{if(on)setSignedIn(!!u)},()=>undefined);return()=>{on=false}},[]);
 return <PrototypeScreen name="Live" className="rq-header-only" keepTitle go={go} source={build(active)} values={{clubLabel:signedIn?'My club':'Club sign in'}} hrefs={{Overview:signedIn?'#/club':'#/club-signin',Event:'#/events'}}/>;
}
