/** Turn prototype sample text into {{holes}} at load time, so the prototype file stays the single source of truth. */
export function holes(raw:string,pairs:[string,string][]):string{
 let s=raw;
 for(const[a,b]of pairs){
  // A miss leaves prototype sample text (fake names, "Signed in", sample numbers) on a real page: fail loudly in dev and tests.
  if(!s.includes(a)){const msg='RallyQ prototype text not found: '+a.slice(0,80);if(import.meta.env.DEV||import.meta.env.MODE==='test')throw new Error(msg);console.warn(msg);}
  s=s.split(a).join(b);
 }
 return s;
}
