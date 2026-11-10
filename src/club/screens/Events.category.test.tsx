import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {EnterEvent} from './Events';
vi.mock('./common',async()=>({...await vi.importActual<typeof import('./common')>('./common'),useLoad:()=>({data:{found:{event:{name:'Sample Open',registrationOpen:true,divisions:[{id:'singles',name:'Singles'},{id:'doubles',name:'Doubles'}]}},user:null},loading:false,error:null})}));
it('selects a category before opening the unchanged entry form',()=>{const go=vi.fn();render(<EnterEvent id="sample-open" go={go} onBack={()=>{}}/>);expect(screen.getByRole('heading',{name:'Choose your category'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Enter Doubles'}));expect(go).toHaveBeenCalledWith('event-enter','sample-open~doubles')});
