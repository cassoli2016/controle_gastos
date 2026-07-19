/**
 * Ilustração da proposta do app (SVG inline, sem assets externos): gráfico de
 * crescimento + cartão de crédito + moedas, na paleta azul→violeta→ciano da
 * marca. Usada na tela de login (painel desktop e hero mobile).
 */
/**
 * idPrefix precisa ser ÚNICO por instância na página: url(#id) resolve no
 * documento inteiro, e uma instância dentro de um painel hidden "rouba" a
 * referência e apaga os gradientes da instância visível.
 */
export function FinanceIllustration({ className, idPrefix = "gi" }: { className?: string; idPrefix?: string }) {
  return (
    <svg viewBox="0 0 440 340" fill="none" className={className} aria-hidden role="presentation">
      <defs>
        <linearGradient id={`${idPrefix}-card`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-line`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="55%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-coin`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <filter id={`${idPrefix}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Grade de fundo sutil */}
      <g stroke="currentColor" strokeOpacity="0.08">
        {[60, 120, 180, 240, 300].map((y) => (
          <line key={y} x1="20" y1={y} x2="420" y2={y} />
        ))}
        {[90, 180, 270, 360].map((x) => (
          <line key={x} x1={x} y1="30" x2={x} y2="310" />
        ))}
      </g>

      {/* Área + linha de crescimento */}
      <path d="M30 268 L110 236 L180 250 L252 176 L322 148 L410 74 L410 310 L30 310 Z" fill={`url(#${idPrefix}-area)`} />
      <path
        d="M30 268 L110 236 L180 250 L252 176 L322 148 L410 74"
        stroke={`url(#${idPrefix}-line)`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${idPrefix}-glow)`}
      />
      {[
        [110, 236],
        [180, 250],
        [252, 176],
        [322, 148],
      ].map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r="5.5" fill="#0b1220" stroke={`url(#${idPrefix}-line)`} strokeWidth="3" />
      ))}
      {/* Ponto de pico com brilho */}
      <circle cx="410" cy="74" r="8" fill="#22d3ee" filter={`url(#${idPrefix}-glow)`} />
      <circle cx="410" cy="74" r="14" stroke="#22d3ee" strokeOpacity="0.35" strokeWidth="2" fill="none" />

      {/* Cartão de crédito */}
      <g transform="rotate(-9 150 210)">
        <rect x="52" y="150" width="200" height="126" rx="16" fill={`url(#${idPrefix}-card)`} />
        <rect x="52" y="150" width="200" height="126" rx="16" fill="white" fillOpacity="0.06" />
        {/* chip */}
        <rect x="72" y="176" width="34" height="26" rx="6" fill="#fde68a" fillOpacity="0.92" />
        <path d="M72 189 h34 M89 176 v26" stroke="#b45309" strokeWidth="1.4" strokeOpacity="0.6" />
        {/* contactless */}
        <g stroke="white" strokeOpacity="0.85" strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M212 180 a14 14 0 0 1 0 20" />
          <path d="M220 173 a24 24 0 0 1 0 34" />
        </g>
        {/* número e nome */}
        <g fill="white">
          <circle cx="78" cy="228" r="3" fillOpacity="0.9" />
          <circle cx="88" cy="228" r="3" fillOpacity="0.9" />
          <circle cx="98" cy="228" r="3" fillOpacity="0.9" />
          <circle cx="108" cy="228" r="3" fillOpacity="0.9" />
          <circle cx="126" cy="228" r="3" fillOpacity="0.6" />
          <circle cx="136" cy="228" r="3" fillOpacity="0.6" />
          <circle cx="146" cy="228" r="3" fillOpacity="0.6" />
          <circle cx="156" cy="228" r="3" fillOpacity="0.6" />
        </g>
        <text x="72" y="262" fill="white" fillOpacity="0.95" fontSize="15" fontWeight="700" fontFamily="ui-sans-serif, system-ui" letterSpacing="2">
          GRANA
        </text>
      </g>

      {/* Moedas */}
      <g filter={`url(#${idPrefix}-glow)`}>
        <circle cx="330" cy="236" r="26" fill={`url(#${idPrefix}-coin)`} />
        <circle cx="330" cy="236" r="26" stroke="#fff7ed" strokeOpacity="0.55" strokeWidth="2" fill="none" />
        <text x="330" y="245" textAnchor="middle" fontSize="24" fontWeight="800" fill="#78350f" fontFamily="ui-sans-serif, system-ui">
          $
        </text>
      </g>
      <g opacity="0.9">
        <circle cx="376" cy="196" r="16" fill={`url(#${idPrefix}-coin)`} />
        <text x="376" y="202" textAnchor="middle" fontSize="15" fontWeight="800" fill="#78350f" fontFamily="ui-sans-serif, system-ui">
          $
        </text>
      </g>

      {/* Faíscas */}
      <g fill="#22d3ee">
        <path d="M64 84 l3.5 8.5 8.5 3.5 -8.5 3.5 -3.5 8.5 -3.5 -8.5 -8.5 -3.5 8.5 -3.5 Z" opacity="0.9" />
        <path d="M338 52 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 Z" opacity="0.7" />
        <circle cx="120" cy="120" r="3" opacity="0.5" />
        <circle cx="284" cy="92" r="2.5" fill="#a78bfa" opacity="0.7" />
      </g>
    </svg>
  );
}
