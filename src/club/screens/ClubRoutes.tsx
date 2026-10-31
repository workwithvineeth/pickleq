import type { Go, Route } from '../../navigation';
import { AdminClubView, AdminDashboard, isAdminSection } from './Admin';
import { ClubView, PlayerView, Sharing } from './ClubView';
import { EnterEvent, EventPage, EventsBoard, MyEntries, PostEvent } from './Events';
import { DeskApp, OldDeskLink } from './DeskApp';
import { ClubHub, ClubJoin, ClubNew, ClubSignIn, DemoStart } from './Hub';
import { EntriesInbox } from './Inbox';
import { CourtScorer, Desk, DuprExport, Entries, ScorerLinks } from './Organiser';
import { ScoreMatch } from './Score';
import { Results, TournamentNew, TournamentView } from './Tournament';

/** All Club mode screens. Loaded only when Club mode is opened, so the personal app stays small. */
export default function ClubRoutes({ route, go, back }: { route: Route; go: Go; back: () => void }) {
  const id = route.id ?? '';
  switch (route.name) {
    case 'club': return <ClubHub go={go} onBack={() => go('home')} />;
    case 'club-signin': return <ClubSignIn key="signin" go={go} onBack={back} />;
    case 'demo': return <DemoStart go={go} onBack={back} />;
    case 'admin-login': return <ClubSignIn key="admin" admin go={go} onBack={() => go('events')} />;
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
    case 'helper': return <OldDeskLink go={go} />;
    case 'desk': return <DeskApp key={id.split('~')[0]} id={id} go={go} />;
    case 'results': return <Results key={id} slug={id} onBack={back} />;
    case 'events': return <EventsBoard key={id} go={go} robot={id === 'robot'} />;
    case 'event': return <EventPage key={id} slug={id} go={go} onBack={() => (window.history.length > 1 ? back() : go('events'))} />;
    case 'event-enter': return <EnterEvent key={id} id={id} go={go} onBack={back} />;
    case 'my-entries': return <MyEntries go={go} onBack={back} />;
    case 'events-post': return <PostEvent go={go} onBack={back} />;
    // Old link to the listings queue: now a section of the admin dashboard.
    case 'admin-listings': return <AdminDashboard section="listings" go={go} onBack={() => go('events')} />;
    case 'admin': return <AdminDashboard section={isAdminSection(id) ? id : 'overview'} go={go} onBack={() => go('events')} />;
    case 'admin-club': return <AdminClubView key={id} id={id} go={go} onBack={back} />;
    case 'club-inbox': return <EntriesInbox key={id} id={id} go={go} onBack={back} />;
    default: return null;
  }
}
