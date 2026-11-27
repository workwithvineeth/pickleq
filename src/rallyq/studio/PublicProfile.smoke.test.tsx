import {fireEvent,render,screen,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {parseRoute} from '../../navigation';
import {PublicProfile} from './PublicProfile';
vi.mock('./PlayerCardDialog',()=>({PlayerCardDialog:()=> <div role="dialog" aria-label="Player card"/>}));
vi.mock('../private/backend',async()=>{const actual=await vi.importActual<typeof import('../private/backend')>('../private/backend');return{...actual,loadPublicPlayer:vi.fn(async(id:string)=>({...actual.samplePublicPlayer(),playerId:id}))}});
it('opens the staged public-player hash through its real profile component',async()=>{const id='c5aad885-de92-4e28-a5cd-976ea7e9198c';window.location.hash='#/public-player/'+id;const route=parseRoute(window.location.hash);expect(route).toEqual({name:'public-player',id});const go=vi.fn();render(<PublicProfile playerId={route.id} go={go}/>);expect(await screen.findByText('Kiran Sample')).toBeInTheDocument();fireEvent.click(screen.getByRole('link',{name:'Robin Sample'}));expect(go).toHaveBeenCalledWith('public-player','sample-other');});
it('opens the same share flow from the Share card tab',async()=>{
 render(<PublicProfile go={vi.fn()}/>);
 expect(await screen.findByText('Demo profile')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab',{name:'Share card'}));
 fireEvent.click(screen.getByRole('button',{name:'Open player card'}));
 expect(await screen.findByRole('dialog',{name:'Player card'})).toBeInTheDocument();
});

it('shows Best run once and labels the win rate for the selected format', async () => {
 render(<PublicProfile go={vi.fn()} />);
 const record=within(await screen.findByRole('region',{name:'Record'}));
 const cover=within(screen.getByRole('region',{name:'Athlete cover'}));
 expect(cover.getByText('Official wins',{exact:true})).toBeVisible();
 expect(screen.getAllByText('Best run',{exact:true})).toEqual([record.getByText('Best run',{exact:true})]);
 expect(record.getByText('Doubles win rate',{exact:true}).parentElement).toHaveTextContent('100%');
 fireEvent.click(record.getByRole('button',{name:'Singles'}));
 expect(record.getByText('Singles win rate',{exact:true}).parentElement).toHaveTextContent('—');
 expect(record.queryByText('Doubles win rate',{exact:true})).toBeNull();
});
