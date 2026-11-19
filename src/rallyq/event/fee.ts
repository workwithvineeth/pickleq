import type {PublicEvent} from '../../club/backend';
/** "₹2,000 per team", "From ₹699 per player", or '' when the club has not set a fee. Fees are per entry (team for doubles). */
export function entryFeeLine(divisions:Pick<PublicEvent['divisions'][number],'kind'|'rules'>[]):string{
 const fees=divisions.map(d=>d.rules?.fee).filter((n):n is number=>typeof n==='number'&&n>0);
 if(!fees.length)return '';
 const inr=(n:number)=>'₹'+n.toLocaleString('en-IN');
 const same=fees.length===divisions.length&&fees.every(f=>f===fees[0]);
 const unit=divisions.every(d=>d.kind==='singles')?'per player':divisions.some(d=>d.kind==='singles')?'per entry':'per team';
 return (same?inr(fees[0]):'From '+inr(Math.min(...fees)))+' '+unit;
}
