import {useEffect,useState} from 'react';
import {eventsBackend,serverBackend} from '../club/index';
import {guessLanding,landingAfterSignIn,type Landing} from '../club/landing';

/** Where the RallyQ logo takes this visitor: the public home signed out; signed in, the page sign-in opens
 *  (Player Studio for players, My clubs for people who run a club). `staff` picks the header's account link. */
export interface Home{signedIn:boolean;route:'home'|Landing;staff:boolean}
export const SIGNED_OUT:Home={signedIn:false,route:'home',staff:false};

export async function loadHome():Promise<Home>{
 const user=await eventsBackend().currentUser().catch(()=>null);
 if(!user)return SIGNED_OUT;
 const b=serverBackend();
 const route=b?await landingAfterSignIn(b):'club';
 // The header's account link follows what the person really is, not what they last picked on "Where to?".
 const staff=b?(await guessLanding(b))==='club':true;
 return{signedIn:true,route,staff};
}

export function useHome():Home{
 const[home,setHome]=useState<Home>(SIGNED_OUT);
 useEffect(()=>{let on=true;loadHome().then(h=>{if(on)setHome(h)},()=>undefined);return()=>{on=false}},[]);
 return home;
}

/** The header's account link: sign in, or "My clubs" / "My Studio" by role. */
export function accountLink(h:Home):{label:string;route:'club-signin'|Landing}{
 if(!h.signedIn)return{label:'Sign in',route:'club-signin'};
 return h.staff?{label:'My clubs',route:'club'}:{label:'My Studio',route:'club-player-studio'};
}

/** The prototype pages (Home, Live, Event, Studio) carry a fixed header. Signed in, their "Sign in" link becomes My clubs or My Studio,
 *  "For clubs" becomes "My entries", and a player's phone menu does not list Player Studio twice. */
export function personalise(html:string,h:Home):string{
 const acct=accountLink(h);
 let s=html.replace(/(<a [^>]*?)href="Overview\.dc\.html"([^>]*>)Sign in</g,'$1href="Account.dc.html"$2'+acct.label+'<');
 if(!h.signedIn)return s;
 s=s.replace(/<a ([^>]*?)href="(?:Overview\.dc\.html|#clubs)"([^>]*)>For clubs<\/a>/g,'<a $1href="MyEntries.dc.html"$2>My entries</a>');
 // Signed-in organisers and admins: the RallyQ logo goes back to their dashboard (My clubs), not the public Home.
 if(h.staff)s=s.replace(/(<a class="brand" )href="Main\.dc\.html"/g,'$1href="#/club"');
 if(!h.staff)s=s.replace(/(<nav class="mpanel"[^>]*>[\s\S]*?)<a [^>]*href="Account\.dc\.html"[^>]*>My Studio<\/a>/,'$1');
 return s;
}
