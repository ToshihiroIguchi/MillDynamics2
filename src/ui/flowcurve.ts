// src/ui/flowcurve.ts
// Rheology evaluated in JS, mirroring assembly/rheology.ts. The flow curve
// itself is plotted by FlowCurveChart in ./charts.ts; this file is the model
// both that chart and the panel readouts sample.

// Herschel-Bulkley with Papanastasiou regularization, matching assembly/rheology.ts.
export function muAppJs(
  gd: number, K: number, n: number, tauY: number,
  mReg: number, muMin: number, muMax: number
): number {
  const g = Math.max(gd, 1e-12);
  let mu = K * Math.pow(g, n - 1.0);
  if (tauY > 0.0) mu += (tauY * (1.0 - Math.exp(-mReg * g))) / g;
  if (mu < muMin) mu = muMin;
  if (mu > muMax) mu = muMax;
  return mu;
}
