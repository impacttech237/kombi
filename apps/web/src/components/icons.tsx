/**
 * Set d'icônes + Avatar — porté à l'identique du prototype Figma Make
 * (docs/Interface application gestion PME/src/App.tsx lignes 172-223). Icônes trait fin
 * (style Feather), aucune librairie externe — ne pas remplacer par une lib d'icônes.
 */
import type { ReactNode } from 'react';

const Ico = ({ ch, cls = 'w-5 h-5', sw = 1.75 }: { ch: ReactNode; cls?: string; sw?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={cls}>{ch}</svg>
);

export const IcoHome = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>} />;
export const IcoCart = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>} />;
export const IcoFile = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>} />;
export const IcoBox = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>} />;
export const IcoWlt = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M16 9h4v6h-4a3 3 0 0 1 0-6z" /></>} />;
export const IcoBell = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>} />;
export const IcoSearch = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>} />;
export const IcoPlus = ({ cls }: { cls?: string }) => <Ico cls={cls} sw={2} ch={<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>} />;
export const IcoAlert = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>} />;
export const IcoUp = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>} />;
export const IcoDn = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>} />;
export const IcoTrend = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>} />;
export const IcoOk = ({ cls }: { cls?: string }) => <Ico cls={cls} sw={2.5} ch={<polyline points="20 6 9 17 4 12" />} />;
export const IcoX = ({ cls }: { cls?: string }) => <Ico cls={cls} sw={2.5} ch={<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>} />;
export const IcoMinus = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<line x1="5" y1="12" x2="19" y2="12" />} />;
export const IcoLayers = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>} />;
export const IcoChevR = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<polyline points="9 18 15 12 9 6" />} />;
export const IcoGrid = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>} />;
export const IcoUser = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>} />;
export const IcoBarChart = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>} />;
export const IcoShare = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></>} />;

// Icônes ajoutées pour les écrans absents du prototype (Commandes, Équipe, Paramètres) — même
// style trait fin (Feather) que le reste du set, aucune n'existait dans le prototype d'origine.
export const IcoClipboard = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>} />;
export const IcoUsers = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>} />;
export const IcoSettings = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>} />;
export const IcoTrendDown = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></>} />;
export const IcoHandCoins = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><circle cx="12" cy="8" r="4" /><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></>} />;
export const IcoLogOut = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>} />;
export const IcoFolder = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />} />;
export const IcoPercent = ({ cls }: { cls?: string }) => <Ico cls={cls} ch={<><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>} />;

const AVATAR_PALETTE: [string, string][] = [
  ['#b4e033', '#0e1c0f'], // lime brand
  ['#fb923c', '#431407'], // orange
  ['#fde047', '#422006'], // amber
  ['#60a5fa', '#0f2d54'], // blue
  ['#c084fc', '#2d0a45'], // purple
  ['#f472b6', '#3b0020'], // pink
  ['#34d399', '#022c22'], // emerald
  ['#38bdf8', '#082532'], // sky
];
function avatarColor(name: string) {
  const idx = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx]!;
}
export function Avatar({ name, size = 'md' }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const [bg, fg] = avatarColor(name);
  const sz = size === 'xs' ? 'w-7 h-7 text-[10px]' : size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-11 h-11 text-sm';
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold shrink-0 select-none`}
      style={{ backgroundColor: bg, color: fg }}>
      {initials}
    </div>
  );
}
