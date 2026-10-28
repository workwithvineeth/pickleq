import type { Go, Route } from '../../navigation';
import { ClubView, PlayerView, Sharing } from './ClubView';
import { ClubHub, ClubJoin, ClubNew, ClubSignIn } from './Hub';
import { CourtScorer, Desk, DuprExport, Entries, ScorerLinks } from './Organiser';
import { ScoreMatch } from './Score';
import { Results, TournamentNew, TournamentView } from './Tournament';

/** All Club mode screens. Loaded only when Club mode is opened, so the personal app stays small. */
export default function ClubRoutes({ route, go, back }: { route: Route; go: Go; back: () => void }) {
  const id = route.id ?? '';
  switch (route.name) {
    case 'club': return <ClubHub go={go} onBack={() => go('home')} />;
    case 'club-signin': return <ClubSignIn go={go} onBack={back} />;
    case 'club-new': return <ClubNew go={go} onBack={back} />;
    case 'club-join': return <ClubJoin key={id} code={id} go={go} onBack={() => go('club')} />;
    case 'club-view': return <ClubView key={id} clubId={id} go={go} onBack={() => go('club')} />;
    case 'club-player': return <PlayerView key={id} playerId={id} go={go} onBack={back} />;
    case 'club-sharing': return <Sharing key={id} playerId={id} go={go} onBack={back} />;
    case 'club-tournament': return <TournamentView key={id} id={id} go={go} onBack={back} />;
    case 'club-tournament-new': return <TournamentNew key={id} clubId={id} go={go} onBack={back} />;
    case 'club-score': return <ScoreMatch key={id} matchId={id} go={go} onBack={back} />;
    case 'club-desk': return <Desk key={id} id={id} go={go} onBack={back} />;
    case 'club-scorers': return <ScorerLinks key={id} id={id} go={go} onBack={back} />;
    case 'club-entries': return <Entries key={id} id={id} go={go} onBack={back} />;
    case 'club-dupr': return <DuprExport key={id} id={id} go={go} onBack={back} />;
    case 'court': return <CourtScorer key={id} token={id} onBack={() => go('home')} />;
    case 'results': return <Results key={id} slug={id} onBack={() => go('home')} />;
    default: return null;
  }
}
