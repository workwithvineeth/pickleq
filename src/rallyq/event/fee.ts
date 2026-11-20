import type {PublicEvent} from '../../club/backend';
/** "₹2,000 per team", "From ₹699 per player", "₹400 per player · ₹800 per team", or '' when the club has not set a fee. Fees are per entry (team for doubles). */
export function entryFeeLine(divisions:Pick<PublicEvent['divisions'][number],'kind'|'rules'>[]):string{
 const inr=(n:number)=>'₹'+n.toLocaleString('en-IN');
 const part=(ds:typeof divisions,unit:string)=>{
  const fees=ds.map(d=>d.rules?.fee).filter((n):n is number=>typeof n==='number'&&n>0);
  if(!fees.length)return '';
  const same=fees.length===ds.length&&fees.every(f=>f===fees[0]);
  return (same?inr(fees[0]):'From '+inr(Math.min(...fees)))+' '+unit;
 };
 const s=part(divisions.filter(d=>d.kind==='singles'),'per player'),t=part(divisions.filter(d=>d.kind==='doubles'),'per team');
 return [s,t].filter(Boolean).join(' · ');
}
