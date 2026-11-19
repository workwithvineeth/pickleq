import {render,screen,within} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from './Main.html?raw';
import {INITIAL_MAIN,UPCOMING_EVENTS,mainValues} from './values';
const view=(active:'what'|null=null)=>render(<PrototypeScreen name="Main" source={raw} go={()=>{}} values={{...mainValues({...INITIAL_MAIN,active},()=>{}),heroCta:'Next: Sunday cup · tomorrow'}}/>);
describe('Home',()=>{
 it('has a one-button hero and the five sections in order',()=>{
  view();
  expect(screen.getByRole('heading',{level:1,name:/Your court\./})).toBeInTheDocument();
  expect(screen.getByRole('link',{name:/Next: Sunday cup/})).toBeInTheDocument();
  const heads=screen.getAllByRole('heading',{level:2}).map(h=>h.textContent);
  expect(heads).toEqual(['Three things, done well.','This month on court.','TPC Diwali Dhamaka, scored live.','Run your event on RallyQ.']);
 });
 it('shows the pilot totals and the announced calendar with logos or initials',()=>{
  view();
  const first=document.getElementById('first')!;
  for(const t of ['37','60','1,003','3'])expect(within(first).getByText(t)).toBeInTheDocument();
  for(const e of UPCOMING_EVENTS)expect(screen.getByText(e.detail)).toBeInTheDocument();
  expect(screen.getByRole('img',{name:'Elite Picklers logo'})).toBeInTheDocument();
 });
 it('marks the active menu link',()=>{
  view('what');
  expect(screen.getAllByRole('link',{name:'What RallyQ does'}).some(a=>a.classList.contains('on'))).toBe(true);
  expect(screen.getByRole('link',{name:'Coming up'}).classList.contains('on')).toBe(false);
 });
});
