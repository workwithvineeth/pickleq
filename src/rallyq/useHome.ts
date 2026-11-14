import {useEffect,useState} from 'react';
import {eventsBackend,serverBackend} from '../club/index';
import {landingAfterSignIn,type Landing} from '../club/landing';

/** Where the RallyQ logo takes this visitor: the public home signed out; signed in, the page sign-in opens
 *  (Player Studio for players, My clubs for people who run a club). `staff` picks the header's account link. */
export interface Home{signedIn:boolean;route:'home'|Landing;staff:boolean}
export const SIGNED_OUT:Home={signedIn:false,route:'home',staff:false};

export async function loadHome():Promise<Home>{
 const user=await eventsBackend().currentUser().catch(()=>null);
 if(!user)return SIGNED_OUT;
 const b=serverBackend();
 const route=b?await landingAfterSignIn(b):'club';
 return{signedIn:true,route,staff:route==='club'};
}

export function useHome():Home{
 const[home,setHome]=useState<Home>(SIGNED_OUT);
 useEffect(()=>{let on=true;loadHome().then(h=>{if(on)setHome(h)},()=>undefined);return()=>{on=false}},[]);
 return home;
}

/** The header's account link: sign in, or "My clubs" / "My Studio" by role. */
export function accountLink(h:Home):{label:string;route:'club-signin'|Landing}{
 if(!h.signedIn)return{label:'Club sign in',route:'club-signin'};
 return h.staff?{label:'My clubs',route:'club'}:{label:'My Studio',route:'club-player-studio'};
}
