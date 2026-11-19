import {render} from '@testing-library/react';
import type {ReactElement} from 'react';
import {expect,it,vi} from 'vitest';
import type {PublicTournament} from '../../club/backend';
import {usePublicScores} from '../../club/screens/usePublicScores';
import {PrototypeScreen} from '../PrototypeScreen';
import {LivingQ} from '../arena/LivingQ';
import {Dna} from '../arena/Dna';
import {ralliesOf,type Rally} from '../arena/rallies';
import {RallyTV} from './RallyTV';

vi.mock('../../club/screens/usePublicScores',()=>({usePublicScores:vi.fn()}));
vi.mock('../PrototypeScreen',()=>({PrototypeScreen:vi.fn(()=>null)}));
vi.mock('../useClubLogo',()=>({useClubLogo:()=>null,logoTile:()=>''}));

it('gives TV courts Living Q and DNA only when the current game has stored history',()=>{
 const game={a:0,b:1,points:'',rallies:'BB'};
 const data:PublicTournament={name:'Cedar Open',club:'Cedar',startDate:'2026-11-20',startTime:'18:00',slotMinutes:20,status:'live',divisions:[],entries:[],matches:[
  {id:'history',divisionId:'open',stage:'pool',court:1,status:'live',games:[game]},
  {id:'empty',divisionId:'open',stage:'pool',court:2,status:'live',games:[{a:0,b:0,points:''}]},
 ]};
 const scores={data,error:null,loading:false,updatedAt:Date.now(),failures:0};
 vi.mocked(usePublicScores).mockReturnValue(scores);
 const go=vi.fn();
 const {rerender}=render(<RallyTV slug="cedar-open" go={go}/>);
 type Court={q?:ReactElement<{rallies:Rally[];confirmed:boolean}>;dna?:ReactElement<{rallies:Rally[]}>;rallyCount:number};
 const courts=()=>vi.mocked(PrototypeScreen).mock.calls.at(-1)![0].values!.courts as Court[];
 const [history,empty]=courts();
 expect(history.q?.type).toBe(LivingQ);
 expect(history.q?.props).toEqual({rallies:ralliesOf(game,true),confirmed:false});
 expect(history.dna?.type).toBe(Dna);
 expect(history.dna?.props.rallies).toBe(history.q?.props.rallies);
 expect(history.rallyCount).toBe(2);
 expect(empty).toMatchObject({q:undefined,dna:undefined,rallyCount:0});

 vi.mocked(usePublicScores).mockReturnValue({...scores,data:{...data,matches:data.matches.map(m=>m.id==='history'?{...m,status:'done'}:m)}});
 rerender(<RallyTV slug="cedar-open" go={go}/>);
 expect(courts()[0].q?.props.confirmed).toBe(true);

 vi.mocked(usePublicScores).mockReturnValue({...scores,data:null,loading:true});
 rerender(<RallyTV slug="cedar-open" go={go}/>);
 expect(courts()).toHaveLength(4);
 for(const court of courts())expect(court).toMatchObject({q:undefined,dna:undefined,rallyCount:0});
});
