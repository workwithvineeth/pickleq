import {render,screen} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import {PrototypeScreen} from '../PrototypeScreen';
import raw from './Main.html?raw';
import {INITIAL_MAIN,UPCOMING_EVENTS,mainValues} from './values';
describe('Home calendar cards',()=>{
 it('show each club logo, falling back to initials, and the poster details',()=>{
  render(<PrototypeScreen name="Main" source={raw} go={()=>{}} values={mainValues(INITIAL_MAIN,()=>{})}/>);
  for(const club of ['The Pickle Club','Elite Picklers','The Pickle Yard'])expect(screen.getByRole('img',{name:`${club} logo`}).getAttribute('src')).toMatch(/rallyq\/clubs\/.+\.jpg$/);
  expect(screen.queryByRole('img',{name:'Pickleball Central logo'})).toBeNull();
  expect(screen.getAllByText('PC').length).toBeGreaterThan(0);
  for(const e of UPCOMING_EVENTS)expect(screen.getByText(e.detail)).toBeInTheDocument();
 });
});
