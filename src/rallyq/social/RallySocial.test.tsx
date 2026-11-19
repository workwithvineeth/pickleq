import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {RallySocial} from './RallySocial';
import {posterPng,savePoster,sharePoster} from './posterExport';
vi.mock('../../club/screens/usePublicScores',()=>({usePublicScores:()=>({data:null})}));
vi.mock('./posterExport',()=>({posterPng:vi.fn(async()=>new Blob(['png'],{type:'image/png'})),savePoster:vi.fn(),sharePoster:vi.fn(async()=>'Shared')}));
it('connects Save image and WhatsApp to the real export actions and selected size',async()=>{render(<RallySocial slug="sample" go={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:'Save image'}));await waitFor(()=>expect(savePoster).toHaveBeenCalledOnce());expect(posterPng).toHaveBeenLastCalledWith(expect.objectContaining({size:'Post 4:5'}));fireEvent.click(screen.getByRole('button',{name:'Story 9:16'}));fireEvent.click(screen.getByRole('button',{name:'Send to WhatsApp'}));await waitFor(()=>expect(sharePoster).toHaveBeenCalledOnce());expect(posterPng).toHaveBeenLastCalledWith(expect.objectContaining({size:'Story 9:16'}));});
