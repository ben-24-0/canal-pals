/**
 * Manning's Equation — TypeScript port for client-side previews.
 *
 * Q = (u / n) · A · R^(2/3) · S^(1/2)
 */

export interface ManningsInput {
  shape: "trapezoid" | "rectangle" | "circle";
  b?: number; // bottom width (m)
  z?: number; // side slope (H:V)
  D?: number; // diameter (m)
  S: number; // bed slope
  n: number; // Manning's n
  u?: number; // unit factor (default 1 = SI)
}

export interface ManningsResult {
  Q: number; // flow rate (m³/s)
  A: number; // cross-section area (m²)
  P: number; // wetted perimeter (m)
  R: number; // hydraulic radius (m)
  V: number; // velocity (m/s)
}

export function calculateFlowRate(
  depth: number,
  params: ManningsInput,
): ManningsResult {
  const { shape, b = 0, z = 0, D = 0, S, n, u = 1 } = params;
  const zero: ManningsResult = { Q: 0, A: 0, P: 0, R: 0, V: 0 };

  if (depth <= 0 || !S || !n) return zero;

  let A: number;
  let P: number;

  switch (shape) {
    case "trapezoid": {
      A = (b + z * depth) * depth;
      P = b + 2 * depth * Math.sqrt(1 + z * z);
      break;
    }
    case "rectangle": {
      A = b * depth;
      P = b + 2 * depth;
      break;
    }
    case "circle": {
      if (D <= 0) return zero;
      const ratio = Math.min(depth / D, 1);
      const theta = 2 * Math.acos(1 - 2 * ratio);
      A = ((D * D) / 8) * (theta - Math.sin(theta));
      P = (D / 2) * theta;
      break;
    }
    default:
      return zero;
  }

  if (A <= 0 || P <= 0) return zero;

  const R = A / P;
  const V = (u / n) * Math.pow(R, 2 / 3) * Math.pow(S, 0.5);
  const Q = V * A;

  return {
    Q: +Q.toFixed(6),
    A: +A.toFixed(6),
    P: +P.toFixed(6),
    R: +R.toFixed(6),
    V: +V.toFixed(6),
  };
}
