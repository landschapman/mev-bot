import chalk from 'chalk';

export interface PriceSource {
  name: string;
  price: number | null | undefined;
}

interface ArbitrageOpportunity {
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  profitPct: number;
}

/**
 * Checks for arbitrage opportunities between DEX price sources.
 * Reports the top 3 most profitable opportunities where sellPrice > buyPrice.
 * @param sources Array of { name, price } objects
 */
export function checkArb(
  sources: PriceSource[],
  thresholdPct: number = 0 // kept for backwards compatibility
) {
  const EPSILON = 1e-8; // Small number to handle floating point comparison
  const opportunities: ArbitrageOpportunity[] = [];

  // Filter out sources with null/undefined prices
  const validSources = sources.filter(
    source => source.price != null && !isNaN(source.price)
  );

  for (const buyDex of validSources) {
    for (const sellDex of validSources) {
      // Skip same-DEX comparisons
      if (buyDex.name === sellDex.name) continue;

      const buyPrice = buyDex.price!; // Non-null assertion is safe due to filter
      const sellPrice = sellDex.price!;
      
      // Calculate profit percentage
      const profitPct = ((sellPrice - buyPrice) / buyPrice) * 100;

      // Collect all positive arbitrage opportunities
      if (sellPrice > buyPrice && profitPct > EPSILON) {
        opportunities.push({
          buyDex: buyDex.name,
          sellDex: sellDex.name,
          buyPrice,
          sellPrice,
          profitPct
        });
      }
    }
  }

  // Sort opportunities by profit percentage (highest first) and take top 3
  opportunities.sort((a, b) => b.profitPct - a.profitPct);
  const topOpportunities = opportunities.slice(0, 3);

  if (topOpportunities.length > 0) {
    console.log(chalk.blue('\n=== Top 3 Arbitrage Opportunities ==='));
    topOpportunities.forEach((opp, index) => {
      console.log(
        chalk.green(
          `${index + 1}. Buy from ${opp.buyDex} at ${opp.buyPrice.toFixed(2)}, sell to ${opp.sellDex} at ${opp.sellPrice.toFixed(2)} (profit ~${opp.profitPct.toFixed(2)}%)`
        )
      );
    });
    if (opportunities.length > 3) {
      console.log(chalk.gray(`\n(${opportunities.length - 3} other opportunities not shown)`));
    }
    console.log(chalk.blue('=====================================\n'));
  } else {
    console.log(chalk.yellow('No arbitrage opportunities found.'));
  }
} 