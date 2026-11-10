/** Turn prototype sample text into {{holes}} at load time, so the prototype file stays the single source of truth. */
export function holes(raw:string,pairs:[string,string][]):string{let s=raw;for(const[a,b]of pairs){if(!s.includes(a)&&import.meta.env.DEV)console.warn('RallyQ prototype text not found:',a.slice(0,60));s=s.split(a).join(b);}return s;}
