import {describe,expect,it} from 'vitest';
import {INITIAL_MAIN,nextEventLine,PILOT,SECTIONS,activeSection,comingUp,mainValues,pilotSlug,UPCOMING_EVENTS} from './values';
import source from './Main.html?raw';
describe('Home has no made-up numbers',()=>{
 it('shows only the real pilot totals, with no player names',()=>{
  const v=mainValues(INITIAL_MAIN,()=>{});
  expect(v.pilot).toEqual([{n:'37',l:'players'},{n:'60',l:'matches'},{n:'1,003',l:'points scored'},{n:'3',l:'courts'}]);
  expect(PILOT.name).toBe('TPC Diwali Dhamaka');
 });
 it('has none of the old sample figures or demo scores in the page',()=>{
  const all=source+JSON.stringify(mainValues(INITIAL_MAIN,()=>{}));
  for(const fake of ['420','1,180','6 clubs','following','(sample)','Rao / Iyer','2,318'])expect(all).not.toContain(fake);
 });
 it('mentions the live stream only as planned',()=>{expect(source).toMatch(/Planned: the first RallyQ live stream, on 28 Nov/);expect((source.match(/28 Nov/g)??[]).length).toBe(1);});
 it('has a section for each menu link and a menu link for each section',()=>{
  for(const id of SECTIONS){expect(source).toContain('id="'+id+'"');expect(source).toContain('href="#'+id+'"');}
 });
 it('has three "What RallyQ does" cards',()=>{expect((mainValues(INITIAL_MAIN,()=>{}).cards as unknown[]).length).toBe(3);});
 it('labels the generated people as illustrations',()=>{expect((source.match(/>Illustration</g)??[]).length).toBeGreaterThanOrEqual(4);});
 it('never autoplays the hero photos',()=>{expect(source).not.toMatch(/setInterval|autoplay/i);});
});
describe('menu highlight',()=>{
 it('picks the last section that has reached the header',()=>{
  expect(activeSection({what:400,coming:900,first:1500,clubs:2100})).toBeNull();
  expect(activeSection({what:80,coming:600,first:1200,clubs:1800})).toBe('what');
  expect(activeSection({what:-900,coming:-200,first:300,clubs:900})).toBe('coming');
  expect(activeSection({what:-2000,coming:-1500,first:-800,clubs:-20})).toBe('clubs');
 });
});
describe('Coming up',()=>{
 const ev={slug:'a',name:'Sunday Cup',club:'Banyan Courts',startDate:'2026-11-22',startTime:'16:00',status:'draft' as const,city:'Hyderabad',divisions:[{id:'d',name:'Open',kind:'doubles' as const,rules:{fee:800},taken:2}]};
 it('shows real events with their entry fee, soonest first, never finished ones',()=>{
  const c=comingUp([{...ev,slug:'b',name:'Later',startDate:'2026-11-30'},ev,{...ev,slug:'c',name:'Old',status:'done'}]);
  expect(c.map(x=>x.name)).toEqual(['Sunday Cup','Later']);
  expect(c[0].detail).toContain('Entry ₹800 per team');expect(c[0].href).toBe('#/event/a');
 });
 it('falls back to the announced calendar when nothing is published',()=>{expect(comingUp([]).map(x=>x.name)).toEqual(UPCOMING_EVENTS.map(x=>x.name));});
 it('links the pilot to its page only when it is published',()=>{expect(pilotSlug([{slug:'dd',name:'TPC Diwali Dhamaka'}])).toBe('dd');expect(pilotSlug([])).toBeUndefined();});
});


describe('hero button when nothing is live',()=>{
  const now=new Date('2026-11-14T20:00:00');
  it('counts down to the next event',()=>{
    expect(nextEventLine([{name:'FPL Season 2',startDate:'2026-11-15',startTime:'16:00'}],now)).toBe('Next: FPL Season 2 · in 20 h');
    expect(nextEventLine([{name:'Sunday cup',startDate:'2026-11-15',startTime:'22:00'}],now)).toBe('Next: Sunday cup · tomorrow');
    expect(nextEventLine([{name:'Evening cup',startDate:'2026-11-14',startTime:'22:30'}],now)).toBe('Next: Evening cup · in 2 h');
    expect(nextEventLine([{name:'Pickle Yard',startDate:'2026-11-21',startTime:'15:00'}],now)).toBe('Next: Pickle Yard · in 6 days');
  });
  it('picks the earliest upcoming event and ignores finished ones',()=>{
    const events=[{name:'Old',startDate:'2026-11-01',startTime:'15:00'},{name:'Later',startDate:'2026-11-21',startTime:'15:00'},{name:'Sooner',startDate:'2026-11-15',startTime:'16:00'}];
    expect(nextEventLine(events,now)).toContain('Sooner');
  });
  it('falls back to the announced calendar, never a cancelled event',()=>{
    const line=nextEventLine([],now);
    expect(line).toContain(UPCOMING_EVENTS[0].name);
    expect(UPCOMING_EVENTS.map(e=>e.name)).not.toContain('TPC DUPR Night');
  });
});
