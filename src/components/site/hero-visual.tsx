"use client";

import { useEffect, useRef } from "react";

/**
 * Illustrative only: a constant-elasticity demand curve, a stock cap and the resulting margin
 * curve, with the price band allowed by example rules. No customer data is shown.
 */
const COST = 11;
const CAP = 92;
const P_MIN = 13;
const P_MAX = 29;
const CURRENT = 17;
const BAND: [number, number] = [15.3, 18.7]; // +/-10% around the current price
const demand = (p: number) => 120 * Math.pow(p / 16, -2.1);
const units = (p: number) => Math.min(demand(p), CAP);
const margin = (p: number) => (p - COST) * units(p);

const W = 560;
const H = 360;
const PAD = { l: 44, r: 52, t: 28, b: 44 };
const X = (p: number) => PAD.l + ((p - P_MIN) / (P_MAX - P_MIN)) * (W - PAD.l - PAD.r);
const U_MAX = 160;
const YU = (u: number) => H - PAD.b - (Math.min(u, U_MAX) / U_MAX) * (H - PAD.t - PAD.b);
const M_MAX = 900;
const YM = (m: number) => H - PAD.b - (m / M_MAX) * (H - PAD.t - PAD.b);

function path(fn: (p: number) => number, y: (v: number) => number, from = P_MIN, to = P_MAX) {
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const p = from + ((to - from) * i) / 80;
    pts.push(`${i === 0 ? "M" : "L"}${X(p).toFixed(1)},${y(fn(p)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function bestInBand(): number {
  let best = BAND[0];
  for (let p = BAND[0]; p <= BAND[1]; p += 0.01) if (margin(p) > margin(best)) best = p;
  return Math.round(best * 100) / 100;
}

const RECOMMENDED = bestInBand();

export function HeroVisual() {
  const markerRef = useRef<SVGGElement>(null);
  const guideRef = useRef<SVGLineElement>(null);
  const labelRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let kill: (() => void) | undefined;
    const place = (p: number) => {
      const x = X(p);
      const y = YM(margin(p));
      markerRef.current?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      guideRef.current?.setAttribute("x1", x.toFixed(1));
      guideRef.current?.setAttribute("x2", x.toFixed(1));
      if (labelRef.current) {
        labelRef.current.setAttribute("x", x.toFixed(1));
        labelRef.current.textContent = `$${p.toFixed(2)}`;
      }
    };
    // Loaded after hydration so it never delays the first paint.
    import("gsap").then(({ gsap }) => {
      if (cancelled) return;
      const state = { p: CURRENT };
      place(CURRENT);
      const tween = gsap.to(state, { p: RECOMMENDED, duration: 1.6, delay: 0.5, ease: "power2.inOut", onUpdate: () => place(state.p) });
      kill = () => tween.kill();
    });
    return () => {
      cancelled = true;
      kill?.();
    };
  }, []);

  const rx = X(RECOMMENDED);
  const ry = YM(margin(RECOMMENDED));
  const ticks = [14, 17, 20, 23, 26, 29];

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby="hero-viz-title hero-viz-desc">
        <title id="hero-viz-title">How Prism chooses a price (illustrative)</title>
        <desc id="hero-viz-desc">
          Demand falls as price rises and is capped by available stock. Margin peaks at a price inside the band allowed by the pricing rules, which becomes the recommendation.
        </desc>
        <rect x={X(BAND[0])} y={PAD.t} width={X(BAND[1]) - X(BAND[0])} height={H - PAD.t - PAD.b} fill="var(--emerald-soft)" />
        <text x={(X(BAND[0]) + X(BAND[1])) / 2} y={PAD.t - 10} textAnchor="middle" fontSize="11" fill="var(--emerald)" fontWeight={500}>
          Allowed by your rules
        </text>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="var(--border)" strokeWidth={1} />
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={YU(CAP)} y2={YU(CAP)} stroke="var(--ink)" strokeDasharray="4 4" strokeWidth={1} opacity={0.55} />
        <text x={W - PAD.r} y={YU(CAP) - 6} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
          Stock available
        </text>
        <path d={path(demand, YU)} fill="none" stroke="var(--ink)" strokeWidth={1.5} opacity={0.35} />
        <path d={path(units, YU)} fill="none" stroke="var(--ink)" strokeWidth={2} />
        <text x={X(25.6)} y={YU(units(25.6)) - 8} fontSize="11" fill="var(--ink)">
          Expected units
        </text>
        <path d={path(margin, YM)} fill="none" stroke="var(--emerald)" strokeWidth={2.5} />
        <text x={X(26.2)} y={YM(margin(26.2)) - 10} fontSize="11" fill="var(--emerald)" fontWeight={500} textAnchor="middle">
          Margin
        </text>
        <line x1={X(CURRENT)} x2={X(CURRENT)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted-foreground)" strokeDasharray="2 3" />
        <text x={X(CURRENT) - 4} y={H - PAD.b - 8} fontSize="11" fill="var(--muted-foreground)" textAnchor="end">
          Current
        </text>
        <line ref={guideRef} x1={rx} x2={rx} y1={ry} y2={H - PAD.b} stroke="var(--vermillion)" strokeWidth={1.25} />
        <g ref={markerRef} transform={`translate(${rx} ${ry})`}>
          <circle r={7} fill="var(--card)" stroke="var(--vermillion)" strokeWidth={2.5} />
        </g>
        <text ref={labelRef} x={rx} y={H - PAD.b + 30} fontSize="12" fill="var(--vermillion)" fontWeight={600} textAnchor="middle">
          ${RECOMMENDED.toFixed(2)}
        </text>
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--ink)" strokeWidth={1} />
        {ticks.map((t) => (
          <text key={t} x={X(t)} y={H - PAD.b + 16} fontSize="10.5" fill="var(--muted-foreground)" textAnchor="middle">
            {t}
          </text>
        ))}
        <text x={W - PAD.r} y={H - 4} fontSize="11" fill="var(--muted-foreground)" textAnchor="end">
          Price
        </text>
      </svg>
      <figcaption className="mt-2 text-xs text-muted-foreground">
        Illustrative curves with made-up numbers, not customer data. In Prism, the demand curve comes from a model trained on your sales history.
      </figcaption>
    </figure>
  );
}
