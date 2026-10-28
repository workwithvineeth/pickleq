import type { ReactNode } from 'react';
import { Icon } from '../components/Icon';
import type { Go } from '../navigation';

function Page({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <main className="screen" aria-labelledby="page-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="page-title" className="screen-title" style={{ flex: 1, fontSize: 24 }}>{title}</h1>
      </header>
      {children}
    </main>
  );
}

function Topic({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="card help-topic">
      <summary>{title}</summary>
      <div className="help-body">{children}</div>
    </details>
  );
}

export function Help({ go, onBack }: { go: Go; onBack: () => void }) {
  return (
    <Page title="How to use PICKLEQ" onBack={onBack}>
      <p className="small muted" style={{ margin: 0 }}>Tap a topic to open it. Everything here works offline.</p>
      <Topic title="Start here: install and back up">
        <ol>
          <li><b>iPhone:</b> open the link in Safari, tap Share, then <i>Add to Home Screen</i>. <b>Android:</b> in Chrome, tap ⋮, then <i>Install app</i>.</li>
          <li>Always open PICKLEQ from the home-screen icon. That’s where your data lives.</li>
          <li><b>Back up weekly</b> (Settings → Backup). The file is locked with your password. Keep it in Drive or Files.</li>
          <li>On iPhone, deleting the home-screen icon deletes the app’s data. Back up first.</li>
        </ol>
      </Topic>
      <Topic title="Log a match in under a minute">
        <ol>
          <li>Tap the round <b>+</b> button. Tap your score, then theirs, on the number grid.</li>
          <li>Pick how the game went: came back (and from what score), lost a lead, dominated, or neither.</li>
          <li>Tap <b>Save score</b>. Add tags, energy, notes and shot ratings now or later. Matches still missing details show on Home.</li>
          <li>Players, date and format are optional. Names and ratings you’ve used before fill in as you type.</li>
        </ol>
        <p>Old matches from a notebook: Matches → <i>Add an old match</i> (score only).</p>
      </Topic>
      <Topic title="Ratings, stats and form">
        <p>Tap a rating card on Home to add a DUPR reading whenever you check DUPR. PICKLEQ never calculates ratings itself.</p>
        <p>The Stats tab shows win %, close games, momentum, opponent strength, energy, head-to-head and partners. Use the filters at the top for time range and singles or doubles.</p>
      </Topic>
      <Topic title="Training, goals and pro clips">
        <p>Train → <b>Log training</b>: pick the type and minutes, and count drill makes and tries (like 18 of 25). Log rest days too; they keep your streak going.</p>
        <p>Goals: rating, weekly hours, drill success, streak or a tournament result. Progress shows on the Train tab.</p>
        <p><b>Pro clips</b> (Train tab): YouTube clips for each shot. Use 0.5× to watch slowly, Loop to repeat, and Approve or Hide each one. They need internet.</p>
      </Topic>
      <Topic title="Tournaments">
        <ol>
          <li>Matches → <b>Tournaments</b> → New. Add each event you’re playing, with your partner and format.</li>
          <li>Tick off the checklist and add your match times. The next one shows on Home.</li>
          <li>At the venue, tap <b>Log result</b> next to a match time, or <i>Log a match in this event</i>.</li>
          <li>Add the other teams in your pool for a table. Their results between themselves are optional.</li>
          <li>Afterwards, set your placement and write a few notes. The summary builds itself.</li>
        </ol>
      </Topic>
      <Topic title="Coach: insights and Claude">
        <p><b>Built-in insights</b> are free, work offline and only describe your records.</p>
        <p><b>Claude</b> writes longer coaching from your records. Add your own key once (Coach → ⚙). Each answer costs about ₹0.15–0.5 from your prepaid Claude credit. Before you ask, “What Claude will see” shows exactly what’s sent.</p>
        <p>Every answer separates <i>From your data</i> (real numbers) from <i>Possible explanation · not proven</i>. Shot ratings are your own estimates; drill counts are measured.</p>
        <p>Coach → <b>Performance report (PDF)</b> makes a 90-day report you can share.</p>
        <button type="button" className="link-btn" onClick={() => go('coach-settings')}>Open Coach settings</button>
      </Topic>
      <Topic title="Mistakes, Trash and history">
        <p>Edit any match from its page. Every change is kept in its history. Deleted matches, sessions and tournaments wait in Trash (Matches → Trash) for 30 days.</p>
      </Topic>
      <Topic title="App lock">
        <p>Settings → <b>App lock</b> adds a 4–6 digit PIN. Choose when it locks again after you leave the app. If you forget the PIN, the only way back in is to erase the app’s data and restore a backup, so keep backups up to date.</p>
      </Topic>
      <Topic title="Preview and Live">
        <p>Live holds your real data. Preview (gold icon) is for trying new versions with sample data. They never share data.</p>
      </Topic>
    </Page>
  );
}

export function Privacy({ onBack }: { onBack: () => void }) {
  return (
    <Page title="Privacy and your data" onBack={onBack}>
      <section className="card section">
        <h2 style={{ fontSize: 18 }}>What’s stored, and where</h2>
        <p style={{ margin: 0 }}>Your matches, players, ratings, training, goals, tournaments, clip choices and Claude conversations are stored <b>only on this phone</b>, inside this app. There is no PICKLEQ server and no account.</p>
      </section>
      <section className="card section">
        <h2 style={{ fontSize: 18 }}>When anything leaves the phone</h2>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li><b>Claude</b>, only when you tap Ask or Send: the records shown under “What Claude will see”, including names you’ve recorded, go to Anthropic. Anthropic’s policy is not to train on API data by default and to delete it within 30 days (see its <a href="https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training" target="_blank" rel="noopener noreferrer">training</a> and <a href="https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data" target="_blank" rel="noopener noreferrer">retention</a> pages).</li>
          <li><b>YouTube</b>, only when you tap play on a pro clip: the video loads from YouTube in privacy-enhanced mode, and Google can see that you watched it, as on youtube.com.</li>
          <li><b>App updates</b>: the app checks GitHub Pages for new code. That sends none of your data, but GitHub sees the request, as with any website.</li>
          <li><b>Backups</b>, only when you export one: the file is encrypted with your password, and you choose where it goes.</li>
        </ul>
      </section>
      <section className="card section">
        <h2 style={{ fontSize: 18 }}>What PICKLEQ never does</h2>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>No analytics, ads, tracking or crash reporting.</li>
          <li>Your Claude key stays on this phone. It isn’t in backups, exports or the app’s code.</li>
          <li>The PIN itself is never stored, only a scrambled check value.</li>
        </ul>
      </section>
      <section className="card section">
        <h2 style={{ fontSize: 18 }}>Good to know</h2>
        <p style={{ margin: 0 }}>The app lock keeps people out of the app; it doesn’t encrypt the data on the phone. Your phone’s own passcode is what protects the phone. Backups are the only copy outside this phone, so keep them safe and remember the password.</p>
      </section>
    </Page>
  );
}
