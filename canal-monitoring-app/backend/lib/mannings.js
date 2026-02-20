/**
 * Manning's Equation Calculator
 *
 * Calculates flow rate Q from depth y for different cross-section shapes.
 *
 * Q = (u / n) * A * R^(2/3) * S^(1/2)
 *
 * Where:
 *   u = unit factor (1 for SI, 1.49 for US customary)
 *   n = Manning's roughness coefficient
 *   A = cross-sectional flow area (m²)
 *   R = hydraulic radius = A / P  (m)
 *   P = wetted perimeter (m)
 *   S = bed slope (dimensionless)
 */

/**
 * Calculate flow rate from depth using Manning's equation.
 *
 * @param {number} depth  - water depth y (m)
 * @param {object} params - Manning's parameters
 * @param {string} params.shape - "trapezoid" | "rectangle" | "circle"
 * @param {number} [params.b]   - bottom width (m) for trapezoid / rectangle
 * @param {number} [params.z]   - side slope (H:V) for trapezoid
 * @param {number} [params.D]   - diameter (m) for circle
 * @param {number} params.S     - bed slope
 * @param {number} params.n     - Manning's n
 * @param {number} [params.u=1] - unit factor (default 1 = SI)
 * @returns {{ Q: number, A: number, P: number, R: number, V: number }}
 */
function calculateFlowRate(depth, params) {
  const { shape, b, z, D, S, n, u = 1 } = params;

  if (depth <= 0 || !S || !n) {
    return { Q: 0, A: 0, P: 0, R: 0, V: 0 };
  }

  let A, P;

  switch (shape) {
    case "trapezoid": {
      // A = (b + z·y) · y
      // P = b + 2·y·√(1 + z²)
      const zz = z || 0;
      const bb = b || 0;
      A = (bb + zz * depth) * depth;
      P = bb + 2 * depth * Math.sqrt(1 + zz * zz);
      break;
    }

    case "rectangle": {
      // A = b · y
      // P = b + 2·y
      const bb = b || 0;
      A = bb * depth;
      P = bb + 2 * depth;
      break;
    }

    case "circle": {
      // Partially full circular pipe
      // θ = 2·acos(1 − 2·y/D)
      const d = D || 0;
      if (d <= 0) return { Q: 0, A: 0, P: 0, R: 0, V: 0 };
      const ratio = Math.min(depth / d, 1); // clamp to full pipe
      const theta = 2 * Math.acos(1 - 2 * ratio);
      A = ((d * d) / 8) * (theta - Math.sin(theta));
      P = (d / 2) * theta;
      break;
    }

    default:
      return { Q: 0, A: 0, P: 0, R: 0, V: 0 };
  }

  if (A <= 0 || P <= 0) {
    return { Q: 0, A: 0, P: 0, R: 0, V: 0 };
  }

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

module.exports = { calculateFlowRate };
