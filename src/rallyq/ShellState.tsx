import type {Go} from '../navigation';
import {PrototypeScreen,type PrototypeName} from './PrototypeScreen';

/** A prototype page with its own header and menu kept, and the page body swapped for `{{body}}`. */
export function shellSource(raw:string){
 const menu=raw.indexOf('class="mpanel"'),end=raw.indexOf('</sc-if>',menu);
 if(menu<0||end<0)throw Error('Prototype has no menu panel to keep.');
 return raw.slice(0,end+'</sc-if>'.length)+'<div class="wrap" style="padding-block:28px 64px;display:flex;flex-direction:column;gap:14px">{{body}}</div></div></x-dc>';
}
const BLOCKS=[180,72,72,72];
/** Loading skeleton, or a short message with one way out, inside the normal public header. */
export function ShellState({name,source,go,loading,message,linkLabel='See all events'}:{name:PrototypeName;source:string;go:Go;loading:boolean;message?:string;linkLabel?:string}){
 const body=loading
  ?<div aria-busy="true" aria-label="Loading" style={{display:'flex',flexDirection:'column',gap:14}}>{BLOCKS.map((h,i)=><div key={i} className="card" style={{height:h,opacity:.45}}/>)}</div>
  :<div className="card" role="status" style={{padding:24,display:'flex',flexDirection:'column',gap:10}}><p style={{margin:0,fontWeight:700,fontSize:18}}>{message}</p><a className="tlink" href="#/events" onClick={e=>{e.preventDefault();go('events');}} style={{alignSelf:'flex-start',minHeight:44,display:'inline-flex',alignItems:'center'}}>{linkLabel}</a></div>;
 return <PrototypeScreen name={name} go={go} source={source} values={{body}}/>;
}
