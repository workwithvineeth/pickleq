import {publicSourcesFor} from '../club';
import {useLoad} from '../club/screens/common';
/** The host club's uploaded logo for an event, or undefined (show initials). */
export function useClubLogo(slug:string){
 const s=useLoad(async()=>{if(!slug)return null;for(const src of await publicSourcesFor(slug)){try{const l=await src.publicClubLogo(slug);if(l)return l.logoUrl??null;}catch{/* next source */}}return null;},[slug]);
 return s.data??undefined;
}
export const logoTile=(text:string)=>'<sc-if value="{{logoUrl}}" hint-placeholder-val="{{ false }}"><img src="{{logoUrl}}" alt="{{clubName}} logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit"></sc-if><sc-if value="{{noLogo}}" hint-placeholder-val="{{ true }}">'+text+'</sc-if>';
