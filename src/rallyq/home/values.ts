import type {PrototypeValues} from '../PrototypeScreen';
export interface MainState{menu:boolean;day:boolean;slide:number;sa:number;sb:number;srvA:boolean;srvNo:number;game:number;ba:number;bb:number;w:number;live:number}
export const INITIAL_MAIN:MainState={menu:false,day:false,slide:0,sa:7,sb:5,srvA:true,srvNo:2,game:2,ba:0,bb:0,w:2318,live:3};
export function mainValues(state:MainState,setState:(patch:Partial<MainState>)=>void):PrototypeValues {
  const day = state.day;
  const st = state;
  const CAP = ['01 / 03 · Hosted by Loki’s Pickleball Club', '02 / 03 · Hosted by Rally33 at Crosscourts', '03 / 03 · Hosted by TPC Narapally'];
  const TK = [['Teja / Kiran','8–5','Rohan / Ajay','Loki’s'],['Varun / Neel','10–10','Imran / Joseph','Rally33'],['Mohan / Ravi','6–6','Suresh / Prem','TPC'],['Kavya / Arjun','3–1','Nisha / Rahul','ElitePicklers'],['Asha / Lata','4–7','Gita / Rekha','Rally33'],['Meera / Divya','11–6','Ananya / Ritu','Loki’s']];
  const tick = TK.concat(TK).map(([a,s,b,club]) => ({a, s, b, club}));
  const ev = [
    {date:'15 Nov',tag:'DUPR night',name:'Loki’s DUPR Night',club:'Loki’s Pickleball Club',area:'Hyderabad',mark:'LP'},
    {date:'15 Nov',tag:'Tournament',name:'Rally33 Open',club:'Rally33',area:'Crosscourts',mark:'R33'},
    {date:'15 Nov',tag:'DUPR night',name:'TPC DUPR Night',club:'TPC',area:'Narapally',mark:'TPC'},
    {date:'15 Nov',tag:'Tournament',name:'ElitePicklers Cup',club:'ElitePicklers',area:'Bowenpally',mark:'EP'},
    {date:'21 Nov',tag:'Tournament',name:'Pickleyard Classic',club:'Pickleyard',area:'Malkajgiri',mark:'PY'},
    {date:'28 Nov',tag:'Live stream',name:'Central Showdown',club:'Pickleball Central',area:'Hyderabad',mark:'PC'}
  ].map(e => ({...e, chipCls: e.tag==='Live stream' ? 'chip gold' : (e.tag==='DUPR night' ? 'chip ball' : 'chip')}));
  return {
    rqCls: day ? 'rq day' : 'rq',
    c0: 's0' + (st.slide === 0 ? ' on' : ''), c1: 's1' + (st.slide === 1 ? ' on' : ''), c2: 's2' + (st.slide === 2 ? ' on' : ''),
    cap: CAP[st.slide],
    segs: [0,1,2].map(i => ({cls: i === st.slide ? 'on' : '', label: 'Show photo ' + (i + 1), pick: () => setState({slide: i})})),
    sa: st.sa, sb: st.sb, game: st.game, watching: st.w.toLocaleString('en-IN'), liveCount: st.live,
    bumpA: 'pt ' + (st.ba % 2 ? 'b1' : 'b2'), bumpB: 'pt ' + (st.bb % 2 ? 'b1' : 'b2'),
    srvA: st.srvA ? 'sv' : 'sv off', srvB: st.srvA ? 'sv off' : 'sv',
    call: st.srvA ? `${st.sa} · ${st.sb} · ${st.srvNo}` : `${st.sb} · ${st.sa} · ${st.srvNo}`,
    tick,
    flipMode: () => setState({day: !day}),
    modeLabel: day ? 'Switch to night mode' : 'Switch to day mode',
    modeIcon: day ? 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' : 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    menuOpen: state.menu, toggleMenu: () => setState({menu: !state.menu}),
    live: [
      {court:'Court 2',club:'Loki’s',mark:'LP',a:'Rao / Iyer',b:'Khan / Patel',sa:9,sb:7,stage:'Men’s doubles · QF',game:2},
      {court:'Court 1',club:'Rally33',mark:'R33',a:'Meera S / Divya K',b:'Ananya / Ritu',sa:6,sb:4,stage:'Women’s doubles · Pool B',game:1},
      {court:'Court 3',club:'TPC',mark:'TPC',a:'Vikram / Sai',b:'Harsha / Nikhil',sa:10,sb:10,stage:'Open doubles · SF',game:3}
    ],
    steps: [
      {no:'01',t:'Entries open',d:'Share one link. Players sign up and pay the club directly.'},
      {no:'02',t:'Pools and draw',d:'Pools, seeding and knockout built in a minute.'},
      {no:'03',t:'Live on every court',d:'Referees score on phones. Scores land everywhere at once.'},
      {no:'04',t:'Results posted',d:'Champion card and results post ready before the trophies.'}
    ],
    events: ev
  };
}
