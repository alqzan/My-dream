// Milestone thresholds for the celebration watcher. Crossing one (a streak
// hitting 7/30/100…, or finishing the 1st/5th/10th book) fires a one-time
// confetti burst. Values are compared against a persisted "highest celebrated"
// marker so each milestone celebrates exactly once, ever.

export const STREAK_MILESTONES = [7, 30, 50, 100, 150, 200, 300, 365, 500, 730, 1000];
export const BOOK_MILESTONES = [1, 5, 10, 25, 50, 75, 100, 150, 200];

// The highest threshold at or below `value` (0 if none reached yet).
export function highestReached(value: number, thresholds: number[]): number {
  let best = 0;
  for (const t of thresholds) {
    if (value >= t) best = t;
    else break;
  }
  return best;
}
