import type { OfficialMatch } from '../../club/playerStudio';
import { STAGE_LABEL } from '../../club/types';
import { COURT_Q } from '../Brand';
import type { PublicRallyPlayer } from '../private/backend';
import { POSTER_SIZES, posterLines } from '../social/posterExport';
import { matchEvidence, matchWon, studioRecord } from './records';

export type CardSize = 'Post 4:5' | 'Story 9:16';
export type CardProfile = Pick<PublicRallyPlayer, 'name' | 'club' | 'duprSingles' | 'duprDoubles' | 'official' | 'photoUrl'>;
const SIGN_OFF = 'Scored live on RallyQ';
const STAGE_ORDER = ['friendly', 'pool', 'r32', 'r16', 'qf', 'sf', 'final'];
const scoredGames = (m: OfficialMatch) => m.games.map(g => m.mySide === 'A' ? `${g.a}–${g.b}` : `${g.b}–${g.a}`);
const result = (m: OfficialMatch) => matchWon(m) ? 'Won' : 'Lost';

export function playerCard(profile: CardProfile) {
  const matches = [...profile.official].sort((a, b) => b.playedOn.localeCompare(a.playedOn) || STAGE_ORDER.indexOf(b.stage) - STAGE_ORDER.indexOf(a.stage));
  const record = studioRecord(matches);
  const latest = matches[0];
  const best = matches.map(match => ({ match, evidence: matchEvidence(match) }))
    .filter(row => row.evidence.games.some(game => game.length))
    .sort((a, b) => Number(matchWon(b.match)) - Number(matchWon(a.match)) || b.evidence.bestRun - a.evidence.bestRun)[0];
  const dna = best ? best.evidence.games.flat().slice(-28).map(rally => rally.winner) : [];
  const ratings = [
    ...(profile.duprDoubles === undefined ? [] : [`DUPR doubles  ${profile.duprDoubles.toFixed(2)}`]),
    ...(profile.duprSingles === undefined ? [] : [`DUPR singles  ${profile.duprSingles.toFixed(2)}`]),
  ];
  return {
    kind: 'player' as const, name: profile.name, club: profile.club, photoUrl: profile.photoUrl,
    ratings, wins: record.wins, losses: record.played - record.wins, rate: record.rate, finish: record.finish,
    latest: latest ? { event: latest.tournament, detail: [result(latest), ...scoredGames(latest)].join(' · ') } : undefined,
    dna, dnaEvent: best?.match.tournament,
  };
}

export function matchCard(profile: CardProfile, matchId: string) {
  const match = profile.official.find(m => m.id === matchId);
  if (!match) return null;
  const [team, opponents] = match.mySide === 'A' ? [match.sideA, match.sideB] : [match.sideB, match.sideA];
  return {
    kind: 'match' as const, name: profile.name, event: match.tournament,
    round: [match.division, STAGE_LABEL[match.stage]].filter(Boolean).join(' · '),
    date: new Date(match.playedOn + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    partner: team.filter(p => p.id !== match.me).map(p => p.name).join(' / '),
    opponents: opponents.map(p => p.name).join(' / '),
    scores: scoredGames(match), result: result(match), champion: match.stage === 'final' && matchWon(match),
  };
}

export type ShareCard = ReturnType<typeof playerCard> | NonNullable<ReturnType<typeof matchCard>>;
const NIGHT = '#06140D', CHALK = '#F1F4EA', BALL = '#D9F24A', SEA = '#76E0D0', TIDE = '#7EAEF2', GOLD = '#E8C35A';
const SUBTLE = '#A9C1B2', LINE = '#365244';
const WIDTH = 540, PAD = 36, CONTENT = WIDTH - PAD * 2;

async function drawPhoto(ctx: CanvasRenderingContext2D, url: string, height: number) {
  const photo = new Image();
  photo.crossOrigin = 'anonymous';
  photo.src = url;
  try { await photo.decode(); } catch { return; }
  const width = 380;
  const scale = Math.max(width / photo.width, height / photo.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(WIDTH - width, 0, width, height);
  ctx.clip();
  ctx.drawImage(photo, WIDTH - width + (width - photo.width * scale) / 2, 0, photo.width * scale, photo.height * scale);
  const shade = ctx.createLinearGradient(WIDTH - width, 0, WIDTH, 0);
  shade.addColorStop(0, NIGHT);
  shade.addColorStop(1, '#06140D42');
  ctx.fillStyle = shade;
  ctx.fillRect(WIDTH - width, 0, width, height);
  const fade = ctx.createLinearGradient(0, height * .25, 0, height);
  fade.addColorStop(0, '#06140D00');
  fade.addColorStop(1, NIGHT);
  ctx.fillStyle = fade;
  ctx.fillRect(WIDTH - width, 0, width, height);
  ctx.restore();
}

export async function renderCardPng(card: ShareCard, size: CardSize): Promise<Blob> {
  await Promise.all([document.fonts?.load('800 44px Archivo'), document.fonts?.load('700 18px "DM Sans"')]);
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = POSTER_SIZES[size];
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is unavailable in this browser.');
  const height = canvas.height / 2;
  ctx.scale(2, 2);
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, WIDTH, height);
  if (card.kind === 'player' && card.photoUrl) await drawPhoto(ctx, card.photoUrl, height * .54);

  function write(text: string, y: number, {
    size = 20, color = CHALK, display = false, maxLines = 1, x = PAD, width = CONTENT,
  } = {}) {
    if (!ctx) return y;
    ctx.font = `800 ${size}px ${display ? 'Archivo, sans-serif' : '"DM Sans", sans-serif'}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    const lines = posterLines(text, value => ctx.measureText(value).width, width);
    const visible = lines.slice(0, maxLines);
    if (lines.length > visible.length) {
      let tail = visible[visible.length - 1];
      while (tail && ctx.measureText(tail + '…').width > width) tail = tail.slice(0, -1);
      visible[visible.length - 1] = tail + '…';
    }
    for (const line of visible) { ctx.fillText(line, x, y); y += size * 1.14; }
    return y;
  }

  function rule(y: number) {
    if (!ctx) return;
    ctx.fillStyle = LINE;
    ctx.fillRect(PAD, y, CONTENT, 1);
  }

  ctx.save();
  ctx.translate(PAD - 5, 22);
  ctx.scale(.54, .54);
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.strokeStyle = CHALK;
  ctx.stroke(new Path2D(COURT_Q));
  ctx.fillStyle = BALL;
  ctx.fillRect(28, 48, 44, 3);
  ctx.beginPath();
  ctx.arc(83, 83, 12.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  write('RallyQ', 38, { x: 96, color: BALL, display: true, size: 24 });
  rule(height - 64);
  write(SIGN_OFF, height - 48, { size: 16, color: SUBTLE });

  const stretch = size === 'Story 9:16' ? 1.35 : 1;
  let y = 100 * stretch;
  if (card.kind === 'match') {
    y = write(card.event, y, { size: 45, display: true, maxLines: 2 });
    y = write(card.round, y + 8, { size: 18, color: SUBTLE, maxLines: 2 });
    y = write([card.name, card.date].filter(Boolean).join(' · '), y + 10, { size: 18, maxLines: 2 });
    rule(y + 18);
    y = write(card.result, y + 38, { size: 52, display: true, color: card.champion ? GOLD : BALL });
    y = write(card.scores.join(' · '), y + 3, { size: 38, display: true, maxLines: 2 });
    if (card.partner) y = write(`With ${card.partner}`, y + 22, { size: 19, maxLines: 2 });
    write(`Against ${card.opponents}`, y + 10, { size: 19, maxLines: 2 });
  } else {
    y = write(card.name, y, { size: 52, display: true, maxLines: 2 });
    if (card.club) y = write(card.club, y + 5, { size: 21, color: SUBTLE, maxLines: 2 });
    for (const rating of card.ratings) y = write(rating, y + 5, { size: 18, color: CHALK });
    y += 20 * stretch;
    rule(y);
    write('Official record', y + 15, { size: 16, color: SUBTLE });
    write('All-format win rate', y + 15, { size: 16, color: SUBTLE, x: 298, width: 206 });
    write(`${card.wins}W · ${card.losses}L`, y + 37, { size: 35, display: true, color: BALL, width: 250 });
    write(card.rate === undefined ? '—' : `${card.rate}%`, y + 37, { size: 35, display: true, x: 298, width: 206 });
    y += 88 * stretch;
    if (card.finish) y = write(`Best finish · ${card.finish}`, y + 3, { size: 20, color: card.finish === 'Champion' ? GOLD : CHALK });
    if (card.latest) {
      y = write(card.latest.event, y + 18 * stretch, { size: 27, display: true, maxLines: 1 });
      y = write(card.latest.detail, y + 5, { size: 19, color: SUBTLE });
    }
    if (card.dna.length) {
      y = write(`Match DNA · ${card.dnaEvent}`, y + 18 * stretch, { size: 14, color: SUBTLE });
      const step = CONTENT / card.dna.length;
      card.dna.forEach((side, i) => {
        ctx.fillStyle = side === 'A' ? SEA : TIDE;
        ctx.fillRect(PAD + i * step, y + (side === 'A' ? 6 : 15), step - 3, 12);
      });
    }
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('Could not create the PNG.'));
  }, 'image/png'));
}
