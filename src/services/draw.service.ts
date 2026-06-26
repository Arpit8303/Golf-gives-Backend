import { supabase } from '../config/supabase';
import { SCORE_MIN, SCORE_MAX } from '../constants';

interface DrawnResult {
  numbers: number[];
  mode: 'random' | 'algorithmic';
}

/**
 * Generates 5 unique random numbers between SCORE_MIN (1) and SCORE_MAX (45)
 */
const randomDraw = (): number[] => {
  const numbers = new Set<number>();
  while (numbers.size < 5) {
    numbers.add(Math.floor(Math.random() * (SCORE_MAX - SCORE_MIN + 1)) + SCORE_MIN);
  }
  return Array.from(numbers);
};

/**
 * Algorithmic draw — pinned formula:
 * 1. Collect all scores from active subscribers
 * 2. Build frequency map { scoreValue: count }
 * 3. Sort by frequency DESC → pick top 3 (most common). Tie-break: lowest value wins.
 * 4. Sort by frequency ASC → pick bottom 2 (least common). Tie-break: lowest value wins.
 * 5. Merge, deduplicate (slide index if collision), return 5 unique numbers.
 */
const algorithmicDraw = async (): Promise<number[]> => {
  // Fetch all scores from active subscribers
  const { data: scores, error } = await supabase
    .from('scores')
    .select('score, users!inner(subscription_status)')
    .eq('users.subscription_status', 'active');

  if (error || !scores || scores.length === 0) {
    // Fall back to random if no score data
    return randomDraw();
  }

  // Build frequency map
  const freqMap = new Map<number, number>();
  for (const entry of scores) {
    const val = entry.score as number;
    freqMap.set(val, (freqMap.get(val) ?? 0) + 1);
  }

  // Sort by frequency DESC (tie-break: lowest value wins)
  const sortedDesc = Array.from(freqMap.entries()).sort((a, b) =>
    b[1] !== a[1] ? b[1] - a[1] : a[0] - b[0]
  );

  // Sort by frequency ASC (tie-break: lowest value wins)
  const sortedAsc = Array.from(freqMap.entries()).sort((a, b) =>
    a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]
  );

  const result = new Set<number>();

  // Pick top 3 from most-frequent
  for (const [val] of sortedDesc) {
    if (result.size >= 3) break;
    result.add(val);
  }

  // Pick bottom 2 from least-frequent (skip any already selected)
  for (const [val] of sortedAsc) {
    if (result.size >= 5) break;
    if (!result.has(val)) result.add(val);
  }

  // If still < 5 (edge case with very few unique scores), fill randomly
  while (result.size < 5) {
    const rand = Math.floor(Math.random() * (SCORE_MAX - SCORE_MIN + 1)) + SCORE_MIN;
    result.add(rand);
  }

  return Array.from(result);
};

/**
 * Run the draw engine.
 * @param mode 'random' | 'algorithmic'
 * @returns { numbers: number[], mode: string }
 */
export const runDraw = async (mode: 'random' | 'algorithmic'): Promise<DrawnResult> => {
  const numbers =
    mode === 'algorithmic' ? await algorithmicDraw() : randomDraw();
  return { numbers, mode };
};

/**
 * Check matches for all active subscribers against the drawn numbers.
 * Returns array of { userId, matchType, matchCount }
 */
export const checkMatches = async (
  drawnNumbers: number[]
): Promise<Array<{ userId: string; matchType: 'five_match' | 'four_match' | 'three_match'; matchCount: number }>> => {
  const drawnSet = new Set(drawnNumbers);

  // Fetch all active subscribers with their scores
  const { data: users, error } = await supabase
    .from('users')
    .select('id, scores(score)')
    .eq('subscription_status', 'active');

  if (error || !users) return [];

  const matches: Array<{ userId: string; matchType: 'five_match' | 'four_match' | 'three_match'; matchCount: number }> = [];

  for (const user of users) {
    const userScores = (user.scores as Array<{ score: number }>).map((s) => s.score);
    const matchCount = userScores.filter((s) => drawnSet.has(s)).length;

    if (matchCount >= 5) {
      matches.push({ userId: user.id, matchType: 'five_match', matchCount });
    } else if (matchCount >= 4) {
      matches.push({ userId: user.id, matchType: 'four_match', matchCount });
    } else if (matchCount >= 3) {
      matches.push({ userId: user.id, matchType: 'three_match', matchCount });
    }
  }

  return matches;
};
