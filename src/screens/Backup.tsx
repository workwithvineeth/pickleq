import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { backupFileName, checkNewPassword, createBackup, openBackup, restoreBackup, type BackupContents } from '../backup/backup';
import { BackupError } from '../backup/crypto';
import { matchesToCsv } from '../backup/csv';
import { shareOrDownload } from '../backup/share';
import { daysSince, lastBackupAt, markBackedUp, storageProtection, type StorageProtection } from '../backup/status';
import { activeMatches } from '../db/matches';

function lastBackupText(at: number | null): string {
  const d = daysSince(at);
  if (d === null) return 'Never backed up';
  if (d === 0) return 'Last backup: today';
  return `Last backup: ${d} ${d === 1 ? 'day' : 'days'} ago`;
}

export function Backup({ onBack }: { onBack: () => void }) {
  const [last, setLast] = useState(lastBackupAt());
  const [protection, setProtection] = useState<StorageProtection | null>(null);
  useEffect(() => { storageProtection().then(setProtection); }, []);

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [rpw, setRpw] = useState('');
  const [opened, setOpened] = useState<BackupContents | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [csvMsg, setCsvMsg] = useState<string | null>(null);

  async function doBackup() {
    const problem = checkNewPassword(pw, pw2);
    if (problem) return setBackupMsg({ ok: false, text: problem });
    setBusy(true);
    setBackupMsg(null);
    try {
      const text = await createBackup(pw);
      const how = await shareOrDownload(backupFileName(), text, 'application/json');
      if (how === 'cancelled') {
        setBackupMsg({ ok: false, text: 'Backup not saved: sharing was cancelled.' });
      } else {
        markBackedUp();
        setLast(lastBackupAt());
        setPw('');
        setPw2('');
        setBackupMsg({ ok: true, text: how === 'shared' ? 'Backup created. Keep it somewhere safe, like Google Drive.' : 'Backup downloaded. Move it somewhere safe, like Google Drive.' });
      }
    } catch {
      setBackupMsg({ ok: false, text: 'The backup couldn’t be created. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function doOpen() {
    if (!file) return setRestoreMsg({ ok: false, text: 'Choose a backup file first.' });
    if (!rpw) return setRestoreMsg({ ok: false, text: 'Enter the backup’s password.' });
    setBusy(true);
    setRestoreMsg(null);
    try {
      setOpened(await openBackup(await file.text(), rpw));
    } catch (e) {
      setRestoreMsg({ ok: false, text: e instanceof BackupError ? e.message : 'This file can’t be opened.' });
    } finally {
      setBusy(false);
    }
  }

  async function doRestore() {
    if (!opened) return;
    setBusy(true);
    try {
      await restoreBackup(opened);
      setRestoreMsg({ ok: true, text: `Restored ${opened.matches.filter((m) => m.deletedAt === undefined).length} matches.` });
      setOpened(null);
      setFile(null);
      setRpw('');
    } catch {
      setRestoreMsg({ ok: false, text: 'Restore failed. Your existing data was left as it was.' });
    } finally {
      setBusy(false);
    }
  }

  async function doCsv() {
    const csv = matchesToCsv(await activeMatches());
    const how = await shareOrDownload(backupFileName().replace('-backup-', '-matches-').replace('.pickleq', '.csv'), csv, 'text/csv');
    setCsvMsg(how === 'cancelled' ? null : 'Spreadsheet file created.');
  }

  const protectionText = protection === 'protected' ? 'Protected from automatic clearing'
    : protection === 'not-protected' ? 'Not protected: the phone could clear it if storage runs low. Install the app and back up weekly.'
    : protection === 'unsupported' ? 'This browser can’t protect storage: keep weekly backups.' : '';

  return (
    <main className="screen" aria-labelledby="backup-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="backup-title" className="screen-title" style={{ flex: 1 }}>Backup</h1>
      </header>

      <section className="card section" aria-labelledby="bk-h">
        <h2 id="bk-h" style={{ fontSize: 18 }}>Back up</h2>
        <div className="small muted">{lastBackupText(last)}</div>
        {protectionText && <div className="small muted">Data on this phone: {protectionText}</div>}
        <label className="label" htmlFor="bk-pw">Backup password</label>
        <input id="bk-pw" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <label className="label" htmlFor="bk-pw2">Type it again</label>
        <input id="bk-pw2" className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <div className="notice notice-warn">If you forget this password, the backup can’t be opened by anyone, including you.</div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={doBackup}>Create backup</button>
        {backupMsg && <div role="status" className={`msg ${backupMsg.ok ? 'msg-ok' : 'msg-bad'}`}>{backupMsg.text}</div>}
      </section>

      <section className="card section" aria-labelledby="rs-h">
        <h2 id="rs-h" style={{ fontSize: 18 }}>Restore</h2>
        <label className="label" htmlFor="rs-file">Backup file</label>
        <input id="rs-file" className="input" style={{ paddingTop: 10 }} type="file" accept=".pickleq,application/json,.json"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setOpened(null); setRestoreMsg(null); }} />
        <label className="label" htmlFor="rs-pw">Password for this backup</label>
        <input id="rs-pw" className="input" type="password" autoComplete="current-password" value={rpw} onChange={(e) => setRpw(e.target.value)} />
        {!opened && <button type="button" className="btn btn-outline" disabled={busy} onClick={doOpen}>Open backup</button>}
        {opened && (
          <div className="section">
            <div className="notice notice-warn">
              This backup from {new Date(opened.exportedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} has{' '}
              {opened.matches.filter((m) => m.deletedAt === undefined).length} matches. Restoring replaces everything on this phone.
            </div>
            <div className="sticky-actions" style={{ position: 'static' }}>
              <button type="button" className="btn btn-outline" onClick={() => setOpened(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={doRestore}>Replace and restore</button>
            </div>
          </div>
        )}
        {restoreMsg && <div role="status" className={`msg ${restoreMsg.ok ? 'msg-ok' : 'msg-bad'}`}>{restoreMsg.text}</div>}
      </section>

      <section className="card section" aria-labelledby="csv-h">
        <h2 id="csv-h" style={{ fontSize: 18 }}>Export for spreadsheets</h2>
        <div className="small muted">A CSV file of all your matches for Excel or Google Sheets. It isn’t password-protected.</div>
        <button type="button" className="btn btn-outline" onClick={doCsv}>Export CSV</button>
        {csvMsg && <div role="status" className="msg msg-ok">{csvMsg}</div>}
      </section>
    </main>
  );
}
