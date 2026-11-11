import {act,fireEvent,render,screen,within} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {OrgShell,PageHead,PublicShell,clubMark,clubShort} from './Shell';
const {user}=vi.hoisted(()=>({user:vi.fn()}));
vi.mock('../../club/index',()=>{const backend={currentUser:user};return{backend:()=>backend,eventsBackend:()=>backend};});
beforeEach(()=>{document.documentElement.dataset.skin='court';document.documentElement.dataset.theme='dark';localStorage.clear();user.mockResolvedValue(null);});
describe('v1.2 shells',()=>{
 it('public shell: club leads, nav calls go, phone menu and RallyQ last',async()=>{
  const go=vi.fn();render(<PublicShell go={go} active="events"><PageHead title="Find your next main event."/></PublicShell>);await act(async()=>{});
  expect(screen.getByRole('heading',{name:'Find your next main event.'})).toBeInTheDocument();
  expect(screen.getByText('Hosted by')).toBeInTheDocument();
  const nav=screen.getByRole('navigation',{name:'Main'});
  expect(within(nav).getByRole('link',{name:'Events'})).toHaveAttribute('aria-current','page');
  fireEvent.click(within(nav).getByRole('link',{name:'Live scores'}));expect(go).toHaveBeenCalledWith('live');
  fireEvent.click(screen.getByRole('link',{name:'Club sign in'}));expect(go).toHaveBeenCalledWith('club-signin');
  fireEvent.click(screen.getByRole('button',{name:'Menu'}));
  const menu=screen.getByRole('navigation',{name:'Menu'});expect(within(menu).getByRole('link',{name:'Club sign in'})).toBeInTheDocument();
  fireEvent.click(within(menu).getByRole('link',{name:'Player Studio'}));expect(go).toHaveBeenCalledWith('club-player-studio');
  expect(screen.queryByRole('navigation',{name:'Menu'})).toBeNull();
  const signoffs=document.querySelectorAll('.signoff');expect(signoffs[signoffs.length-1]).toHaveTextContent('Scores byRallyQ');
 });
 it('public shell: signed-in people see My club',async()=>{
  user.mockResolvedValue({email:'a@example.test'});const go=vi.fn();render(<PublicShell go={go}><p>x</p></PublicShell>);await act(async()=>{});
  fireEvent.click(screen.getByRole('link',{name:'My club'}));expect(go).toHaveBeenCalledWith('club');
 });
 it('mode button toggles Night/Day and remembers it',async()=>{
  render(<PublicShell go={vi.fn()}><p>x</p></PublicShell>);await act(async()=>{});
  expect(document.querySelector('.rq')).not.toHaveClass('day');
  fireEvent.click(screen.getByRole('button',{name:'Switch to day mode'}));
  expect(localStorage.getItem('pq-theme')).toBe('light');expect(document.querySelector('.rq')).toHaveClass('day');
  fireEvent.click(screen.getByRole('button',{name:'Switch to night mode'}));expect(document.querySelector('.rq')).not.toHaveClass('day');
 });
 it('organiser shell: club tile, event steps call go, one mode switch in the page head',async()=>{
  const go=vi.fn();render(<OrgShell go={go} active="entries" clubName="Rally33 at Crosscourts" clubId="c1" tournament={{id:'t1',name:'Rally33 Open',slug:'r33'}}><PageHead title="Entries & UPI" actions={<button type="button">Add a walk-in</button>}/></OrgShell>);await act(async()=>{});
  const side=screen.getByRole('complementary',{name:'Organiser menu'});
  expect(within(side).getByText('R33')).toBeInTheDocument();expect(within(side).getByText('Rally33')).toBeInTheDocument();
  expect(within(side).getByRole('link',{name:'Entries & UPI'})).toHaveAttribute('aria-current','page');
  fireEvent.click(within(side).getByRole('link',{name:'Desk'}));expect(go).toHaveBeenCalledWith('club-desk','t1');
  fireEvent.click(within(side).getByRole('link',{name:'Social studio'}));expect(go).toHaveBeenCalledWith('club-social','r33');
  expect(screen.getAllByRole('button',{name:/Switch to (day|night) mode/})).toHaveLength(1);
 });
 it('organiser shell adds the mode switch when the page has no head',async()=>{
  render(<OrgShell go={vi.fn()} active="home"><p>Overview</p></OrgShell>);await act(async()=>{});
  expect(screen.getAllByRole('button',{name:'Switch to day mode'})).toHaveLength(1);
 });
 it('club marks and short names',()=>{
  expect(clubMark('Rally33 at Crosscourts')).toBe('R33');expect(clubMark('The Pickleball Company')).toBe('TPC');expect(clubMark('Loki Pickleball')).toBe('LP');expect(clubMark('PQ Demo Friends Club')).toBe('PFC');
  expect(clubShort('Rally33 at Crosscourts')).toBe('Rally33');expect(clubShort('Ekam Pickleball')).toBe('Ekam Pickleball');
 });
});
