import type {PrototypeValues} from '../PrototypeScreen';
export interface MainState{menu:boolean;day:boolean;slide:number;sa:number;sb:number;srvA:boolean;srvNo:number;game:number;ba:number;bb:number;w:number;live:number}
export const INITIAL_MAIN:MainState={menu:false,day:false,slide:0,sa:7,sb:5,srvA:true,srvNo:2,game:2,ba:0,bb:0,w:2318,live:3};
/** The announced calendar (13 Nov evening, from the clubs' posters); shown until the clubs publish their events on RallyQ. Logos live in public/rallyq/clubs/. */
export const UPCOMING_EVENTS = [
    {date:'15 Nov',tag:'DUPR night',name:'TPC DUPR Night',club:'The Pickle Club',area:'Narapally',mark:'TPC',logo:'the-pickle-club.jpg',detail:'2:30 pm · Singles ₹299 · Doubles ₹499 · DUPR-rated'},
    {date:'15 Nov',tag:'League',name:'Friendly Pickleball League · Season 2',club:'Elite Picklers',area:'Bowenpally',mark:'EP',logo:'elite-picklers.jpg',detail:'4:00 pm · Men\u2019s and mixed doubles · ₹2,000 per team'},
    {date:'21 Nov',tag:'Tournament',name:'Pickleball Amateur Tournament',club:'The Pickle Yard',area:'Malkajgiri',mark:'PY',logo:'pickle-yard.jpg',detail:'3:00 pm · DUPR 3.5 and under · Singles ₹699 · Doubles ₹1,199'},
    {date:'28 Nov',tag:'Tournament',name:'Pickleball Central',club:'Pickleball Central',area:'Hyderabad',mark:'PC',logo:'',detail:'Details soon'}
  ];
/** Full URL for a club logo file, or '' (the card shows the club's initials). */
export const clubLogoUrl=(file:string)=>file?import.meta.env.BASE_URL+'rallyq/clubs/'+file:'';

export function mainValues(state:MainState,setState:(patch:Partial<MainState>)=>void):PrototypeValues {
  const day = state.day;
  const st = state;
  // Shown only while nothing is live: fictional clubs, so no real club looks live with made-up scores.
  const CAP = ['01 / 03 · Hyderabad', '02 / 03 · Hyderabad', '03 / 03 · Hyderabad'];
  const TK = [['Teja / Kiran','8–5','Rohan / Ajay','Banyan (sample)'],['Varun / Neel','10–10','Imran / Joseph','Lakeside (sample)'],['Mohan / Ravi','6–6','Suresh / Prem','Cedar (sample)'],['Kavya / Arjun','3–1','Nisha / Rahul','Banyan (sample)'],['Asha / Lata','4–7','Gita / Rekha','Lakeside (sample)'],['Meera / Divya','11–6','Ananya / Ritu','Cedar (sample)']];
  const tick = TK.concat(TK).map(([a,s,b,club]) => ({a, s, b, club}));
  // Fallback until the clubs publish (the real list comes from public_events); calendar from the 13 Nov handoff.
  const ev = UPCOMING_EVENTS.map(e => ({...e, chipCls: 'chip', logoUrl: clubLogoUrl(e.logo), noLogo: !e.logo}));
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
      {court:'Court 2',club:'Banyan (sample)',mark:'BC',a:'Rao / Iyer',b:'Khan / Patel',sa:9,sb:7,stage:'Men’s doubles · QF',game:2},
      {court:'Court 1',club:'Lakeside (sample)',mark:'LPC',a:'Meera S / Divya K',b:'Ananya / Ritu',sa:6,sb:4,stage:'Women’s doubles · Pool B',game:1},
      {court:'Court 3',club:'Cedar (sample)',mark:'CP',a:'Vikram / Sai',b:'Harsha / Nikhil',sa:10,sb:10,stage:'Open doubles · SF',game:3}
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
