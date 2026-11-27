import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {MyStudio} from './MyStudio';
const saved:unknown[]=[];
vi.mock('./MyTournaments',()=>({MyTournaments:()=>null}));
vi.mock('../private/backend',async()=>{const actual=await vi.importActual<typeof import('../private/backend')>('../private/backend');
 class Store{async load(){return{ownerId:'o',official:{players:[],official:[],logs:[],sessions:[],ratings:[],settings:{}},practice:[],goals:[],sharing:actual.PRIVATE_SHARING};}async savePractice(p:unknown){saved.push(p);return 'id';}async saveSharing(){}async saveGoal(){}}
 return{...actual,RallyStudioStore:Store};});
beforeEach(()=>{saved.length=0;});
const open=async()=>{const r=render(<MyStudio go={vi.fn()} section="log"/>);await screen.findByText('Log a session');return r;};
it('Log a session shows real shot tags, opponent fields and no "How did it feel?"',async()=>{
 await open();
 expect(screen.queryByText(/How did it feel/)).toBeNull();
 for(const n of ['Backhand drive','Forehand drive','Serve'])expect(screen.getByRole('button',{name:n})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Drill or training'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Drill'})).toBeNull();expect(screen.queryByRole('button',{name:'Training'})).toBeNull();
 expect(screen.getByLabelText('Opponent name')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Stronger than me'})).toBeInTheDocument();expect(screen.getByLabelText('Opponent DUPR rating')).toBeInTheDocument();
 expect(screen.getByText(/never change your DUPR rating/)).toBeInTheDocument();
});
it('saves a match typed game by game and tapped point by point, with tags and opponent',async()=>{
 await open();
 fireEvent.change(screen.getByLabelText('Opponent name'),{target:{value:'Ravi'}});
 fireEvent.click(screen.getByRole('button',{name:'Stronger than me'}));
 expect(screen.getByRole('button',{name:'Stronger than me'})).toHaveAttribute('aria-pressed','true');
 fireEvent.change(screen.getByLabelText('Game 1: your points'),{target:{value:'11'}});
 fireEvent.change(screen.getByLabelText('Game 1: opponent points'),{target:{value:'7'}});
 fireEvent.click(screen.getByRole('button',{name:'Add another game'}));
 for(let i=0;i<9;i++)fireEvent.click(screen.getByRole('button',{name:'Add a point for you in game 2'}));
 for(let i=0;i<11;i++)fireEvent.click(screen.getByRole('button',{name:'Add a point for the opponent in game 2'}));
 fireEvent.click(screen.getByRole('button',{name:'Backhand drive'}));
 fireEvent.click(screen.getByRole('button',{name:'Save to diary'}));
 await waitFor(()=>expect(saved).toHaveLength(1));
 expect(saved[0]).toMatchObject({kind:'practice_match',scoreText:'11–7, 9–11',focusTags:['Backhand drive'],opponents:'Ravi (stronger)'});
 expect(saved[0]).not.toHaveProperty('feel');
 expect(await screen.findByRole('button',{name:'Saved to diary ✓'})).toBeInTheDocument();
});
it('quick result needs Won or Lost and saves it',async()=>{
 await open();
 fireEvent.click(screen.getByRole('button',{name:'Quick result'}));
 fireEvent.click(screen.getByRole('button',{name:'Save to diary'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Choose Won or Lost.');expect(saved).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Won'}));
 fireEvent.click(screen.getByRole('button',{name:'Save to diary'}));
 await waitFor(()=>expect(saved).toHaveLength(1));expect(saved[0]).toMatchObject({kind:'practice_match',scoreText:'Won'});
});
it('Drill or training is one choice that asks for minutes',async()=>{
 await open();
 fireEvent.click(screen.getByRole('button',{name:'Drill or training'}));
 expect(screen.queryByLabelText('Opponent name')).toBeNull();
 fireEvent.change(screen.getByLabelText('Minutes'),{target:{value:'45'}});
 fireEvent.click(screen.getByRole('button',{name:'Third-shot drop'}));
 fireEvent.click(screen.getByRole('button',{name:'Save to diary'}));
 await waitFor(()=>expect(saved).toHaveLength(1));expect(saved[0]).toMatchObject({kind:'training',minutes:45,focusTags:['Third-shot drop']});
});
it('uses the court fallback when a player has no private photo',async()=>{
 await open();
 const cover=screen.getByRole('region',{name:'Private Athlete cover'});
 expect(cover.querySelector('.studio-cover-portrait')).toHaveAttribute('src',expect.stringContaining('club-night.jpg'));
 expect(cover).toHaveTextContent('My Studio · only you see this');
});
