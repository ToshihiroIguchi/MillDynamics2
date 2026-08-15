// src/render/colormap.ts
// Perceptually uniform and diverging colormaps

export type ColormapName = 'viridis' | 'plasma' | 'coolwarm' | 'turbo' | 'yieldState';

// Sample viridis colormap LUT (256 entries: [r, g, b])
function generateViridisLUT(): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  // Key stops: 0.0, 0.25, 0.5, 0.75, 1.0
  const stops = [
    { t: 0.00, r: 68,  g: 1,   b: 84 },
    { t: 0.25, r: 59,  g: 82,  b: 139 },
    { t: 0.50, r: 33,  g: 145, b: 140 },
    { t: 0.75, r: 94,  g: 201, b: 98 },
    { t: 1.00, r: 253, g: 231, b: 37 }
  ];

  for (let i = 0; i < 256; i++) {
    const t = i / 255.0;
    let s0 = stops[0], s1 = stops[1];
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k].t && t <= stops[k + 1].t) {
        s0 = stops[k];
        s1 = stops[k + 1];
        break;
      }
    }
    const f = (t - s0.t) / (s1.t - s0.t);
    lut[i * 3 + 0] = Math.round(s0.r + (s1.r - s0.r) * f);
    lut[i * 3 + 1] = Math.round(s0.g + (s1.g - s0.g) * f);
    lut[i * 3 + 2] = Math.round(s0.b + (s1.b - s0.b) * f);
  }
  return lut;
}

// Sample diverging coolwarm LUT (blue -> gray/white -> red)
function generateCoolwarmLUT(): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  const stops = [
    { t: 0.00, r: 59,  g: 76,  b: 192 },
    { t: 0.50, r: 221, g: 221, b: 221 },
    { t: 1.00, r: 180, g: 4,   b: 38 }
  ];
  for (let i = 0; i < 256; i++) {
    const t = i / 255.0;
    let s0 = stops[0], s1 = stops[1];
    if (t > 0.5) { s0 = stops[1]; s1 = stops[2]; }
    const f = (t - s0.t) / (s1.t - s0.t);
    lut[i * 3 + 0] = Math.round(s0.r + (s1.r - s0.r) * f);
    lut[i * 3 + 1] = Math.round(s0.g + (s1.g - s0.g) * f);
    lut[i * 3 + 2] = Math.round(s0.b + (s1.b - s0.b) * f);
  }
  return lut;
}

const VIRIDIS_LUT = generateViridisLUT();
const COOLWARM_LUT = generateCoolwarmLUT();

export function mapScalarToRgb(valNorm: number, map: ColormapName): [number, number, number] {
  let t = valNorm;
  if (t < 0.0) t = 0.0;
  if (t > 1.0) t = 1.0;
  const idx = Math.min(Math.floor(t * 255.0), 255);

  if (map === 'coolwarm') {
    return [COOLWARM_LUT[idx * 3], COOLWARM_LUT[idx * 3 + 1], COOLWARM_LUT[idx * 3 + 2]];
  } else if (map === 'yieldState') {
    // 0 = unyielded dead zone (deep blue), 1 = yielded (bright yellow/orange)
    if (valNorm > 0.5) {
      return [253, 231, 37]; // bright yellow
    } else {
      return [44, 53, 85]; // slate/navy blue
    }
  }

  // Default viridis
  return [VIRIDIS_LUT[idx * 3], VIRIDIS_LUT[idx * 3 + 1], VIRIDIS_LUT[idx * 3 + 2]];
}
