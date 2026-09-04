/**
 * Graphiques — portés fidèlement du prototype Figma Make (docs/Interface application gestion
 * PME/src/App.tsx : SalesAreaChart, CashFlowRing, StockHealthChart, TreasuryMethodChart), mais
 * paramétrés par des props au lieu de tableaux mock en dur, pour recevoir les vraies données.
 */
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  YAxis, CartesianGrid,
} from 'recharts';
import { formaterFCFA } from '@kombi/shared';

export function SalesAreaChart({ data, days }: { data: number[]; days: string[] }) {
  const chartData = data.map((value, i) => ({ day: days[i], value }));
  return (
    <ResponsiveContainer width="100%" height={148}>
      <AreaChart data={chartData} margin={{ top: 16, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b4e033" stopOpacity={0.28} />
            <stop offset="90%" stopColor="#b4e033" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#2a4230" strokeDasharray="3 3" strokeWidth={0.8} />
        <XAxis dataKey="day" tick={{ fill: '#4a6b4a', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ stroke: '#b4e033', strokeWidth: 1, strokeDasharray: '4 4' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="bg-[#b4e033] rounded-lg px-3 py-1.5 shadow-lg">
                <p className="text-[#0e1c0f] text-xs font-bold font-mono">{formaterFCFA(payload[0]!.value as number)}</p>
                <p className="text-[#0e1c0f]/70 text-[10px]">{label}</p>
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="value" stroke="#b4e033" strokeWidth={2.5}
          fill="url(#salesGrad)"
          dot={(props: { cx?: number; cy?: number; index?: number }) => {
            const { cx = 0, cy = 0, index = 0 } = props;
            const today = index === data.length - 1;
            return <circle key={index} cx={cx} cy={cy} r={today ? 5 : 3.5} fill={today ? '#b4e033' : '#162419'} stroke="#b4e033" strokeWidth={2} />;
          }}
          activeDot={{ r: 6, fill: '#b4e033', stroke: '#0e1c0f', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CashFlowRing({ totalIn, totalOut }: { totalIn: number; totalOut: number }) {
  const net = totalIn - totalOut;
  const data = [
    { name: 'Entrées', value: totalIn, color: '#b4e033' },
    { name: 'Sorties', value: totalOut, color: '#f87171' },
  ];
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-wide self-start">Flux de tréso.</p>
      <div className="relative">
        <PieChart width={120} height={120}>
          <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={54}
            startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0} paddingAngle={2}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} opacity={0.85} />)}
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-mono text-[11px] font-bold leading-tight ${net >= 0 ? 'text-[#b4e033]' : 'text-[#f87171]'}`}>
            {net >= 0 ? '+' : '−'}{Math.round(Math.abs(net) / 1000)}k
          </span>
          <span className="text-[#4a6b4a] text-[9px]">net</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 w-full">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-[#4a6b4a] text-xs">{d.name}</span>
            </div>
            <span className="text-[#edf5ea] text-xs font-mono font-medium">{Math.round(d.value / 1000)}k F</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StockHealthChart({ ok, faible, critique, rupture }: {
  ok: number; faible: number; critique: number; rupture: number;
}) {
  const data = [
    { label: 'OK', value: ok, color: '#b4e033' },
    { label: 'Faible', value: faible, color: '#fbbf24' },
    { label: 'Critique', value: critique, color: '#f87171' },
    { label: 'Rupture', value: rupture, color: '#7f1d1d' },
  ].filter((d) => d.value > 0);
  return (
    <div className="flex items-center gap-3">
      <PieChart width={72} height={72}>
        <Pie data={data} cx="50%" cy="50%" innerRadius={22} outerRadius={33}
          startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0} paddingAngle={2}>
          {data.map((d, i) => <Cell key={i} fill={d.color} opacity={0.85} />)}
        </Pie>
      </PieChart>
      <div className="flex flex-col gap-1">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-[#4a6b4a] text-xs">{d.label}</span>
            <span className="text-[#edf5ea] text-xs font-semibold ml-1">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TreasuryMethodChart({ data }: { data: { method: string; value: number }[] }) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <ResponsiveContainer width="100%" height={100}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="#2a4230" strokeDasharray="3 3" strokeWidth={0.8} />
        <XAxis type="number" tick={false} axisLine={false} tickLine={false} />
        <YAxis dataKey="method" type="category" tick={{ fill: '#6b9165', fontSize: 10 }} axisLine={false} tickLine={false} width={72} />
        <Tooltip
          cursor={{ fill: '#b4e033', fillOpacity: 0.05 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="bg-[#162419] border border-[#2a4230] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#b4e033] shadow">
                {formaterFCFA(payload[0]!.value as number)}
              </div>
            );
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={12}>
          {sorted.map((_, i) => <Cell key={i} fill="#b4e033" opacity={0.7 - i * 0.12} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DashboardIllustration() {
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="62" width="9" height="22" rx="3" fill="#b4e033" opacity="0.25" />
      <rect x="18" y="50" width="9" height="34" rx="3" fill="#b4e033" opacity="0.4" />
      <rect x="30" y="40" width="9" height="44" rx="3" fill="#b4e033" opacity="0.55" />
      <rect x="42" y="28" width="9" height="56" rx="3" fill="#b4e033" opacity="0.75" />
      <path d="M10 68 L22 56 L34 46 L46 34" stroke="#b4e033" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      <rect x="62" y="44" width="48" height="36" rx="3" fill="#1e3222" />
      <path d="M58 44 L86 26 L114 44" fill="#2a4230" />
      <path d="M58 44 L86 26 L114 44" stroke="#b4e033" strokeWidth="1.5" strokeLinejoin="round" opacity="0.8" />
      <rect x="74" y="56" width="10" height="10" rx="1.5" fill="#b4e033" opacity="0.3" />
      <rect x="88" y="56" width="10" height="10" rx="1.5" fill="#b4e033" opacity="0.3" />
      <rect x="79" y="66" width="14" height="14" rx="1.5" fill="#0e1c0f" />
      <circle cx="55" cy="20" r="2" fill="#b4e033" opacity="0.5" />
      <circle cx="68" cy="12" r="1.5" fill="#b4e033" opacity="0.35" />
      <circle cx="100" cy="16" r="1.5" fill="#b4e033" opacity="0.4" />
      <path d="M114 38 Q118 28 112 20 M114 38 Q120 30 118 22 M114 38 Q108 28 110 18" stroke="#b4e033" strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
      <line x1="114" y1="44" x2="114" y2="38" stroke="#b4e033" strokeWidth="1.2" opacity="0.45" />
    </svg>
  );
}

export function EmptyCartIllustration() {
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden="true">
        <circle cx="44" cy="44" r="42" fill="#1e3222" opacity="0.7" />
        <path d="M24 32h40l-5 24H29z" stroke="#b4e033" strokeWidth="2" strokeLinejoin="round" fill="#b4e033" fillOpacity="0.08" />
        <path d="M32 32c0-6.6 5.4-12 12-12s12 5.4 12 12" stroke="#b4e033" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="33" cy="60" r="3" fill="#b4e033" opacity="0.6" />
        <circle cx="55" cy="60" r="3" fill="#b4e033" opacity="0.6" />
        <line x1="44" y1="39" x2="44" y2="49" stroke="#b4e033" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <line x1="39" y1="44" x2="49" y2="44" stroke="#b4e033" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      </svg>
      <div className="text-center">
        <p className="text-[#edf5ea] font-semibold text-sm">Panier vide</p>
        <p className="text-[#4a6b4a] text-xs mt-1">Sélectionnez un produit pour commencer</p>
      </div>
    </div>
  );
}

/** Répartition des dépenses par catégorie (donut + légende), écran Dépenses > Analyse. */
export function DepensesCategorieDonut({ data }: { data: { libelle: string; total: number }[] }) {
  const palette = ['#b4e033', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#4ade80', '#f97316', '#6b9165'];
  const top = [...data].sort((a, b) => b.total - a.total).slice(0, 8).map((d, i) => ({ ...d, color: palette[i % palette.length]! }));
  return (
    <div className="flex items-center gap-4">
      <PieChart width={96} height={96}>
        <Pie data={top} cx="50%" cy="50%" innerRadius={30} outerRadius={46}
          startAngle={90} endAngle={-270} dataKey="total" strokeWidth={0} paddingAngle={2}>
          {top.map((d, i) => <Cell key={i} fill={d.color} opacity={0.85} />)}
        </Pie>
      </PieChart>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        {top.map((d) => (
          <div key={d.libelle} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-[#4a6b4a] text-xs truncate">{d.libelle}</span>
            </div>
            <span className="text-[#edf5ea] text-xs font-mono font-medium shrink-0">{formaterFCFA(d.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Évolution mensuelle d'une valeur (dépenses, CA…) sur plusieurs mois — barres verticales. */
export function EvolutionMensuelleChart({ data }: { data: { moisLabel: string; total: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="#2a4230" strokeDasharray="3 3" strokeWidth={0.8} />
        <XAxis dataKey="moisLabel" tick={{ fill: '#4a6b4a', fontSize: 10, fontWeight: 500 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: '#b4e033', fillOpacity: 0.05 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="bg-[#b4e033] rounded-lg px-3 py-1.5 shadow-lg">
                <p className="text-[#0e1c0f] text-xs font-bold font-mono">{formaterFCFA(payload[0]!.value as number)}</p>
                <p className="text-[#0e1c0f]/70 text-[10px]">{label}</p>
              </div>
            );
          }}
        />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={28} fill="#b4e033" fillOpacity={0.75} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export const MODE_PAIEMENT_LABEL: Record<string, string> = {
  especes: 'Espèces', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', virement: 'Virement', cheque: 'Chèque', autre: 'Autre',
};
export const MODE_PAIEMENT_COULEUR: Record<string, string> = {
  especes: 'text-[#b4e033]', orange_money: 'text-[#f97316]', mtn_momo: 'text-[#fde047]', virement: 'text-[#60a5fa]', cheque: 'text-[#a78bfa]', autre: 'text-[#6b9165]',
};
