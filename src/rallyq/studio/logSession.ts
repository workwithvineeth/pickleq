import {TAGS} from '../../domain/types';
import {CLIP_SHOTS} from '../../domain/clips';
import {practiceProblem,type PracticeInput} from '../private/backend';

/** Log a session: the same skill tags as the practice-match dashboard (TAGS) plus the pro-clip shots (CLIP_SHOTS), without repeats. */
const SAME=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export const SESSION_TAGS:string[]=[...TAGS,...CLIP_SHOTS.filter(s=>s!=='Dink'&&!TAGS.some(t=>SAME(t,s)))];
export const MAX_TAGS=12;
export const MAX_GAMES=5;

export type SessionType='Practice match'|'Drill or training';
export type EntryMode='games'|'quick';
export type Level=''|'stronger'|'equal'|'weaker';
export const LEVELS:[Exclude<Level,''>,string][]=[['stronger','Stronger than me'],['equal','About equal'],['weaker','Weaker than me']];
export interface GameDraft {me:string;them:string}
export interface LogDraft {type:SessionType;entry:EntryMode;games:GameDraft[];quick:''|'Won'|'Lost';quickScore:string;minutes:string;tags:string[];oppName:string;oppLevel:Level;oppDupr:string}
export const EMPTY_LOG:LogDraft={type:'Practice match',entry:'games',games:[{me:'',them:''}],quick:'',quickScore:'',minutes:'',tags:[],oppName:'',oppLevel:'',oppDupr:''};

const DASH='–';
const GAME=/(\d+)\s*[–\-:]\s*(\d+)/g;
export const parseGames=(s:string):[number,number][]=>[...s.matchAll(GAME)].map(m=>[Number(m[1]),Number(m[2])]);
/** Won or lost, from the words ("Won", "Lost 9–11") or from the game scores. Undefined when it cannot be told. */
export function practiceOutcome(scoreText:string):'won'|'lost'|undefined{
 const word=/^\s*(won|lost)\b/i.exec(scoreText);if(word)return word[1].toLowerCase() as 'won'|'lost';
 const g=parseGames(scoreText);if(!g.length)return undefined;const w=g.filter(x=>x[0]>x[1]).length,l=g.filter(x=>x[0]<x[1]).length;
 return w>l?'won':l>w?'lost':undefined;
}

/** The opponent is stored in the existing `opponents` text (no database change): "Ravi (stronger)" or "Ravi (DUPR 4.10)". */
export function formatOpponent(name:string,level:Level,dupr:string):string{
 const n=name.trim().replace(/\s+/g,' ');const d=dupr.trim();
 const note=d?'DUPR '+Number(d).toFixed(2):level?level:'';
 return [n||(note?'Opponent':''),note?`(${note})`:''].filter(Boolean).join(' ');
}
export function parseOpponent(text:string|undefined):{name:string;level:Level;dupr?:number}{
 const m=/^(.*?)\s*\((stronger|equal|weaker|DUPR\s+[\d.]+)\)\s*$/.exec(text??'');
 if(!m)return{name:(text??'').trim(),level:''};
 const note=m[2];const dupr=/^DUPR/.test(note)?Number(note.replace(/\D*/,'')):undefined;
 return{name:m[1].trim(),level:dupr===undefined?note as Level:'',dupr};
}
export function opponentLine(text:string|undefined):string{
 const o=parseOpponent(text);if(!o.name&&!o.level&&o.dupr===undefined)return '';
 const how=o.dupr!==undefined?'DUPR '+o.dupr.toFixed(2):o.level==='stronger'?'stronger':o.level==='weaker'?'weaker':o.level==='equal'?'about equal':'';
 return (o.name||'Opponent')+(how?' · '+how:'');
}

const digits=(s:string)=>s.replace(/\D/g,'').slice(0,2);
export const cleanScore=digits;
export const cleanDupr=(s:string)=>s.replace(/[^0-9.]/g,'').slice(0,5);

export function toggleTag(tags:string[],tag:string):{tags:string[];problem:string}{
 if(tags.includes(tag))return{tags:tags.filter(t=>t!==tag),problem:''};
 if(tags.length>=MAX_TAGS)return{tags,problem:`Choose up to ${MAX_TAGS} tags.`};
 return{tags:[...tags,tag],problem:''};
}

/** Turns the form into the saved row. Sessions are always self-logged: nothing here touches a rating. */
export function buildPractice(d:LogDraft,today:string):{input?:PracticeInput;problem:string}{
 const tags=d.tags.slice(0,MAX_TAGS);
 if(d.type==='Drill or training'){
  const minutes=Number(d.minutes);
  const input:PracticeInput={kind:'training',scoreText:'',minutes,focusTags:tags,playedAt:today};
  const problem=!d.minutes.trim()?'Enter the minutes you trained.':practiceProblem(input);
  return problem?{problem}:{input,problem:''};
 }
 const dupr=d.oppDupr.trim();
 if(dupr&&!(Number(dupr)>=1&&Number(dupr)<=8))return{problem:'Opponent rating should be a DUPR between 1.00 and 8.00.'};
 let scoreText='';
 if(d.entry==='games'){
  const rows=d.games.map((g,i)=>({g,i,blank:!g.me&&!g.them})).filter(r=>!r.blank);
  if(!rows.length)return{problem:'Enter the score of at least one game.'};
  for(const{g,i}of rows){
   if(g.me===''||g.them==='')return{problem:`Game ${i+1}: enter both scores.`};
   if(Number(g.me)===Number(g.them))return{problem:`Game ${i+1}: a game cannot end level.`};
  }
  scoreText=rows.map(({g})=>`${Number(g.me)}${DASH}${Number(g.them)}`).join(', ');
 }else{
  if(!d.quick)return{problem:'Choose Won or Lost.'};
  const extra=d.quickScore.trim();
  if(extra){
   const games=parseGames(extra);
   if(!games.length)return{problem:'Enter the score like 11–7, 9–11, or leave it empty.'};
   const tied=games.findIndex(([a,b])=>a===b);
   if(tied!==-1)return{problem:`Game ${tied+1}: a game cannot end level.`};
   const word=/^\s*(won|lost)\b/i.exec(extra)?.[1].toLowerCase();
   if(word&&word!==d.quick.toLowerCase())return{problem:'Choose the same result in Won or Lost and the optional score.'};
   const o=practiceOutcome(games.map(([a,b])=>`${a}${DASH}${b}`).join(', '));
   if(o&&o!==d.quick.toLowerCase())return{problem:`That score reads as a ${o==='won'?'win':'loss'}. Change Won or Lost, or the score.`};
   scoreText=`${d.quick} ${games.map(([a,b])=>`${a}${DASH}${b}`).join(', ')}`;
  }else scoreText=d.quick;
 }
 const input:PracticeInput={kind:'practice_match',scoreText,focusTags:tags,playedAt:today,opponents:formatOpponent(d.oppName,d.oppLevel,dupr)||undefined};
 const problem=practiceProblem(input);
 return problem?{problem}:{input,problem:''};
}
