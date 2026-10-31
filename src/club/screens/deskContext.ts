import { createContext, useContext } from 'react';
import type { ClubBackend } from '../backend';
import { backend } from '../index';

/** Set inside a desk link (#/desk/<token>): the screens below use the desk's backend instead of a signed-in account. */
export interface DeskSession { b: ClubBackend; token: string; leave: () => void }
export const DeskCtx = createContext<DeskSession | null>(null);

export function useDesk(): DeskSession | null { return useContext(DeskCtx); }
/** The backend a club screen should use: the desk's, inside a desk link, else the signed-in (or demo) one. */
export function useClubBackend(): ClubBackend | null { const d = useContext(DeskCtx); return d ? d.b : backend(); }
