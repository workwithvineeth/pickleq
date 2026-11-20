import {describe,expect,it} from 'vitest';
import {TAGS} from '../../domain/types';
import {CLIP_SHOTS} from '../../domain/clips';
import {EMPTY_LOG,SESSION_TAGS,buildPractice,formatOpponent,opponentLine,parseOpponent,practiceOutcome,cycleTag,focusTags,MAX_TAGS,type LogDraft} from './logSession';
const TODAY='2026-11-14';
const match=(p:Partial<LogDraft>):LogDraft=>({...EMPTY_LOG,...p});
describe('shot tags',()=>{
 it('use the practice-match dashboard tags and the pro-clip shots, each once',()=>{
  for(const t of TAGS)expect(SESSION_TAGS).toContain(t);
  for(const s of CLIP_SHOTS)expect(SESSION_TAGS.some(x=>x.toLowerCase()===s.toLowerCase()||(s==='Dink'&&x==='Dinking'))).toBe(true);
  expect(SESSION_TAGS).toEqual(expect.arrayContaining(['Backhand drive','Forehand drive']));
  expect(new Set(SESSION_TAGS.map(t=>t.toLowerCase())).size).toBe(SESSION_TAGS.length);
 });
 it('one tap went well, two taps needs work, three taps off, and stop at the database limit',()=>{
  const one=cycleTag([],[],'Serve');expect(one).toEqual({tags:['Serve'],work:[],problem:''});
  const two=cycleTag(one.tags,one.work,'Serve');expect(two).toEqual({tags:['Serve'],work:['Serve'],problem:''});
  expect(cycleTag(two.tags,two.work,'Serve')).toEqual({tags:[],work:[],problem:''});
  expect(focusTags({tags:['Serve','Dinking'],work:['Dinking']})).toEqual(['Serve · went well','Dinking · needs work']);
  const full=SESSION_TAGS.slice(0,MAX_TAGS);const r=cycleTag(full,[],SESSION_TAGS[MAX_TAGS]);expect(r.tags).toEqual(full);expect(r.problem).toMatch('up to 12');
 });
});
describe('opponent',()=>{
 it('stores singles or doubles and the 3.0 to 4.2+ level in the existing opponents text and reads it back',()=>{
  expect(formatOpponent('  Ravi  Kumar ','3.5','Doubles')).toBe('Ravi Kumar (Doubles · 3.5)');
  expect(formatOpponent('Ravi','4.2+')).toBe('Ravi (4.2+)');
  expect(formatOpponent('','','')).toBe('');
  expect(formatOpponent('','','Singles')).toBe('Opponent (Singles)');
  expect(parseOpponent('Ravi Kumar (Doubles · 3.5)')).toEqual({name:'Ravi Kumar',format:'Doubles',level:'3.5',dupr:undefined});
  expect(parseOpponent('Rohan / Ajay')).toEqual({name:'Rohan / Ajay',format:'',level:''});
  expect(opponentLine('Ravi (Singles · 4.2+)')).toBe('Ravi · Singles · 4.2+');expect(opponentLine('Opponent (Doubles · 3.0)')).toBe('Doubles · 3.0');expect(opponentLine(undefined)).toBe('');
 });
 it('still reads sessions saved the old way',()=>{
  expect(opponentLine('Ravi (weaker)')).toBe('Ravi · weaker');expect(opponentLine('Ravi (equal)')).toBe('Ravi · about equal');expect(opponentLine('Ravi (DUPR 4.10)')).toBe('Ravi · DUPR 4.10');
 });
});
describe('practiceOutcome',()=>{
 it('reads quick results and game scores',()=>{
  expect(practiceOutcome('Won')).toBe('won');expect(practiceOutcome('Lost 9–11')).toBe('lost');
  expect(practiceOutcome('11–7, 9–11, 11–8')).toBe('won');expect(practiceOutcome('7–11')).toBe('lost');
  expect(practiceOutcome('11-7, 7-11')).toBeUndefined();expect(practiceOutcome('')).toBeUndefined();
 });
});
describe('buildPractice',()=>{
 it('saves a game-by-game match as a self-logged practice match with tags and opponent',()=>{
  const r=buildPractice(match({games:[{me:'11',them:'7'},{me:'9',them:'11'},{me:'',them:''}],tags:['Backhand drive'],oppName:'Ravi',oppLevel:'3.5',format:'Doubles'}),TODAY);
  expect(r.problem).toBe('');expect(r.input).toEqual({kind:'practice_match',scoreText:'11–7, 9–11',focusTags:['Backhand drive · went well'],playedAt:TODAY,opponents:'Ravi (Doubles · 3.5)'});
  expect(r.input).not.toHaveProperty('feel');
 });
 it('asks for both scores, a winner, and at least one game',()=>{
  expect(buildPractice(match({}),TODAY).problem).toMatch('at least one game');
  expect(buildPractice(match({games:[{me:'11',them:''}]}),TODAY).problem).toBe('Game 1: enter both scores.');
  expect(buildPractice(match({games:[{me:'11',them:'11'}]}),TODAY).problem).toMatch('level');
 });
 it('quick result: Won or Lost is enough, an optional score must agree',()=>{
  expect(buildPractice(match({entry:'quick'}),TODAY).problem).toBe('Choose Won or Lost.');
  expect(buildPractice(match({entry:'quick',quick:'Won'}),TODAY).input?.scoreText).toBe('Won');
  expect(buildPractice(match({entry:'quick',quick:'Lost',quickScore:'9-11, 8-11'}),TODAY).input?.scoreText).toBe('Lost 9–11, 8–11');
  expect(buildPractice(match({entry:'quick',quick:'Won',quickScore:'9-11'}),TODAY).problem).toMatch('reads as a loss');
  expect(buildPractice(match({entry:'quick',quick:'Won',quickScore:'great game'}),TODAY).problem).toMatch('11–7');
 });
 it('quick scores cannot override the game outcome with a word or include a tied game',()=>{
  expect(buildPractice(match({entry:'quick',quick:'Won',quickScore:'Won 9–11'}),TODAY).problem).toMatch('reads as a loss');
  expect(buildPractice(match({entry:'quick',quick:'Won',quickScore:'Lost 11–7'}),TODAY).problem).toMatch('same result');
  expect(buildPractice(match({entry:'quick',quick:'Won',quickScore:'11–11'}),TODAY).problem).toMatch('cannot end level');
  expect(buildPractice(match({entry:'quick',quick:'Won',quickScore:'11–7, 9–9'}),TODAY).problem).toMatch('Game 2');
  expect(buildPractice(match({entry:'quick',quick:'Won',quickScore:'Won 11:7, 11-9'}),TODAY).input?.scoreText).toBe('Won 11–7, 11–9');
 });
 it('saves singles with a level and no name',()=>{
  expect(buildPractice(match({entry:'quick',quick:'Won',format:'Singles',oppLevel:'4.2'}),TODAY).input?.opponents).toBe('Opponent (Singles · 4.2)');
 });
 it('drill and training are one kind, with minutes',()=>{
  expect(buildPractice(match({type:'Drill or training'}),TODAY).problem).toMatch('minutes');
  expect(buildPractice(match({type:'Drill or training',minutes:'0'}),TODAY).problem).toMatch('1 to 600');
  const r=buildPractice(match({type:'Drill or training',minutes:'45',tags:['Third-shot drop'],work:['Third-shot drop']}),TODAY);
  expect(r.input).toEqual({kind:'training',scoreText:'',minutes:45,focusTags:['Third-shot drop · needs work'],playedAt:TODAY});
 });
});
