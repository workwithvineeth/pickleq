import { useState, type ReactNode } from 'react';
import { Segmented } from '../../components/Controls';

/**
 * The one "+ Add" button on the Entries screen (Phase 3). Adding a person or team, importing a sheet,
 * a late entry and a walk-in player are the same panel in different modes.
 */
export function AddPanel<T extends string>({ modes, start, children }: {
  modes: { value: T; label: string }[];
  start?: T;
  children: (mode: T, api: { setMode: (m: T) => void; close: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<T>(start ?? modes[0].value);
  return (
    <section className="card section pq-add" aria-label="Add to entries">
      <button type="button" className={`btn ${open ? 'btn-outline' : 'btn-primary'}`} aria-expanded={open} onClick={() => setOpen((x) => !x)}>{open ? 'Close' : '+ Add'}</button>
      {open && modes.length > 1 && <Segmented label="What are you adding?" value={mode} options={modes} onChange={setMode} />}
      {open && children(mode, { setMode, close: () => setOpen(false) })}
    </section>
  );
}
