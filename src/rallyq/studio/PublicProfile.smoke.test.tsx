import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {parseRoute} from '../../navigation';
import {PublicProfile} from './PublicProfile';
vi.mock('../private/backend',async()=>{const actual=await vi.importActual<typeof import('../private/backend')>('../private/backend');return{...actual,loadPublicPlayer:vi.fn(async(id:string)=>({...actual.samplePublicPlayer(),playerId:id}))}});
it('opens the staged public-player hash through its real profile component',async()=>{const id='c5aad885-de92-4e28-a5cd-976ea7e9198c';window.location.hash='#/public-player/'+id;const route=parseRoute(window.location.hash);expect(route).toEqual({name:'public-player',id});const go=vi.fn();render(<PublicProfile playerId={route.id} go={go}/>);expect(await screen.findByText('Kiran Sample')).toBeInTheDocument();fireEvent.click(screen.getByRole('link',{name:'Robin Sample'}));expect(go).toHaveBeenCalledWith('public-player','sample-other');});
