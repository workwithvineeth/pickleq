import {createRoot} from 'react-dom/client';
import {initializeTheme,chooseSkin,chooseTheme} from '../../theme';
import {PublicShell,OrgShell,PageHead} from './Shell';
const q=new URLSearchParams(location.search);
const files=import.meta.glob('../../../docs/final-prototype/*.dc.html',{query:'?raw',import:'default',eager:true}) as Record<string,string>;
function inner(name:string){const raw=files['../../../docs/final-prototype/'+name+'.dc.html']??'';const m=raw.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1]??'';return m.replace(/<\/?sc-(for|if)[^>]*>/g,'').replace(/\son\w+="[^"]*"/g,'').replace(/<div class="between"[^>]*>\s*<div class="pg-h">[\s\S]*?<\/div>\s*<\/div>/,'');}
async function boot(){
 if(q.get('legacy')!=='0'){await import('../../styles.css');await import('../../shell.css');await import('../../skin.css');await import('../../prototype6.css');await import('../../club/matchday.css');await import('../../court-skin.css');await import('../../club/live-view.css');}
 initializeTheme();chooseSkin('court');chooseTheme(q.get('day')?'light':'dark');
 const go=()=>undefined;const kind=q.get('shell')??'public',page=q.get('page')??(kind==='public'?'Events':'Entries');
 const body=<div style={{display:'contents'}} dangerouslySetInnerHTML={{__html:inner(page)}}/>;
 createRoot(document.getElementById('root')!).render(kind==='public'
  ?<PublicShell go={go} active="events" footNote="Hyderabad · pickleball"><PageHead cap="Hyderabad · pickleball" title="Find your next main event." sub="Hosted by clubs across the city"/>{body}</PublicShell>
  :<OrgShell go={go} active="entries" clubName="Cedar at Maple Courts" clubId="c" tournament={{id:'t',name:'Cedar Open · Sun 15 Nov',slug:'CC'}}><PageHead cap="Cedar Open · Sun 15 Nov · entries close Fri 13 Nov, 9 pm" title="Entries & UPI" actions={<button className="btn ghost sm">Add a walk-in</button>}/>{body}</OrgShell>);
}
void boot();
