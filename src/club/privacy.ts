/**
 * DPDP Act 2023 notice for RallyQ. Change NOTICE_VERSION (a date) whenever the wording below changes:
 * every consent is stored with the version the person saw.
 * Owner to confirm the grievance contact and the wording before this goes live.
 */
export const NOTICE_VERSION = '2026-11-27';

export const GRIEVANCE = { role: 'Grievance Officer, RallyQ', email: 'hello@rallyq.in', replyDays: 7, actDays: 30 };

export type ConsentPurpose = 'entry' | 'account';

export interface NoticeSection { title: string; points: string[] }

export const NOTICE: NoticeSection[] = [
  {
    title: 'What we collect and why',
    points: [
      'Your email, to sign you in with a one-time code and send your results.',
      'For a tournament entry: name, phone (WhatsApp), age, gender and DUPR rating, so the organiser can check you fit the event, contact you and run the draw.',
      'Your scores and matches, so they show on live scores, results and your Player Studio.',
      'Anything you add in Player Studio (diary, goals, photo). Only you see it.',
    ],
  },
  {
    title: 'Who sees it',
    points: [
      'The organiser of your tournament sees your phone, email and age. Nobody else does.',
      'Everyone can see your name, scores and DUPR rating on live scores and results.',
      'We never sell your data or use it for ads. Payments go straight to the club; RallyQ never holds money.',
    ],
  },
  {
    title: 'How long we keep it',
    points: [
      'Until you ask us to delete it. Results stay under your name only if you keep your account; if you delete it, your phone, email and age are removed and only your name stays on matches already played.',
    ],
  },
  {
    title: 'Your rights',
    points: [
      'See and download your data, correct it, withdraw your consent, or delete your account, from Player Studio → Profile.',
      'Withdrawing consent stops new use. It does not undo an entry you already sent; withdraw the entry from My entries.',
      'Players must be 18 or over. We do not take entries for anyone younger.',
    ],
  },
];

/** True when an entry may be sent: the person ticked the notice box. */
export function consentProblem(agreed: boolean): string | null {
  return agreed ? null : 'Tick the box to agree to the privacy notice';
}
