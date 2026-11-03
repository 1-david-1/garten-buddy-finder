import { useId, type CSSProperties, type ReactNode } from "react";
import { BadgeCheck } from "lucide-react";

/**
 * Handgezeichnete Bausteine für die Startseite: Pfeile, Unterstreichung, Avatare,
 * schwebende Karten und das drehende Text-Badge. Alles Inline-SVG, keine externen Bilder
 * (so bleibt die Seite auch mit der strengen Content-Security-Policy ohne Fremdquellen lauffähig).
 */

type CN = { className?: string; style?: CSSProperties };

export function ArrowLoopLeft({ className }: CN) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10,90 C 10,40 40,20 60,50 C 70,65 80,75 95,70" />
      <path d="M80,55 L95,70 L85,85" />
    </svg>
  );
}

export function ArrowLoopRight({ className }: CN) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M90,10 C 80,60 60,80 40,60 C 20,40 40,20 60,30 C 80,40 70,70 50,80" />
      <path d="M65,75 L50,80 L55,65" />
    </svg>
  );
}

export function ArrowCurve({ className }: CN) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20,80 Q 40,20 80,40" />
      <path d="M60,20 L80,40 L50,60" />
    </svg>
  );
}

/**
 * Wellige Unterstreichung, wie mit dem Filzstift gezogen. Sie füllt immer die volle Breite ihres
 * Containers; die Strichstärke bleibt beim Strecken gleich (non-scaling-stroke).
 */
export function Squiggle({ className, style }: CN) {
  return (
    <svg viewBox="0 0 200 16" preserveAspectRatio="none" className={className} style={style} fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" aria-hidden="true">
      <path vectorEffect="non-scaling-stroke" d="M2,9 Q 16,1 30,9 T 58,9 T 86,9 T 114,9 T 142,9 T 170,9 T 198,9" />
    </svg>
  );
}

/**
 * Unterstreicht genau ein Wort über seine ganze Breite. Wird bewusst sparsam eingesetzt
 * (pro Seite nur an wenigen Stellen), damit die Geste etwas Besonderes bleibt.
 */
export function Underlined({ children, color = "currentColor" }: { children: ReactNode; color?: string }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <Squiggle className="pointer-events-none absolute -bottom-[0.14em] left-0 h-[0.26em] w-full overflow-visible" style={{ color }} />
    </span>
  );
}

/** Kleiner Keimling, ein wiederkehrendes Motiv. */
export function Sprout({ className }: CN) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M32 58 V30" />
      <path d="M32 34 C 32 22 22 14 8 16 C 8 30 18 36 32 34 Z" fill="currentColor" fillOpacity="0.25" />
      <path d="M32 28 C 32 16 42 8 56 10 C 56 24 46 30 32 28 Z" fill="currentColor" fillOpacity="0.25" />
    </svg>
  );
}

/** Runder Stempel mit Häkchen. */
export function Stamp({ className }: CN) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="5" strokeDasharray="3 7" strokeLinecap="round" />
      <circle cx="50" cy="50" r="33" stroke="currentColor" strokeWidth="5" />
      <path d="M34 51 L46 63 L68 38" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Gezeichnete Avatare, damit keine Fotos von Personen (schon gar nicht von Jugendlichen) gezeigt werden. */
export function Avatar({ variant, className }: { variant: "leaf" | "sun" } & CN) {
  const bg = variant === "leaf" ? "#7fd99a" : "#ffd21f";
  const fg = variant === "leaf" ? "#04301e" : "#04301e";
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true">
      <circle cx="48" cy="48" r="46" fill={bg} stroke="#04301e" strokeWidth="4" />
      {variant === "leaf" ? (
        <>
          <path d="M48 74 V44" stroke={fg} strokeWidth="5" strokeLinecap="round" />
          <path d="M48 50 C 48 34 34 26 18 30 C 20 46 32 54 48 50 Z" fill="#fff" stroke={fg} strokeWidth="4" strokeLinejoin="round" />
          <path d="M48 44 C 48 28 62 20 78 24 C 76 40 64 48 48 44 Z" fill="#fff" stroke={fg} strokeWidth="4" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="48" cy="46" r="14" fill="#fff" stroke={fg} strokeWidth="4" />
          {Array.from({ length: 8 }).map((_, i) => (
            <path
              key={i}
              d="M48 22 V14"
              stroke={fg}
              strokeWidth="5"
              strokeLinecap="round"
              transform={`rotate(${i * 45} 48 46)`}
            />
          ))}
          <path d="M40 80 H56 V70 H40 Z" fill="#ff5a36" stroke={fg} strokeWidth="4" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

/** Schwebende Karte im Kopfbereich (dekorativ, daher für Screenreader versteckt). */
export function FloatCard({
  name,
  job,
  status,
  variant,
  rot,
  delay = 0,
  className = "",
}: {
  name: string;
  job: string;
  status: string;
  variant: "leaf" | "sun";
  rot: number;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`gm-float ${className}`}
      style={{ ["--gm-rot" as string]: `${rot}deg`, animationDelay: `${delay}s` }}
    >
      <div
        className="gm-pop w-44 rounded-[2rem] border-[3px] border-white/70 bg-[#04301e]/45 p-5 text-center text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md md:w-52"
        style={{ animationDelay: `${0.5 + delay * 0.2}s` }}
      >
        <Avatar variant={variant} className="mx-auto mb-3 size-16 md:size-20" />
        <p className="font-brand text-lg md:text-xl">{name}</p>
        <p className="mt-0.5 text-sm font-semibold text-white/90">{job}</p>
        <span className="mt-3 inline-flex items-center gap-1 rounded-full border-2 border-[#04301e] bg-[#ffd21f] px-2.5 py-1 text-[11px] font-bold leading-none text-[#04301e]">
          <BadgeCheck className="size-3.5" />
          {status}
        </span>
      </div>
    </div>
  );
}

/** Rotierendes Text-Badge. Der Inhalt (z. B. ein Link) wird als children in die Mitte gesetzt. */
export function SpinBadge({ text, children, className = "" }: { text: string; children: ReactNode; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <div
      className={`relative flex size-28 items-center justify-center rounded-full border-[3px] border-[#04301e] bg-[#ffd21f] shadow-[5px_5px_0_#04301e] md:size-36 ${className}`}
    >
      <div className="gm-spin absolute inset-1" aria-hidden="true">
        <svg viewBox="0 0 100 100" className="size-full">
          <path id={`gm-circle-${id}`} d="M 50,50 m -36,0 a 36,36 0 1,1 72,0 a 36,36 0 1,1 -72,0" fill="none" />
          <text fill="#04301e" fontSize="9.5" fontWeight="800" style={{ fontFamily: "var(--font-brand)" }}>
            <textPath href={`#gm-circle-${id}`} startOffset="0" textLength="222" lengthAdjust="spacing">
              {text}
            </textPath>
          </text>
        </svg>
      </div>
      <div className="relative z-10 flex items-center justify-center">{children}</div>
    </div>
  );
}
