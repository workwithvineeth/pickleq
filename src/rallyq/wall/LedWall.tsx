import { memo, useEffect, useState } from 'react';
import { usePublicScores } from '../../club/screens/usePublicScores';
import { useCourtStreams } from '../live/useStreams';
import { wallCells, wallEmbedUrl, wallOptions } from './wallPlan';
import './wall.css';

const Frame = memo(function Frame({ videoId, court }: { videoId: string; court: number }) {
  return <iframe title={`Court ${court} video`} src={wallEmbedUrl(videoId, window.location.origin)}
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />;
});

/**
 * LED wall: the four court streams in a 2×2 grid, each quarter 16:9 and as large as the screen allows, with no
 * scrolling and no buttons. `#/wall/<event>` uses the streams shown to fans; `?v=id1,id2,id3,id4` sets them directly
 * (works before the event is public). `?scores=on` adds a score strip under each video.
 */
export function LedWall({ slug = '' }: { slug?: string }) {
  const [options, setOptions] = useState(() => wallOptions(window.location.href));
  useEffect(() => { const f = () => setOptions(wallOptions(window.location.href)); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const { streams } = useCourtStreams(slug);
  const scores = usePublicScores(options.scores ? slug : '');
  const cells = wallCells(options, streams, scores.data);
  useEffect(() => { const t = document.title; document.title = 'RallyQ · LED wall'; return () => { document.title = t; }; }, []);
  return (
    <main className="led-wall" aria-label="LED wall, 4 courts">
      {cells.map(cell => (
        <section key={cell.court} className="led-cell" aria-label={`Court ${cell.court}`}>
          <div className="led-box">
            {cell.videoId ? <Frame key={cell.videoId} videoId={cell.videoId} court={cell.court} /> : <p className="led-empty">Court {cell.court} · no stream yet</p>}
            <span className="led-court">Court {cell.court}</span>
            {cell.score && <div className="led-score" role="group" aria-label={`Court ${cell.court} score: ${cell.score.a} ${cell.score.sa}, ${cell.score.b} ${cell.score.sb}`}>
              <span className="led-name">{cell.score.a}</span><b>{cell.score.sa}</b><i aria-hidden="true">–</i><b>{cell.score.sb}</b><span className="led-name b">{cell.score.b}</span>
            </div>}
          </div>
        </section>
      ))}
    </main>
  );
}
