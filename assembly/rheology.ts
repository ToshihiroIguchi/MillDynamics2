// assembly/rheology.ts
import { Real } from './types';

export function muApp(
  gd: Real,
  K: Real,
  n: Real,
  tauY: Real,
  m: Real,
  muMin: Real,
  muMax: Real
): Real {
  // Power-law part
  let mu: Real = (n == 1.0) ? K : K * Math.pow(gd > 1e-12 ? gd : 1e-12, n - 1.0);

  // Yield part: tauY * (1 - exp(-m*gd)) / gd, which tends to tauY*m as gd -> 0
  if (tauY > 0.0) {
    const mg = m * gd;
    mu += (mg < 1e-6)
      ? tauY * m * (1.0 - 0.5 * mg)
      : tauY * (1.0 - Math.exp(-mg)) / gd;
  }

  if (mu < muMin) return muMin;
  if (mu > muMax) return muMax;
  return mu;
}
