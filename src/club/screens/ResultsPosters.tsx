import { useState } from 'react';
import { downloadBlob, promoPng, type PromoInput } from '../promoArt';
import { QMark, clubMark } from '../../rallyq/shell/Shell';
import { errorText } from './common';

/** A confirmed champion of one category: built only from a finished final with a recorded winner. */
export interface ChampionInfo {
  category: string;
  winners: string[];
  runnersUp: string[];
  /** Final score, winners' points first: "11–7 · 11–9". Empty for a walkover. */
  score: string;
  /** The same games, runners-up's points first. */
  lostScore: string;
  /** Losing semi-finalists, one label per team. */
  semiFinalists: string[];
  /** Matches the champions won and played in this category. */
  won: number;
  played: number;
  /** "DUPR 3.95 · Unrated" lines, only where ratings are loaded (organiser pages). */
  winnersDupr?: string;
  runnersUpDupr?: string;
}

const gold = 'inset 0 0 0 2px var(--gold)';
const team = (names: string[]) => names.join(' & ');

/** Gold champion frame: shown only for a confirmed champion. Type only: no stock photo next to real players. */
export function ChampionHero({ c, club }: { c: ChampionInfo; club: string }) {
  return (
    <>
      <section className="card champ" aria-label={`Champions · ${c.category}`} style={{ padding: 'clamp(20px,3vw,30px)', boxShadow: gold, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="between">
          <span className="chip gold">Champions · {c.category}</span>
          <span className="row" style={{ gap: 10 }}><span className="tile">{clubMark(club)}</span><span><span className="cap" style={{ display: 'block' }}>Hosted by</span><b>{club}</b></span></span>
        </div>
        <div>
          <h2 className="disp" style={{ fontSize: 'clamp(40px,6.4vw,104px)', overflowWrap: 'anywhere' }}>{c.winners.map((n, i) => <span key={i} style={{ display: 'block' }}>{i > 0 ? '& ' : ''}{n}</span>)}</h2>
          <div className="mut" style={{ marginTop: 10 }}>{[c.winnersDupr, c.played > 0 ? (c.won === c.played ? `won all ${c.played} matches` : `won ${c.won} of ${c.played} matches`) : ''].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="row" style={{ gap: '12px 24px', flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span className="n acc" style={{ fontSize: 'clamp(44px,7vw,112px)' }}>{c.score || 'Walkover'}</span>
          <span className="mut">beat {c.runnersUp.join(' / ')} in the final</span>
        </div>
      </section>
      <div className="grid g3">
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="cap">Runners-up</span>
          <b className="disp" style={{ fontSize: 30, overflowWrap: 'anywhere' }}>{c.runnersUp.join(' / ')}</b>
          <span className="mut" style={{ fontSize: 13 }}>{[c.lostScore ? `Lost the final ${c.lostScore}` : 'Lost the final', c.runnersUpDupr].filter(Boolean).join(' · ')}</span>
        </div>
        {c.semiFinalists.length > 0 && (
          <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="cap">Semi-finals</span>
            {c.semiFinalists.map((s) => <b key={s} className="disp" style={{ fontSize: 24, overflowWrap: 'anywhere' }}>{s}</b>)}
          </div>
        )}
      </div>
    </>
  );
}

const sign = (
  <span className="row" style={{ gap: 5 }}><QMark size={14} /><span className="word" style={{ fontSize: 12 }}>RallyQ</span></span>
);

/** "Posters for the winners": four cards from the real result. Downloads use the club's promo artwork (type only);
 * a card with no artwork of its own copies the results link instead. */
export function ResultsPosters({ c, event, club, date, link }: { c: ChampionInfo; event: string; club: string; date: string; link: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const mark = clubMark(club);
  const w = team(c.winners), r = team(c.runnersUp);
  const line = `Champions at ${event}: ${w}${c.score ? `, ${c.score}` : ''}. Full results on RallyQ.`;
  const base: Omit<PromoInput, 'template' | 'headline' | 'subline'> = { club, cta: 'See every match', url: link, date, podium: { champions: c.winners.join(' / '), runnersUp: c.runnersUp.join(' / '), score: c.score } };
  async function download(template: 'results' | 'story') {
    setMsg(null);
    try {
      const file = `rallyq-${template === 'results' ? 'champions' : 'story'}-${event.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'results'}.png`;
      downloadBlob(file, await promoPng(template === 'results'
        ? { ...base, template, headline: event, subline: `${c.category} · ${date}` }
        : { ...base, template, headline: event, subline: `Champions: ${c.winners.join(' / ')}${c.score ? ` · ${c.score}` : ''}` }));
      setMsg(`Downloaded ${file}`);
    } catch (e) { setMsg(errorText(e)); }
  }
  async function copy(text: string, ok: string) {
    try { await navigator.clipboard.writeText(text); setMsg(ok); } catch { setMsg(text); }
  }
  const cap = (title: string, sub: string, button: string, label: string, onClick: () => void) => (
    <figcaption className="between"><span><b style={{ fontSize: 14 }}>{title}</b><span className="mut" style={{ display: 'block', fontSize: 12 }}>{sub}</span></span><button type="button" className="btn ghost sm" aria-label={label} onClick={onClick}>{button}</button></figcaption>
  );
  const fig = { margin: 0, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 } as const;
  const wrap = { overflowWrap: 'anywhere' } as const;
  return (
    <section aria-label="Posters for the winners" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 className="disp" style={{ fontSize: 34 }}>Posters for the winners</h2>
        <div className="mut" style={{ fontSize: 14, marginTop: 6 }}>Made from the finished results. Players share them; the club is always credited.</div>
      </div>
      <div className="grid g4" style={{ alignItems: 'start' }}>
        <figure style={fig}>
          <div className="poster champ" style={{ aspectRatio: '4/5' }}><span className="corner c1" /><span className="corner c2" />
            <div className="between" style={{ padding: '6px 8px 0 14px' }}><span className="row" style={{ gap: 8 }}><span className="ptile">{mark}</span><span style={{ fontSize: 11, lineHeight: 1.2 }}>Hosted by<br /><b>{club}</b></span></span><span className="chip gold">Champions</span></div>
            <div style={{ padding: '0 6px 6px' }}><div className="disp" style={{ fontSize: 30, ...wrap }}>{w}</div><div className="n" style={{ fontSize: 34, color: '#D9F24A', marginTop: 4 }}>{c.score || 'Walkover'}</div><div className="between" style={{ fontSize: 11, marginTop: 8, color: '#DDEBDF' }}><span>{event} · {c.category}</span>{sign}</div></div>
          </div>
          {cap('Champion', 'Post 4:5 · gold for champions only', 'Download', 'Download the champion poster', () => void download('results'))}
        </figure>
        <figure style={fig}>
          <div className="poster" style={{ aspectRatio: '4/5' }}><span className="corner c1" />
            <div className="between" style={{ padding: '6px 0 0 14px' }}><span className="cap" style={{ color: '#F1F4EA' }}>Final</span><span className="ptile">{mark}</span></div>
            <div><div className="cap" style={{ color: '#D9F24A' }}>Your match. Your moment.</div><div className="disp" style={{ fontSize: 28, marginTop: 6, ...wrap }}>{r}</div><div className="n" style={{ fontSize: 30, marginTop: 4 }}>{c.lostScore || 'Walkover'}</div><div style={{ fontSize: 11, marginTop: 8, color: '#DDEBDF' }}>Runners-up · Hosted by {club} · Scores by RallyQ</div></div>
          </div>
          {cap('Final result', 'Post 4:5 · every finalist', 'Copy link', 'Copy the results link for the final result', () => void copy(link, 'Results link copied'))}
        </figure>
        <figure style={fig}>
          <div className="poster" style={{ aspectRatio: '9/16', maxHeight: 420 }}><span className="corner c1" />
            <div className="between"><span className="ptile">{mark}</span><span className="chip">Final</span></div>
            <div><div className="n" style={{ fontSize: 56, color: '#D9F24A' }}>{c.score.split(' · ').pop() || 'Walkover'}</div><div className="disp" style={{ fontSize: 22, marginTop: 4, ...wrap }}>{w} win {event}</div><div style={{ fontSize: 11, marginTop: 8, color: '#DDEBDF' }}>Hosted by {club} · Scores by RallyQ</div></div>
          </div>
          {cap('Story', '9:16 · Instagram and WhatsApp', 'Download', 'Download the story', () => void download('story'))}
        </figure>
        <figure style={fig}>
          <div className="wa"><div className="bub"><div className="prev"><div className="poster" style={{ aspectRatio: '16/9', borderRadius: 0, boxShadow: 'none', padding: 10, justifyContent: 'flex-end' }}><span className="n" style={{ fontSize: 26, color: '#D9F24A' }}>{c.score || 'Walkover'}</span><span style={{ fontSize: 11 }}>Champions · {event}</span></div><div style={{ padding: 8, fontSize: 11, color: '#9FB4A6' }}>Hosted by {club} · rallyq</div></div>{line}</div></div>
          {cap('WhatsApp share', 'Link preview + one line · shared by the player', 'Copy', 'Copy the WhatsApp message', () => void copy(`${line} ${link}`, 'Message copied: paste it in WhatsApp'))}
        </figure>
      </div>
      <div className="mut" role="status" style={{ fontSize: 12 }}>{msg ?? 'No photos are used: the posters show names and scores only.'}</div>
    </section>
  );
}
