import {useEffect,useRef,useState,type ReactNode} from 'react';
import {currentTheme,subscribeTheme} from '../../theme';
function Themed({children,className}:{children:ReactNode;className:string}){
 const[day,setDay]=useState(currentTheme()==='light');
 useEffect(()=>subscribeTheme(()=>setDay(currentTheme()==='light')),[]);
 return <div className={(day?'rq day ':'rq ')+className}>{children}</div>;
}
/** Phone-only bar pinned to the bottom with the event's one action (Enter, then Live scores, then See results). It appears once the button at the top of the page has scrolled away. */
export function StickyEnter({label,disabled,onClick}:{label:string;disabled:boolean;onClick:()=>void}){
 const[show,setShow]=useState(false),probe=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const target=document.querySelector('[data-hero-cta]');
  if(!target||typeof IntersectionObserver==='undefined')return;
  const io=new IntersectionObserver(([en])=>setShow(!en.isIntersecting));io.observe(target);return()=>io.disconnect();
 },[]);
 return <Themed className="rq-sticky"><div ref={probe} className="rq-sticky-bar" hidden={!show}><button type="button" className="btn" disabled={disabled} onClick={onClick}>{label}</button></div></Themed>;
}
/** "Message the club": a short note that opens WhatsApp or email from the visitor's own phone. The club's number or address is never printed on the page. */
export function MessageSheet({eventName,club,href,onClose}:{eventName:string;club:string;href:string;onClose:()=>void}){
 const[name,setName]=useState(''),[text,setText]=useState(''),first=useRef<HTMLInputElement>(null);
 useEffect(()=>{first.current?.focus();const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};addEventListener('keydown',k);return()=>removeEventListener('keydown',k);},[onClose]);
 const body=(text.trim()||'Hi, I have a question about '+eventName+'.')+(name.trim()?'\n\n'+name.trim():'');
 const mail=href.startsWith('mailto:'),link=mail?href+'?subject='+encodeURIComponent(eventName)+'&body='+encodeURIComponent(body):href.includes('wa.me')?href+'?text='+encodeURIComponent(body):href;
 return <Themed className="rq-sheet-wrap"><div className="rq-sheet-back" onClick={onClose}/><div className="rq-sheet" role="dialog" aria-modal="true" aria-labelledby="rq-msg-title">
  <b id="rq-msg-title" style={{fontSize:20}}>Message {club}</b>
  <p className="mut" style={{margin:0,fontSize:14}}>Your message opens in {mail?'your email app':'WhatsApp'} on this phone. The club’s contact details are not shown here.</p>
  <label className="fld"><span className="lbl">Your name</span><input ref={first} className="inp" value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>
  <label className="fld"><span className="lbl">Your message</span><textarea className="inp" rows={4} style={{padding:12,minHeight:96}} value={text} onChange={e=>setText(e.target.value)} placeholder={'Hi, I have a question about '+eventName+'.'}/></label>
  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><a className="btn" href={link} target="_blank" rel="noopener noreferrer" onClick={onClose}>{mail?'Open email':'Open WhatsApp'}</a><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
 </div></Themed>;
}
