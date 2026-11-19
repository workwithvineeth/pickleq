import { useEffect } from 'react';
import { track } from '../../monitoring/monitoring';
import { useOnline, usePhoneScores, useTroubleFor } from '../useConnection';

const scores = (n: number) => `${n} score${n === 1 ? '' : 's'}`;

/**
 * Tells a referee, after 5 seconds, that the phone has no signal or has scores it hasn't been able to send, and how many
 * are saved on this phone. Also says when the desk has to step in. Renders nothing while all is well.
 */
export function OfflineBanner({ hideBlocked = false }: { hideBlocked?: boolean }) {
  const online = useOnline();
  const { unsent, blocked } = usePhoneScores();
  const trouble = useTroubleFor(!online || unsent > 0);
  useEffect(() => { if (trouble) track(online ? 'scores_not_sent' : 'went_offline'); }, [trouble, online]);
  return (
    <>
      {trouble && (
        <div role="status" aria-label="Connection" className="msg msg-bad pq-offline-banner">
          <b>{online ? 'Scores not sent yet.' : 'No connection.'}</b>{' '}
          {unsent > 0
            ? `${scores(unsent)} saved on this phone. ${online ? 'Trying again.' : 'They send by themselves when the signal is back.'}`
            : 'Keep scoring: it is saved on this phone and sent when the signal is back.'}
        </div>
      )}
      {!hideBlocked && blocked > 0 && <div role="alert" className="msg msg-bad pq-offline-banner"><b>{scores(blocked)} could not be sent.</b> Show this phone to the desk.</div>}
    </>
  );
}
