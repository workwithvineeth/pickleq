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
/** Opponent level, as the player picks it (no rating is ever changed by a self-logged session). */
export type Level=''|'3.0'|'3.5'|'4.2'|'4.2+';
export const LEVELS:Exclude<Level,''>[]=['3.0','3.5','4.2','4.2+'];
export type Format=''|'Singles'|'Doubles';
export const FORMATS:Exclude<Format,''>[]=['Singles','Doubles'];
/** A tag tapped once went well; tapped twice needs work; a third tap clears it. */
export type TagMark='went-well'|'needs-work';
export interface GameDraft {me:string;them:string}
export interface LogDraft {type:SessionType;entry:EntryMode;games:GameDraft[];quick:''|'Won'|'Lost';quickScore:string;minutes:string;tags:string[];work:string[];format:Format;oppName:string;oppLevel:Level}
export const EMPTY_LOG:LogDraft={type:'Practice match',entry:'games',games:[{me:'',them:''}],quick:'',quickScore:'',minutes:'',tags:[],work:[],format:'',oppName:'',oppLevel:''};

const DASH='–';
const GAME=/(\d+)\s*[–\-:]\s*(\d+)/g;
export const parseGames=(s:string):[number,number][]=>[...s.matchAll(GAME)].map(m=>[Number(m[1]),Number(m[2])]);
/** Won or lost, from the words ("Won", "Lost 9–11") or from the game scores. Undefined when it cannot be told. */
export function practiceOutcome(scoreText:string):'won'|'lost'|undefined{
 const word=/^\s*(won|lost)\b/i.exec(scoreText);if(word)return word[1].toLowerCase() as 'won'|'lost';
 const g=parseGames(scoreText);if(!g.length)return undefined;const w=g.filter(x=>x[0]>x[1]).length,l=g.filter(x=>x[0]<x[1]).length;
 return w>l?'won':l>w?'lost':undefined;
}

/** Format, opponent and level live in the existing `opponents` text (no database change): "Ravi (Doubles · 3.5)".
 * Older rows read too: "Ravi (stronger)" and "Ravi (DUPR 4.10)". */
export function formatOpponent(name:string,level:Level,format:Format=''):string{
 const n=name.trim().replace(/\s+/g,' ');const note=[format,level].filter(Boolean).join(' · ');
 return [n||(note?'Opponent':''),note?`(${note})`:''].filter(Boolean).join(' ');
}
const OLD_LEVEL:Record<string,string>={stronger:'stronger',equal:'about equal',weaker:'weaker'};
export function parseOpponent(text:string|undefined):{name:string;format:Format;level:string;dupr?:number}{
 const m=/^(.*?)\s*\(([^()]*)\)\s*$/.exec(text??'');
 if(!m)return{name:(text??'').trim(),format:'',level:''};
 const parts=m[2].split('·').map(x=>x.trim()).filter(Boolean);let format:Format='',level='',dupr:number|undefined;
 for(const p of parts){
  if(p==='Singles'||p==='Doubles')format=p;
  else if((LEVELS as string[]).includes(p))level=p;
  else if(OLD_LEVEL[p])level=OLD_LEVEL[p];
  else if(/^DUPR\s+[\d.]+$/.test(p))dupr=Number(p.replace(/[^\d.]/g,''));
  else return{name:(text??'').trim(),format:'',level:''};
 }
 return{name:m[1].trim(),format,level,dupr};
}
/** "Ravi · Doubles · 3.5", or just "Singles · 4.2+" when no name was typed. */
export function opponentLine(text:string|undefined):string{
 const o=parseOpponent(text);
 const name=o.name==='Opponent'?'':o.name;
 return [name,o.format,o.dupr!==undefined?'DUPR '+o.dupr.toFixed(2):o.level].filter(Boolean).join(' · ');
}

const digits=(s:string)=>s.replace(/\D/g,'').slice(0,2);
export const cleanScore=digits;

/** One tap: went well. Second tap: needs work. Third tap: off. */
export function cycleTag(tags:string[],work:string[],tag:string):{tags:string[];work:string[];problem:string}{
 if(work.includes(tag))return{tags:tags.filter(t=>t!==tag),work:work.filter(t=>t!==tag),problem:''};
 if(tags.includes(tag))return{tags,work:[...work,tag],problem:''};
 if(tags.length>=MAX_TAGS)return{tags,work,problem:`Choose up to ${MAX_TAGS} tags.`};
 return{tags:[...tags,tag],work,problem:''};
}
export const tagMark=(d:{tags:string[];work:string[]},tag:string):TagMark|undefined=>d.work.includes(tag)?'needs-work':d.tags.includes(tag)?'went-well':undefined;
/** Saved focus tags say which way each one went: "Serve · went well", "Third-shot drop · needs work". */
export const focusTags=(d:{tags:string[];work:string[]}):string[]=>d.tags.slice(0,MAX_TAGS).map(t=>t+(d.work.includes(t)?' · needs work':' · went well'));

/** Turns the form into the saved row. Sessions are always self-logged: nothing here touches a rating. */
export function buildPractice(d:LogDraft,today:string):{input?:PracticeInput;problem:string}{
 const tags=focusTags(d);
 if(d.type==='Drill or training'){
  const minutes=Number(d.minutes);
  const input:PracticeInput={kind:'training',scoreText:'',minutes,focusTags:tags,playedAt:today};
  const problem=!d.minutes.trim()?'Enter the minutes you trained.':practiceProblem(input);
  return problem?{problem}:{input,problem:''};
 }
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
 const input:PracticeInput={kind:'practice_match',scoreText,focusTags:tags,playedAt:today,opponents:formatOpponent(d.oppName,d.oppLevel,d.format)||undefined};
 const problem=practiceProblem(input);
 return problem?{problem}:{input,problem:''};
}
