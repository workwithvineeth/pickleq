import {describe,expect,it} from 'vitest';
import {TAGS} from '../../domain/types';
import {CLIP_SHOTS} from '../../domain/clips';
import {EMPTY_LOG,SESSION_TAGS,buildPractice,formatOpponent,opponentLine,parseOpponent,practiceOutcome,toggleTag,MAX_TAGS,type LogDraft} from './logSession';
const TODAY='2026-11-14';
const match=(p:Partial<LogDraft>):LogDraft=>({...EMPTY_LOG,...p});
describe('shot tags',()=>{
 it('use the practice-match dashboard tags and the pro-clip shots, each once',()=>{
  for(const t of TAGS)expect(SESSION_TAGS).toContain(t);
  for(const s of CLIP_SHOTS)expect(SESSION_TAGS.some(x=>x.toLowerCase()===s.toLowerCase()||(s==='Dink'&&x==='Dinking'))).toBe(true);
  expect(SESSION_TAGS).toEqual(expect.arrayContaining(['Backhand drive','Forehand drive']));
  expect(new Set(SESSION_TAGS.map(t=>t.toLowerCase())).size).toBe(SESSION_TAGS.length);
 });
 it('toggle on and off, and stop at the database limit with a plain message',()=>{
  expect(toggleTag([],'Serve')).toEqual({tags:['Serve'],problem:''});
  expect(toggleTag(['Serve'],'Serve').tags).toEqual([]);
  const full=SESSION_TAGS.slice(0,MAX_TAGS);const r=toggleTag(full,SESSION_TAGS[MAX_TAGS]);expect(r.tags).toEqual(full);expect(r.problem).toMatch('up to 12');
 });
});
describe('opponent',()=>{
 it('stores name and strength or rating in the existing opponents text and reads it back',()=>{
  expect(formatOpponent('  Ravi  Kumar ','stronger','')).toBe('Ravi Kumar (stronger)');
  expect(formatOpponent('Ravi','equal','3.8')).toBe('Ravi (DUPR 3.80)');
  expect(formatOpponent('','','')).toBe('');
  expect(formatOpponent('','weaker','')).toBe('Opponent (weaker)');
  expect(parseOpponent('Ravi Kumar (stronger)')).toEqual({name:'Ravi Kumar',level:'stronger',dupr:undefined});
  expect(parseOpponent('Ravi (DUPR 3.80)')).toEqual({name:'Ravi',level:'',dupr:3.8});
  expect(parseOpponent('Rohan / Ajay')).toEqual({name:'Rohan / Ajay',level:''});
  expect(opponentLine('Ravi (weaker)')).toBe('Ravi · weaker');expect(opponentLine('Ravi (DUPR 4.10)')).toBe('Ravi · DUPR 4.10');expect(opponentLine(undefined)).toBe('');
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
  const r=buildPractice(match({games:[{me:'11',them:'7'},{me:'9',them:'11'},{me:'',them:''}],tags:['Backhand drive'],oppName:'Ravi',oppLevel:'stronger'}),TODAY);
  expect(r.problem).toBe('');expect(r.input).toEqual({kind:'practice_match',scoreText:'11–7, 9–11',focusTags:['Backhand drive'],playedAt:TODAY,opponents:'Ravi (stronger)'});
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
 it('checks the opponent rating',()=>{
  expect(buildPractice(match({entry:'quick',quick:'Won',oppDupr:'9'}),TODAY).problem).toMatch('DUPR');
  expect(buildPractice(match({entry:'quick',quick:'Won',oppDupr:'3.85',oppName:'Sam'}),TODAY).input?.opponents).toBe('Sam (DUPR 3.85)');
 });
 it('drill and training are one kind, with minutes',()=>{
  expect(buildPractice(match({type:'Drill or training'}),TODAY).problem).toMatch('minutes');
  expect(buildPractice(match({type:'Drill or training',minutes:'0'}),TODAY).problem).toMatch('1 to 600');
  const r=buildPractice(match({type:'Drill or training',minutes:'45',tags:['Third-shot drop']}),TODAY);
  expect(r.input).toEqual({kind:'training',scoreText:'',minutes:45,focusTags:['Third-shot drop'],playedAt:TODAY});
 });
});

it('saves the practice venue, partner and date, and validates casual wins', () => {
 const practice = buildPractice(match({
  entry: 'quick', quick: 'Won', venue: ' Maple Sample Court ', partner: ' Willow Sample ', date: '2026-01-01',
 }), TODAY);
 expect(practice.input).toMatchObject({ venue: 'Maple Sample Court', partner: 'Willow Sample', playedAt: '2026-01-01' });
 expect(buildPractice(match({ type: 'Casual games', count: '3', wins: '4' }), TODAY).problem).toMatch('wins from zero');
 expect(buildPractice(match({ type: 'Casual games', count: '3', wins: '0' }), TODAY).input).toMatchObject({
  kind: 'casual', count: 3, wins: 0,
 });
});
