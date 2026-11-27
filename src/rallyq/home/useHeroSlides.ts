import {useEffect} from 'react';
/** How long each hero photo stays before the next one fades in. */
export const SLIDE_MS=6500;
export const SLIDES=3;
/**
 * Moves the hero to the next photo every 6.5 s. Off with reduced motion and while the tab is hidden.
 * Keyed on the current slide, so a photo picked by hand also gets the full 6.5 s before the next one.
 */
export function useHeroSlides(slide:number,next:()=>void,reduced:boolean){
 useEffect(()=>{
  if(reduced)return;
  const t=window.setTimeout(()=>{if(!document.hidden)next();},SLIDE_MS);
  return()=>window.clearTimeout(t);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[slide,reduced]);
}
