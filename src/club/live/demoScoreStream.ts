import { readLiveScoreMessage, type LiveScoreMessage, type LiveScoreStream } from './scoreStream';

const listeners = new Map<string, Set<(message: LiveScoreMessage) => void>>();
let channel: BroadcastChannel | undefined;

function openChannel(): BroadcastChannel | undefined {
  try { return typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('rallyq-live'); }
  catch { return undefined; }
}

export const demoScoreStream: LiveScoreStream = {
  subscribe(slug, onMessage, onStatus) {
    const receive = (message: LiveScoreMessage) => onMessage(message);
    const group = listeners.get(slug) ?? new Set();
    group.add(receive);
    listeners.set(slug, group);
    if (!channel) {
      channel = openChannel();
      channel?.addEventListener('message', ({ data }) => {
        if (typeof data?.slug !== 'string') return;
        const message = readLiveScoreMessage(data.message);
        if (message) listeners.get(data.slug)?.forEach(listener => listener(message));
      });
    }
    onStatus('live');
    return () => {
      group.delete(receive);
      if (!group.size && listeners.get(slug) === group) listeners.delete(slug);
      if (!listeners.size) { channel?.close(); channel = undefined; }
    };
  },
};

export function broadcastDemoScore(slug: string, message: LiveScoreMessage) {
  const sender = channel ?? openChannel();
  try { sender?.postMessage({ slug, message }); }
  catch { /* The demo score still saved. */ }
  finally { if (sender !== channel) sender?.close(); }
  listeners.get(slug)?.forEach(listener => listener(message));
}
