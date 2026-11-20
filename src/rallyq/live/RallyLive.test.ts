import {expect,it} from 'vitest';
import {connectionLost,liveChipLabel,liveValues,SAMPLE,updatedLabel} from './RallyLive';
import {LivingQ} from '../arena/LivingQ';
import {Dna} from '../arena/Dna';
import {ralliesOf,servingNow} from '../arena/rallies';

it('says how fresh the live scores are', () => {
  const at=new Date(2026,10,15,19,42).getTime();
  expect(updatedLabel(at,at+12_000,false,false)).toBe('Updated 12s ago');
  expect(updatedLabel(at,at+5*60_000,false,false)).toMatch(/^Updated 7:42/);
  expect(updatedLabel(at,at,true,false)).toBe('Can’t reach live scores · retrying');
  expect(updatedLabel(null,at,false,true)).toBe('Sample scores');
  expect(updatedLabel(null,at,false,false)).toBe('Loading scores');
});

it('calls the connection lost after two failed refreshes in a row, or a minute of silence', () => {
  const at=1_000_000;
  expect(connectionLost(0,at,at+30_000)).toBe(false);
  expect(connectionLost(1,at,at+25_000)).toBe(false);
  expect(connectionLost(2,at,at+45_000)).toBe(true);
  expect(connectionLost(0,at,at+61_000)).toBe(true);
  // Before the first load there is nothing to be stale yet; the page shows its skeleton.
  expect(connectionLost(0,null,at)).toBe(false);
});

it('shows the chip text for a lost connection and the real age otherwise', () => {
  const at=Date.now();
  expect(liveChipLabel({lost:true,sample:false,directoryError:false,today:'Sun 15 Nov'})).toBe('Connection lost · scores may be behind');
  expect(liveChipLabel({lost:false,sample:false,directoryError:false,today:'Sun 15 Nov'})).toBe('Live · Sun 15 Nov');
  expect(liveChipLabel({lost:false,sample:true,directoryError:false,today:'Sun 15 Nov'})).toBe('Sample scores · Sun 15 Nov');
  expect(liveChipLabel({lost:false,sample:true,directoryError:true,today:'Sun 15 Nov'})).toBe('Can’t reach live scores · showing a sample');
  expect(updatedLabel(at,at+3_000,false,false)).toBe('Updated 3s ago');
});


it('keeps final results final after polling stops', () => {
  expect(connectionLost(0, 1_000, 1_000_000, true)).toBe(false);
  expect(liveChipLabel({lost:false,sample:false,directoryError:false,today:'Sun 15 Nov',finished:true})).toBe('Final results · Sun 15 Nov');
});

it('labels a court by its match: only a saved result is Final, a match not started is Up next (QA-10)', async () => {
  const {courtStatus}=await import('./RallyLive');
  expect(courtStatus('live')).toBe('Live');
  expect(courtStatus('done')).toBe('Final');
  expect(courtStatus('scheduled')).toBe('Up next');
});

it('names the real match format, not always best of 3 (QA-12)', async () => {
  const {gameLabel}=await import('./RallyLive');
  expect(gameLabel(1,1,11)).toBe('One game · to 11');
  expect(gameLabel(2,3,11)).toBe('Game 2 of 3 · to 11');
  expect(gameLabel(1,1,15)).toBe('One game · to 15');
});

it('puts the format label on the selected court', async () => {
  const {liveValues}=await import('./RallyLive');
  const v=liveValues([{name:'Test',club:'Test Club',mark:'TC',courts:[{court:'Court 1',stage:'Pool A',a:'Alex / Sam',b:'Robin / Taylor',sa:0,sb:0,game:1,games:[],status:'Up next',run:0,next:'',pts:'',bestOf:1,pointsTo:11}]}],0,0,()=>{});
  expect(v.sel.gameLabel).toBe('One game · to 11');
  expect(v.sel.status).toBe('Up next');
  expect(v.sel.chip).toBe('chip');
});

it('adds Living Q, DNA and the full rally count to the selected sample court', () => {
  const {sel}=liveValues(SAMPLE,0,0,()=>{});
  expect(sel.label).toBe('Sample');expect(sel.chip).toBe('chip');
  expect(sel.q?.type).toBe(LivingQ);
  expect(sel.q?.props).toEqual({rallies:SAMPLE[0].courts[0].rallies,confirmed:false});
  expect(sel.dna?.type).toBe(Dna);
  expect(sel.dna?.props.rallies).toBe(sel.q?.props.rallies);
  expect(sel.rallyCount).toBe(13);
  expect(sel.pts.map(p=>p.who)).toEqual(['Teja','Teja','Rohan','Teja','Teja','Rohan']);
  expect(sel.run).toBe(4);
  expect(sel).toMatchObject({servingA:'',servingB:'',serverNo:'',call:'',tagA:'',tagB:''});
  expect(liveValues(SAMPLE,0,2,()=>{}).sel.q?.props.confirmed).toBe(true);
});

it('gives every sample court a complete rally history matching its displayed score', () => {
  for(const venue of SAMPLE)for(const court of venue.courts){
    expect([...court.pts].filter(p=>p==='A')).toHaveLength(court.sa);
    expect([...court.pts].filter(p=>p==='B')).toHaveLength(court.sb);
    expect(court.rallies).toHaveLength(court.sa+court.sb);
    expect(court.rallies?.at(-1)?.after).toBe(`${court.sa}-${court.sb}`);
    expect(court.rallies?.every(r=>r.outcome==='point'&&r.serverTeam===null)).toBe(true);
  }
});

it('leaves Living Q and DNA absent on an empty court', () => {
  const {sel}=liveValues([],0,0,()=>{});
  expect(sel.q).toBeUndefined();
  expect(sel.dna).toBeUndefined();
  expect(sel).toMatchObject({rallyCount:0,servingA:'',servingB:'',serverNo:'',call:'',tagA:'',tagB:''});
});

function rallySelection(pts:string,status='Live'){
  const sa=[...pts].filter(p=>p==='A').length,sb=pts.length-sa;
  const court={...SAMPLE[0].courts[0],pts,sa,sb,status,rallies:ralliesOf({points:pts,a:sa,b:sb},true)};
  return liveValues([{...SAMPLE[0],courts:[court]}],0,0,()=>{}).sel;
}

it.each(['A','B'] as const)('tags a live run of three for team %s only', team => {
  const sel=rallySelection(team==='A'?'BAAA':'ABBB');
  expect(sel.tagA).toBe(team==='A'?'3 in a row':'');
  expect(sel.tagB).toBe(team==='B'?'3 in a row':'');
});

it('gives Level priority on the last scoring team after a comeback', () => {
  expect(rallySelection('AAABBB')).toMatchObject({tagA:'',tagB:'Level'});
  expect(rallySelection('BBBAAA')).toMatchObject({tagA:'Level',tagB:''});
  expect(rallySelection('AB')).toMatchObject({tagA:'',tagB:''});
});

it.each(['Final','Up next'])('hides run and Level tags when the court is %s', status => {
  expect(rallySelection('BAAA',status)).toMatchObject({tagA:'',tagB:''});
  expect(rallySelection('AAABBB',status)).toMatchObject({tagA:'',tagB:''});
});

it.each([true,false])('shows serving team and call, with server number only for doubles (%s)', doubles => {
  const game={a:0,b:1,rallies:'BB'};
  const court={...SAMPLE[0].courts[0],sa:0,sb:1,pts:'B',rallies:ralliesOf(game,doubles),serving:servingNow(game,doubles)};
  const {sel}=liveValues([{...SAMPLE[0],courts:[court]}],0,0,()=>{});
  expect(sel).toMatchObject({rallyCount:2,servingA:'',servingB:'on',serverNo:doubles?1:'',call:doubles?'1-0-1':'1-0'});
});

it('ends the run tag on a side-out and follows the new serving team', () => {
  const game={a:3,b:0,rallies:'AAAB'};
  const court={...SAMPLE[0].courts[0],sa:3,sb:0,pts:'AAA',rallies:ralliesOf(game,true),serving:servingNow(game,true)};
  const {sel}=liveValues([{...SAMPLE[0],courts:[court]}],0,0,()=>{});
  expect(sel).toMatchObject({rallyCount:4,tagA:'',tagB:'',servingA:'',servingB:'on',serverNo:1,call:'0-3-1'});
});
