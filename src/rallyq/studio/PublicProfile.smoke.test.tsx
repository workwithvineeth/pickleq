import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {parseRoute} from '../../navigation';
import {PublicProfile} from './PublicProfile';
import {posterPng,sharePoster} from '../social/posterExport';
vi.mock('../social/posterExport',()=>({posterPng:vi.fn(async()=>new Blob(['png'],{type:'image/png'})),sharePoster:vi.fn(async()=>'Image saved. Attach it in WhatsApp.')}));
vi.mock('../private/backend',async()=>{const actual=await vi.importActual<typeof import('../private/backend')>('../private/backend');return{...actual,loadPublicPlayer:vi.fn(async(id:string)=>({...actual.samplePublicPlayer(),playerId:id}))}});
it('opens the staged public-player hash through its real profile component',async()=>{const id='c5aad885-de92-4e28-a5cd-976ea7e9198c';window.location.hash='#/public-player/'+id;const route=parseRoute(window.location.hash);expect(route).toEqual({name:'public-player',id});const go=vi.fn();render(<PublicProfile playerId={route.id} go={go}/>);expect(await screen.findByText('Kiran Sample')).toBeInTheDocument();fireEvent.click(screen.getByRole('link',{name:'Robin Sample'}));expect(go).toHaveBeenCalledWith('public-player','sample-other');});
it('saves the share card as a real image and marks the sample profile',async()=>{render(<PublicProfile go={vi.fn()}/>);expect(await screen.findByText('Demo profile')).toBeInTheDocument();fireEvent.click(screen.getByRole('tab',{name:'Share card'}));fireEvent.click(screen.getByRole('button',{name:'Save for Instagram'}));expect(await screen.findByRole('button',{name:'Image saved ✓'})).toBeInTheDocument();await waitFor(()=>expect(sharePoster).toHaveBeenCalledOnce());expect(posterPng).toHaveBeenCalledWith(expect.objectContaining({head:'Kiran Sample',chip:'Win',size:'Post 4:5'}));});

it('shows Best run once and labels the win rate for the selected format', async () => {
 render(<PublicProfile go={vi.fn()} />);
 const record=within(await screen.findByRole('region',{name:'Record',exact:true}));
 const cover=within(screen.getByRole('region',{name:'Athlete cover',exact:true}));
 expect(cover.getByText('Official wins',{exact:true})).toBeVisible();
 expect(screen.getAllByText('Best run',{exact:true})).toEqual([record.getByText('Best run',{exact:true})]);
 expect(record.getByText('Doubles win rate',{exact:true}).parentElement).toHaveTextContent('100%');
 fireEvent.click(record.getByRole('button',{name:'Singles',exact:true}));
 expect(record.getByText('Singles win rate',{exact:true}).parentElement).toHaveTextContent('—');
 expect(record.queryByText('Doubles win rate',{exact:true})).toBeNull();
});
