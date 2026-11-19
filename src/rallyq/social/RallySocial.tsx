import {useState} from 'react';
import type {Go} from '../../navigation';
import {usePublicScores} from '../../club/screens/usePublicScores';
import {courtMatches,matchView} from '../../club/liveView';
import type {PublicTournament} from '../../club/backend';
import {friendlyDate} from '../../club/dates';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from '../prototypes/Social.dc.html?raw';
import {holes} from '../holes';
import {useClubLogo,logoTile} from '../useClubLogo';
import {posterPng,savePoster,sharePoster,type PosterContent} from './posterExport';
// The prototype's organiser menu has no tournament ids (its Desk link was dead), so it goes, as on RallyOverview and RallyAdmin.
const source=holes(raw.replace(/<aside[\s\S]*?<\/aside>/,'').replace('onClick="{{save}}">Send to WhatsApp','onClick="{{share}}">Send to WhatsApp'),[['>CC</div>','><span style="display:grid;place-items:center;width:100%;height:100%;overflow:hidden;border-radius:inherit">'+logoTile('{{clubMark}}')+'</span></div>'],['font-size:17px;font-weight:800">Cedar</div>','font-size:17px;font-weight:800">{{clubName}}</div>']]);
const mark=(club:string)=>club.split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join('').toUpperCase();
type T='Entries open'|'Live now'|'Result'|'Champion';
const ST={Night:{bg:'#06140D',ink:'#F1F4EA',acc:'#D9F24A',photo:true},Day:{bg:'#2B6E4B',ink:'#FFFFFF',acc:'#D9F24A',photo:false},Ball:{bg:'#D9F24A',ink:'#0B2418',acc:'#0B2418',photo:false},Chalk:{bg:'#F1F4EA',ink:'#0B2418',acc:'#2B6E4B',photo:false}} as const;
type S=keyof typeof ST;
/** What each template says, from the event's real results. */
export function templates(d:PublicTournament|null){
 const name=d?.name??'Your event',date=d?friendlyDate(d.startDate):'';
 const score=(m:PublicTournament['matches'][number])=>m.games.map(g=>g.a+'–'+g.b).join(' · ');
 const done=d?d.matches.filter(m=>m.status==='done'&&m.winner):[];
 const fin=done.find(m=>m.stage==='final'),last=done.at(-1);
 const live=d?courtMatches(d).find(c=>c.match.status==='live'):undefined;
 const v=(m:PublicTournament['matches'][number])=>d?matchView(d,m):null;
 const wn=(m:PublicTournament['matches'][number])=>{const x=v(m);return x?(m.winner==='A'?x.a:x.b):'';};
 return {
  'Entries open':{kicker:date,head:name+'. Entries open.',big:d?d.entries.length+' teams':'',foot:'Enter on RallyQ · link in bio',chip:'Entries open',chipCls:'chip ball',ph:'ph-entries'},
  'Live now':{kicker:live?'Court '+live.court:'Live',head:live?v(live.match)!.a+' vs '+v(live.match)!.b:'Courts go live soon',big:live?v(live.match)!.pointsA+' – '+v(live.match)!.pointsB:'',foot:'See live scores on RallyQ',chip:'Live',chipCls:'chip live',ph:'ph-livenow'},
  'Result':{kicker:last?(v(last)?.division?.name??'Result'):'Result',head:last?wn(last)+' win.':'No results to share yet',big:last?score(last):'',foot:date,chip:'Result',chipCls:'chip',ph:'ph-result'},
  'Champion':{kicker:name+(fin?' · '+(v(fin)?.division?.name??''):''),head:fin?'Champions. '+wn(fin)+'.':'Champions crowned at the final.',big:fin?score(fin):'',foot:date,chip:'Champions',chipCls:'chip gold',ph:'ph-champions'}
 } as Record<T,{kicker:string;head:string;big:string;foot:string;chip:string;chipCls:string;ph:string}>;
}
export function RallySocial({slug,go}:{slug:string;go:Go}){
 const scores=usePublicScores(slug);const d=scores.data;const logoUrl=useClubLogo(slug);
 const[pick,setS]=useState<{t?:T;s:S;z:string;saved:boolean}>({s:'Night',z:'Post 4:5',saved:false});
 const[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const hasFinal=!!d?.matches.some(m=>m.stage==='final'&&m.status==='done'&&m.winner);
 // Until the organiser picks one: the template that fits the event now. Champion only once a final is won.
 const s={...pick,t:pick.t??(hasFinal?'Champion':d?.status==='live'?'Live now':'Entries open') as T};
 const TP=templates(d),st=ST[s.s],tp=TP[s.t];
 const exportPoster=async(share:boolean)=>{if(busy)return;setBusy(true);setMessage('');try{const photos:Record<string,string>={'ph-entries':'photos/desktop/entries-still-life.jpg','ph-livenow':'photos/desktop/live-court-floodlights.jpg','ph-result':'photos/desktop/social-result.jpg','ph-champions':'photos/desktop/social-champions.jpg'};const blob=await posterPng({club:d?.club??'Your club',mark:d?mark(d.club):'',...tp,bg:st.bg,ink:st.ink,accent:st.acc,photo:st.photo?photos[tp.ph]:undefined,size:s.z as PosterContent['size']});const name='rallyq-'+s.t.toLowerCase().replaceAll(' ','-')+'-'+s.z.replaceAll(' ','-').replace(':','x')+'.png';if(share)setMessage(await sharePoster(blob,name,tp.head+' · '+tp.foot));else{savePoster(blob,name);setMessage('PNG saved')}setS(current=>({...current,saved:true}));}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setMessage(e instanceof Error?e.message:'Export failed. Try again.')}finally{setBusy(false)}};
 // Fits a 375px phone: never wider than its column, shape kept by aspect-ratio.
 const dims='width:min(100%,400px);aspect-ratio:'+({'Post 4:5':'4/5','Story 9:16':'9/16','Square':'1/1'} as Record<string,string>)[s.z];
 const values={logoUrl:logoUrl??'',noLogo:!logoUrl,clubName:d?.club??'Your club',clubMark:d?mark(d.club):'',
  tpls:(Object.keys(TP) as T[]).filter(n=>n!=='Champion'||hasFinal).map(n=>({name:n,cls:n===s.t?'tab on':'tab',pick:()=>setS({...s,t:n,saved:false})})),
  styles:(Object.keys(ST) as S[]).map(n=>({name:n,pick:()=>setS({...s,s:n,saved:false}),sw:`height:72px;border-radius:14px;border:0;cursor:pointer;font:inherit;display:flex;align-items:flex-end;padding:8px;background:${ST[n].bg};box-shadow:${n===s.s?'inset 0 0 0 3px #D9F24A,0 0 0 2px #06140D':'inset 0 0 0 1px rgba(241,244,234,.2)'}`,lbl:`font-size:12px;font-weight:700;color:${ST[n].ink}`})),
  sizes:['Post 4:5','Story 9:16','Square'].map(n=>({name:n,cls:n===s.z?'tab on':'tab',pick:()=>setS({...s,z:n})})),
  photoCls:st.photo?'photo '+tp.ph:'',poster:`${dims};border-radius:18px;padding:22px;display:flex;flex-direction:column;justify-content:space-between;background-color:${st.bg};color:${st.ink};box-shadow:0 20px 60px rgba(0,0,0,.4)`,
  headSize:s.z==='Story 9:16'?'38px':'44px',...tp,accent:st.acc,ink:st.ink,
  save:()=>{void exportPoster(false)},share:()=>{void exportPoster(true)},saveLabel:busy?'Preparing PNG…':s.saved?'Saved ✓':'Save image'};
 return <PrototypeScreen name="Social" go={go} source={source} values={values} hrefs={{TV:'#/club-tv/'+encodeURIComponent(slug),Social:'#/club-social/'+encodeURIComponent(slug)}}>{message&&<p role="status" style={{padding:16}}>{message}{message.startsWith('Image saved.')&&<> <a href={'https://wa.me/?text='+encodeURIComponent(tp.head+' · '+tp.foot)} target="_blank" rel="noopener noreferrer">Open WhatsApp</a></>}</p>}</PrototypeScreen>;
}
