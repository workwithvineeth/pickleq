import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {EnterEvent} from './Events';
vi.mock('./common',async()=>({...await vi.importActual<typeof import('./common')>('./common'),useLoad:()=>({data:{found:{src:{kind:'demo'},event:{name:'Sample Open',club:'Sample Club',startDate:'2026-12-01',startTime:'09:00',registrationOpen:true,divisions:[{id:'singles',name:'Singles',kind:'singles',rules:{},taken:0},{id:'doubles',name:'Doubles',kind:'doubles',rules:{},taken:0}]}},user:null},loading:false,error:null})}));
it('selects a category before opening the unchanged entry form',()=>{const go=vi.fn();render(<EnterEvent id="sample-open" go={go} onBack={()=>{}}/>);expect(screen.getByRole('heading',{name:'Pick your category.'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/^Doubles/}));fireEvent.click(screen.getByRole('button',{name:'Continue'}));expect(go).toHaveBeenCalledWith('event-enter','sample-open~doubles')});
