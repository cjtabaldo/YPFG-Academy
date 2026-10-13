// Line icons drawn in code. Every icon used on a control gets a text label
// from the control itself (aria-label or visible text).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 24): SVGProps<SVGSVGElement> => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false });
const make = (d: string | string[]) => ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>{(Array.isArray(d) ? d : [d]).map((x, i) => <path key={i} d={x} />)}</svg>
);

export const Check = make('M4 12.5l5 5L20 6.5');
export const X = make(['M6 6l12 12', 'M18 6L6 18']);
export const Flame = make('M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1.2 2.6 2.5 3-.5-3 0-5.5 0-8z');
export const Heart = make('M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z');
export const HeartFill = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" fill="currentColor" /></svg>;
export const Bolt = make('M13 2L4 14h7l-1 8 9-12h-7l1-8z');
export const Home = make(['M3 11l9-7 9 7', 'M5 10v10h14V10']);
export const Map = make(['M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z', 'M9 4v14', 'M15 6v14']);
export const Book = make(['M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z', 'M4 19a2 2 0 012-2h13']);
export const Chart = make(['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2']);
export const Gear = make(['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z']);
export const Close = X;
export const Back = make('M15 18l-6-6 6-6');
export const Next = make('M9 18l6-6-6-6');
export const Lock = make(['M6 11h12v10H6z', 'M8 11V7a4 4 0 018 0v4']);
export const Star = make('M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z');
export const Flag = make(['M5 21V4', 'M5 4h11l-2 4 2 4H5']);
export const Speaker = make(['M4 9v6h4l5 4V5L8 9H4z', 'M16 9a4 4 0 010 6', 'M18.5 6.5a7.5 7.5 0 010 11']);
export const Play = make('M7 4l13 8-13 8V4z');
export const Pause = make(['M8 5v14', 'M16 5v14']);
export const Calc = make(['M6 3h12v18H6z', 'M9 7h6', 'M9 11h.01', 'M12 11h.01', 'M15 11h.01', 'M9 15h.01', 'M12 15h.01', 'M15 15h.01', 'M9 18h6']);
export const Trophy = make(['M8 4h8v5a4 4 0 01-8 0V4z', 'M8 6H4a3 3 0 003 4', 'M16 6h4a3 3 0 01-3 4', 'M12 13v4', 'M8 21h8', 'M9 17h6']);
export const Users = make(['M9 11a4 4 0 100-8 4 4 0 000 8z', 'M2 21a7 7 0 0114 0', 'M17 3a4 4 0 010 8', 'M22 21a7 7 0 00-4-6.3']);
export const Search = make(['M11 18a7 7 0 100-14 7 7 0 000 14z', 'M21 21l-4.3-4.3']);
export const Refresh = make(['M20 11a8 8 0 10-2.3 5.7', 'M20 4v7h-7']);
export const Download = make(['M12 3v12', 'M7 10l5 5 5-5', 'M4 21h16']);
export const Shield = make(['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z']);
export const Clock = make(['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7v5l3 2']);
export const Info = make(['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 11v6', 'M12 7.5h.01']);
export const Snow = make(['M12 2v20', 'M4 6l16 12', 'M20 6L4 18']);
export const Edit = make(['M4 20h4L19 9l-4-4L4 16v4z', 'M14 6l4 4']);
