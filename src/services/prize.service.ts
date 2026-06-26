import { PRIZE_SPLITS } from '../constants';

interface PrizePoolInput {
  activeSubscriberCount: number;
  contributionPerSubscriber: number; // in GBP
  jackpotRollover: number; // carried over from previous draw
}

interface MatchGroup {
  matchType: 'five_match' | 'four_match' | 'three_match';
  userIds: string[];
}

interface WinnerPrize {
  userId: string;
  matchType: 'five_match' | 'four_match' | 'three_match';
  prizeAmount: number;
}

interface PrizeDistribution {
  totalPool: number;
  fiveMatchPool: number;
  fourMatchPool: number;
  threeMatchPool: number;
  newJackpotRollover: number;
  winners: WinnerPrize[];
}

/**
 * Calculate the prize pool from active subscriber count + rollover.
 */
export const calculatePrizePool = (input: PrizePoolInput) => {
  const basePool = input.activeSubscriberCount * input.contributionPerSubscriber;
  const totalPool = parseFloat((basePool + input.jackpotRollover).toFixed(2));

  const fiveMatchPool = parseFloat((totalPool * PRIZE_SPLITS.FIVE_MATCH).toFixed(2));
  const fourMatchPool = parseFloat((totalPool * PRIZE_SPLITS.FOUR_MATCH).toFixed(2));
  const threeMatchPool = parseFloat((totalPool * PRIZE_SPLITS.THREE_MATCH).toFixed(2));

  return { totalPool, fiveMatchPool, fourMatchPool, threeMatchPool };
};

/**
 * Distribute prizes across winners.
 *
 * Rules:
 * - If multiple winners in a tier: prize_amount = Math.floor(tier_pool / count)
 *   The integer remainder goes to newJackpotRollover.
 * - If no five_match winner: entire five_match_pool carries to newJackpotRollover.
 * - four_match and three_match pools do NOT roll over — they reset each draw.
 *
 * @param matchGroups Array of { matchType, userIds[] } grouped by tier
 * @param pools Pool amounts per tier
 * @returns { winners: WinnerPrize[], newJackpotRollover: number }
 */
export const distributePrizes = (
  matchGroups: MatchGroup[],
  pools: { fiveMatchPool: number; fourMatchPool: number; threeMatchPool: number }
): { winners: WinnerPrize[]; newJackpotRollover: number } => {
  const winners: WinnerPrize[] = [];
  let newJackpotRollover = 0;

  const tierPools: Record<string, number> = {
    five_match: pools.fiveMatchPool,
    four_match: pools.fourMatchPool,
    three_match: pools.threeMatchPool,
  };

  for (const group of matchGroups) {
    const pool = tierPools[group.matchType];
    const count = group.userIds.length;

    if (count === 0) {
      // No winners in this tier
      if (group.matchType === 'five_match') {
        // Five-match pool rolls over to next draw jackpot
        newJackpotRollover += pool;
      }
      // four_match and three_match pools reset — no rollover
      continue;
    }

    // Calculate per-winner amount (integer pence to avoid floating point drift)
    const poolPence = Math.round(pool * 100);
    const perWinnerPence = Math.floor(poolPence / count);
    const remainderPence = poolPence - perWinnerPence * count;

    // Remainder from rounding goes to rollover
    if (remainderPence > 0) {
      newJackpotRollover += remainderPence / 100;
    }

    const prizeAmount = parseFloat((perWinnerPence / 100).toFixed(2));

    for (const userId of group.userIds) {
      winners.push({ userId, matchType: group.matchType, prizeAmount });
    }
  }

  return { winners, newJackpotRollover: parseFloat(newJackpotRollover.toFixed(2)) };
};

/**
 * Build MatchGroup[] from the flat matches array returned by draw.service.checkMatches
 */
export const groupMatchesByTier = (
  matches: Array<{ userId: string; matchType: 'five_match' | 'four_match' | 'three_match' }>
): MatchGroup[] => {
  const groups: Record<string, MatchGroup> = {
    five_match: { matchType: 'five_match', userIds: [] },
    four_match: { matchType: 'four_match', userIds: [] },
    three_match: { matchType: 'three_match', userIds: [] },
  };

  for (const match of matches) {
    groups[match.matchType].userIds.push(match.userId);
  }

  return Object.values(groups);
};
