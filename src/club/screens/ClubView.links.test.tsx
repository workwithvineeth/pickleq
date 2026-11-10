import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {ClubView} from './ClubView';
vi.mock('../index',()=>({backend:()=>null}));
vi.mock('./Poster',()=>({ClubHero:()=>null,LogoPicker:()=>null}));
vi.mock('./common',async()=>({...await vi.importActual<typeof import('./common')>('./common'),useLoad:()=>({data:{club:{id:'c',name:'Sample Club'},role:'member',players:[{id:'c5aad885-de92-4e28-a5cd-976ea7e9198c',name:'Sample Player',share:{}}],tournaments:[],matches:[],members:[]},loading:false,error:null,reload:()=>{}})}));
it('opens a roster player name in the public-player route',()=>{const go=vi.fn();render(<ClubView clubId="c.players" go={go} onBack={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Sample Player'}));expect(go).toHaveBeenCalledWith('public-player','c5aad885-de92-4e28-a5cd-976ea7e9198c')});
