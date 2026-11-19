import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LivingQ } from './LivingQ';
import { Dna } from './Dna';
import { ralliesOf } from './rallies';
import type { Rally } from './rallies';

function points(winners: string) {
  return ralliesOf({ points: winners, a: [...winners].filter(w => w === 'A').length, b: [...winners].filter(w => w === 'B').length }, true);
}

const mixed: Rally[] = [
  { n: 1, winner: 'A', outcome: 'point', serverTeam: 'A', serverNo: 2, before: '0-0-2', after: '1-0-2' },
  { n: 2, winner: 'B', outcome: 'side_out', serverTeam: 'A', serverNo: 2, before: '1-0-2', after: '0-1-1' },
  { n: 3, winner: 'A', outcome: 'second_server', serverTeam: 'B', serverNo: 1, before: '0-1-1', after: '0-1-2' },
  { n: 4, winner: 'B', outcome: 'point', serverTeam: 'B', serverNo: 2, before: '0-1-2', after: '1-1-2' },
];
const titles = [
  'Rally 1 · point · 0-0-2 → 1-0-2',
  'Rally 2 · side-out · 1-0-2 → 0-1-1',
  'Rally 3 · second server · 0-1-1 → 0-1-2',
  'Rally 4 · point · 0-1-2 → 1-1-2',
];

describe('Living Q', () => {
  it('renders the prototype court path and ball without inventing rallies or a count', () => {
    const { container, rerender } = render(<LivingQ rallies={[]} confirmed={false} winner="A" />);
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 100 100');
    const path = container.querySelector('path');
    expect(path).toHaveAttribute('d', 'M62 86H32A18 18 0 0 1 14 68V32A18 18 0 0 1 32 14H68A18 18 0 0 1 86 32V62');
    expect(path).toHaveAttribute('fill', 'none');
    expect(path).toHaveAttribute('stroke', 'var(--ink)');
    expect(path).toHaveAttribute('stroke-width', '3');
    expect(path).toHaveAttribute('stroke-opacity', '0.3');
    expect(container.querySelectorAll('line')).toHaveLength(0);
    expect(container.querySelector('circle')).toHaveAttribute('cx', '83');
    expect(container.querySelector('circle')).toHaveAttribute('cy', '83');
    expect(container.querySelector('circle')).toHaveAttribute('r', '6');
    expect(container.querySelector('circle')).toHaveAttribute('fill', 'var(--ball)');
    expect(container.textContent).toBe('');
    rerender(<LivingQ rallies={[]} confirmed winner="B" />);
    expect(path).toHaveAttribute('stroke-opacity', '0.9');
  });

  it.each([
    ['A', 'point', '96.0'], ['B', 'point', '76.0'],
    ['A', 'side_out', '90.5'], ['B', 'side_out', '81.5'],
    ['A', 'second_server', '90.5'], ['B', 'second_server', '81.5'],
  ] as const)('draws %s %s in the correct direction and length', (winner, outcome, y2) => {
    const { container } = render(<LivingQ rallies={[{ ...mixed[0], winner, outcome }]} />);
    const line = container.querySelector('line');
    expect(line).toHaveAttribute('x1', '58.6');
    expect(line).toHaveAttribute('y1', '86.0');
    expect(line).toHaveAttribute('x2', '58.6');
    expect(line).toHaveAttribute('y2', y2);
    expect(line).toHaveAttribute('stroke', winner === 'A' ? 'var(--sea)' : 'var(--tide)');
    expect(line).toHaveAttribute('stroke-width', '3.2');
    expect(line).toHaveAttribute('stroke-linecap', 'round');
  });

  it('preserves prototype arc coordinates and distributes long games over the full path', () => {
    const { container, rerender } = render(<LivingQ rallies={points('A'.repeat(32))} />);
    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(32);
    // Coordinates sampled directly from the approved prototype's qAt/drawQ.
    for (const [i, x1, y1, x2, y2] of [
      [8, '14.0', '68.7', '4.0', '69.2'],
      [16, '21.9', '17.1', '15.9', '9.1'],
      [24, '75.2', '15.5', '79.5', '6.5'],
      [31, '86.0', '58.6', '96.0', '58.6'],
    ] as const) {
      expect(lines[i]).toHaveAttribute('x1', x1);
      expect(lines[i]).toHaveAttribute('y1', y1);
      expect(lines[i]).toHaveAttribute('x2', x2);
      expect(lines[i]).toHaveAttribute('y2', y2);
    }
    rerender(<LivingQ rallies={points('A'.repeat(40))} />);
    expect(container.querySelectorAll('line')).toHaveLength(40);
    expect(container.querySelector('line')).toHaveAttribute('x1', '59.3');
    expect(container.querySelectorAll('line')[39]).toHaveAttribute('y1', '59.3');
  });

  it('renders rally titles and moves the newest stroke class after undo', () => {
    const { container, rerender } = render(<LivingQ rallies={mixed} />);
    expect([...container.querySelectorAll('line title')].map(t => t.textContent)).toEqual(titles);
    expect(container.querySelectorAll('line.lqs')).toHaveLength(1);
    expect(container.querySelector('line.lqs')).toBe(container.querySelectorAll('line')[3]);
    rerender(<LivingQ rallies={mixed.slice(0, 3)} />);
    expect(container.querySelectorAll('line')).toHaveLength(3);
    expect(container.querySelectorAll('line.lqs')).toHaveLength(1);
    expect(container.querySelector('line.lqs title')).toHaveTextContent(titles[2]);
  });
});

describe('Match DNA', () => {
  it('renders one mark per rally with team, non-scoring and last-rally classes and titles', () => {
    const { container } = render(<Dna rallies={mixed} />);
    const dna = container.querySelector('.dna');
    const bars = container.querySelectorAll('i');
    expect(dna?.children).toHaveLength(4);
    expect([...bars].map(b => b.className)).toEqual(['a', 'b so', 'a so', 'b turn now']);
    expect([...bars].map(b => b.title)).toEqual(titles);
  });

  it.each(['BAAABAAA', 'ABBBABBB'])('highlights only the current run of three points for %s', winners => {
    const { container, rerender } = render(<Dna rallies={points(winners)} />);
    const bars = container.querySelectorAll('i');
    expect(container.querySelectorAll('.run')).toHaveLength(3);
    for (let i = 0; i < bars.length; i++) expect(bars[i].classList.contains('run')).toBe(i >= bars.length - 3);
    expect(bars[bars.length - 1]).toHaveClass('run', 'turn', 'now');
    expect(container.querySelectorAll('.turn')).toHaveLength(3);
    rerender(<Dna rallies={points(winners.slice(0, -1))} />);
    expect(container.querySelectorAll('.run')).toHaveLength(0);
    expect(container.querySelectorAll('.now')).toHaveLength(1);
  });

  it.each(['side_out', 'second_server'] as const)('ends the current run at a %s', outcome => {
    const run = points('AAA');
    const interruption: Rally = { ...mixed[1], n: 4, outcome };
    const { container, rerender } = render(<Dna rallies={[...run, interruption]} />);
    expect(container.querySelectorAll('.run')).toHaveLength(0);
    expect(container.querySelectorAll('.turn')).toHaveLength(0);
    expect(container.querySelector('.now')).toHaveClass('so');
    rerender(<Dna rallies={[...run, interruption, { ...mixed[0], n: 5 }, { ...mixed[0], n: 6 }]} />);
    expect(container.querySelectorAll('.run')).toHaveLength(0);
  });

  it('renders empty history and the exact rally number and score title supplied by the record', () => {
    const { container, rerender } = render(<Dna rallies={[]} />);
    expect(container.querySelector('.dna')).toBeEmptyDOMElement();
    const rally: Rally = { ...mixed[0], n: 7, before: '6-5', after: '7-5' };
    rerender(<><LivingQ rallies={[rally]} /><Dna rallies={[rally]} /></>);
    expect(container.querySelector('line title')).toHaveTextContent('Rally 7 · point · 6-5 → 7-5');
    expect(container.querySelector('i')).toHaveAttribute('title', 'Rally 7 · point · 6-5 → 7-5');
  });
});
