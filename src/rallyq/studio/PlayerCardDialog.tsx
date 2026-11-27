import { useEffect, useRef, useState } from 'react';
import { appLink, copyLink } from '../../club/screens/common';
import { loadPublicPlayer, samplePublicPlayer, type PublicRallyPlayer } from '../private/backend';
import { savePoster, sharePoster } from '../social/posterExport';
import { matchCard, playerCard, renderCardPng, type CardSize } from './playerCards';
import './playerCards.css';

export interface CardRequest { playerId?: string; matchId?: string; sample?: boolean }

export function PlayerCardDialog({ request, onClose }: { request: CardRequest; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [profile, setProfile] = useState<PublicRallyPlayer | null>();
  const [size, setSize] = useState<CardSize>('Post 4:5');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [image, setImage] = useState<{ blob: Blob; url: string; size: CardSize; name: string }>();
  const { playerId, matchId, sample } = request;

  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const published = sample ? samplePublicPlayer() : playerId ? await loadPublicPlayer(playerId) : null;
        if (active) setProfile(published);
      } catch {
        if (active) setError('Could not load the public results. Reopen the card to try again.');
      }
    };
    void load();
    return () => { active = false; };
  }, [playerId, sample]);

  useEffect(() => {
    if (profile === undefined) return;
    const card = matchId
      ? profile && matchCard(profile, matchId)
      : playerCard(profile ?? { name: displayName.trim() || 'RallyQ player', club: '', official: [] });
    if (!card) {
      setError('This result is unavailable on the public profile.');
      return;
    }
    let active = true;
    let url: string | undefined;
    void renderCardPng(card, size).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setImage({ blob, url, size, name: card.name });
    }).catch(() => {
      if (active) setError('Could not create the card image.');
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [profile, displayName, matchId, size]);

  const ready = image?.size === size && !error ? image : undefined;
  const fileName = `rallyq-${matchId ? 'result' : 'player'}-${size === 'Post 4:5' ? '4x5' : '9x16'}.png`;
  const profileUrl = !sample && profile && playerId ? appLink('#/public-player/' + encodeURIComponent(playerId)) : '';
  async function share() {
    if (!ready) return;
    try {
      setStatus(await sharePoster(ready.blob, fileName, `${ready.name} · Scored live on RallyQ`));
    } catch (failure) {
      if (failure instanceof Error && failure.name === 'AbortError') return;
      savePoster(ready.blob, fileName);
      setStatus('Image saved.');
    }
  }
  return <dialog className="player-card-dialog" aria-labelledby="player-card-title" ref={dialog} onClose={onClose}>
    <header>
      <h2 id="player-card-title">{matchId ? 'Share match result' : 'Share my card'}</h2>
      <button type="button" aria-label="Close card" onClick={() => dialog.current?.close()}>✕</button>
    </header>
    {!matchId && <div className="player-card-controls" role="group" aria-label="Card size">
      <button type="button" aria-pressed={size === 'Post 4:5'} onClick={() => { setStatus(''); setSize('Post 4:5'); }}>4:5 Feed</button>
      <button type="button" aria-pressed={size === 'Story 9:16'} onClick={() => { setStatus(''); setSize('Story 9:16'); }}>9:16 Status</button>
    </div>}
    {!matchId && profile === null && <label className="player-card-name">Name on card
      <input value={displayName} maxLength={80} placeholder="RallyQ player" onChange={e => { setImage(undefined); setDisplayName(e.target.value); }} />
    </label>}
    {ready ? <img className="player-card-preview" src={ready.url} alt={`${ready.name} ${matchId ? 'match result' : 'player card'} preview`} />
      : <p role={error ? 'alert' : 'status'}>{error || 'Making your PNG…'}</p>}
    <footer>
      <button type="button" className="player-card-share" disabled={!ready} onClick={() => void share()}>Share PNG</button>
      {!matchId && profileUrl && <button type="button" onClick={async () => setStatus((await copyLink(profileUrl)).text)}>Copy profile link</button>}
    </footer>
    {status && <p role="status">{status}</p>}
  </dialog>;
}
