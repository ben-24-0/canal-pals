/**
 * Simple time-series prediction using weighted moving average + trend.
 *
 * This is a lightweight client-side approach — no ML libraries needed.
 * It takes the last N data points and extrapolates a short-term trend.
 */

/**
 * Predict the next `steps` flow-rate values based on `history`.
 *
 * @param history  - Array of past flow-rate values (oldest → newest)
 * @param steps    - Number of future steps to predict (default 6)
 * @param window   - Moving-average window size (default 6)
 * @returns Array of predicted values
 */
export function predictFlowRate(
  history: number[],
  steps = 6,
  window = 6,
): number[] {
  if (history.length < 2) return Array(steps).fill(history[0] ?? 0);

  // Compute a simple moving average over the most recent `window` points
  const tail = history.slice(-Math.min(window, history.length));
  const sma = tail.reduce((a, b) => a + b, 0) / tail.length;

  // Compute a linear trend from the tail
  const n = tail.length;
  const xMean = (n - 1) / 2;
  const yMean = sma;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (tail[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  const slope = den !== 0 ? num / den : 0;

  // Project forward
  const predictions: number[] = [];
  for (let i = 1; i <= steps; i++) {
    const val = sma + slope * i;
    predictions.push(+Math.max(0, val).toFixed(4));
  }

  return predictions;
}
