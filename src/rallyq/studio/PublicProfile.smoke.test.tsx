import {render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {parseRoute} from '../../navigation';
import {PublicProfile} from './PublicProfile';
vi.mock('../private/backend',async()=>{const actual=await vi.importActual<typeof import('../private/backend')>('../private/backend');return{...actual,loadPublicPlayer:vi.fn(async(id:string)=>({...actual.samplePublicPlayer(),playerId:id}))}});
it('opens the staged public-player hash through its real profile component',async()=>{const id='c5aad885-de92-4e28-a5cd-976ea7e9198c';window.location.hash='#/public-player/'+id;const route=parseRoute(window.location.hash);expect(route).toEqual({name:'public-player',id});render(<PublicProfile playerId={route.id} go={vi.fn()}/>);expect(await screen.findByText('Kiran Sample')).toBeInTheDocument();});
