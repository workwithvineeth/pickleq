import {render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {RallyDesk} from './RallyDesk';
vi.mock('../../club/screens/Organiser',()=>({Desk:()=>null,useTournament:()=>({b:{},state:{data:{tournament:{name:'Sample Open',courts:1,publicSlug:'sample-public-event'},matches:[],players:[],divisions:[]}}})}));
it('opens public TV, social and live screens using the event public slug',()=>{render(<RallyDesk id="private-tournament-id" go={vi.fn()} onBack={()=>{}}/>);for(const [name,path] of [['TV board','club-tv'],['Social studio','club-social'],['Public live scores','event']])expect(screen.getByRole('link',{name:new RegExp('^'+name+' .')})).toHaveAttribute('href','#/'+path+'/sample-public-event')});
