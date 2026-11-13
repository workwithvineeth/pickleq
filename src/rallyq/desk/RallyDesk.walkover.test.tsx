import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {RallyDesk} from './RallyDesk';
// One live match on court 1, as the desk sees it. Stable objects, as in the app.
const T=vi.hoisted(()=>({b:{kind:'demo',scorerLinks:async()=>[],patchMatches:vi.fn(async()=>undefined)},state:{reload:()=>{},data:{club:{name:'Sample Club'},
 tournament:{id:'t1',clubId:'c1',name:'Sample Open',courts:1,status:'live',publicSlug:'sample',startDate:'2026-11-15',startTime:'09:00',slotMinutes:20},
 matches:[{id:'m1',clubId:'c1',stage:'friendly',court:1,sideA:['p1'],sideB:['p2'],format:{bestOf:1,pointsTo:11,scoring:'rally'},games:[],status:'live',updatedAt:new Date().toISOString()}],
 players:[{id:'p1',name:'Asha'},{id:'p2',name:'Lata'}],divisions:[],entries:[]}}}));
vi.mock('../../club/screens/Organiser',()=>({useTournament:()=>T}));
it('a walkover is saved only after the desk confirms it, and can be cancelled',()=>{
 render(<RallyDesk id="t1" go={vi.fn()} onBack={()=>{}}/>);
 fireEvent.click(screen.getByRole('tab',{name:'Walkover or retired'}));
 fireEvent.click(screen.getAllByRole('button',{name:/Didn’t turn up or retired/})[0]);
 fireEvent.click(screen.getByRole('button',{name:/go through$/}));
 const confirm=screen.getByRole('group',{name:'Confirm walkover'});
 expect(confirm).toHaveTextContent('go through? This ends the match.');
 expect(T.b.patchMatches).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 expect(screen.queryByRole('group',{name:'Confirm walkover'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/go through$/}));
 fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
 expect(T.b.patchMatches).toHaveBeenCalledWith([{id:'m1',patch:{status:'done',winner:'B',games:[]}}]);
});
