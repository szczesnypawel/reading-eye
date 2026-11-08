/**
 * The bestiary: kinds of readers. Only the skilled adult is fitted to data (Provo). The others
 * are illustrative changes to it, each named after the mechanism the literature points at.
 * They are not fits; treat them as "what if" settings.
 */
import { FITTED } from "./fitted.ts";
import type { Params } from "./params.ts";

export interface ReaderKind {
  id: string;
  name: string;
  fitted: boolean;
  note: string;
  params: Params;
}

const tweak = (f: (p: Params) => Partial<Params>): Params => ({ ...FITTED, ...f(FITTED) });

export const READERS: ReaderKind[] = [
  {
    id: "skilled",
    name: "Skilled adult",
    fitted: true,
    note: "Fitted to 40 Provo passages read by 84 adults.",
    params: { ...FITTED },
  },
  {
    id: "child",
    name: "Child",
    fitted: false,
    note: "Slower word recognition with a bigger frequency effect; the main difference children show in E-Z Reader fits.",
    params: tweak((p) => ({ alpha1: p.alpha1 * 1.6, alpha2: p.alpha2 * 1.4, M1: p.M1 + 20 })),
  },
  {
    id: "dyslexic",
    name: "Dyslexic reader",
    fitted: false,
    note: "Much slower word recognition, steeper acuity falloff (crowding), noisier saccades.",
    params: tweak((p) => ({ alpha1: p.alpha1 * 1.8, eps: p.eps + 0.08, eta2: p.eta2 * 1.5, lambda: p.lambda * 1.5 })),
  },
  {
    id: "l2",
    name: "Second-language reader",
    fitted: false,
    note: "Rare words cost much more, and predicting the next word helps less.",
    params: tweak((p) => ({ alpha1: p.alpha1 * 1.3, alpha2: p.alpha2 * 1.6, alpha3: p.alpha3 * 0.5 })),
  },
  {
    id: "skimmer",
    name: "Skimmer",
    fitted: false,
    note: "Settles for a quick familiarity check, plans saccades faster, integrates less well.",
    params: tweak((p) => ({ alpha1: p.alpha1 * 0.6, delta: p.delta * 0.6, M1: p.M1 * 0.85, pF: Math.min(0.4, p.pF * 2 + 0.02) })),
  },
  {
    id: "scotoma",
    name: "Blind centre",
    fitted: false,
    note: "Macular degeneration: the central 2.5 characters are near-blind, so words must be read off-centre.",
    params: tweak(() => ({ scotoma: 2.5 })),
  },
  {
    id: "wander",
    name: "Mind wandering",
    fitted: false,
    note: "The eyes keep moving on a timer while the mind is elsewhere; words go by unread.",
    params: tweak(() => ({ mindless: 0.85 })),
  },
];
