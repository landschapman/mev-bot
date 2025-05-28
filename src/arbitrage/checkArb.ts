import chalk from 'chalk';

export interface PriceSource {
  name: string;
  price: number | null | undefined;
}

export interface ArbitrageOpportunity {
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
 * @param thresholdPct Minimum profit percent (optional)
 * @param quiet If true, suppress console output (for dashboard)
 * @returns { top: ArbitrageOpportunity[], warn: string[] }
 */
export function checkArb(
  sources: PriceSource[],
  thresholdPct: number = 0,
  quiet: boolean = false
): { top: ArbitrageOpportunity[]; warn: string[] } {
  const EPSILON = 1e-8;
  const opportunities: ArbitrageOpportunity[] = [];
  const warnings: string[] = [];

  const validSources = sources.filter(
    source => source.price != null && !isNaN(source.price)
  );

  for (const buyDex of validSources) {
    for (const sellDex of validSources) {
      if (buyDex.name === sellDex.name) continue;
      const buyPrice = buyDex.price!;
      const sellPrice = sellDex.price!;
      const profitPct = ((sellPrice - buyPrice) / buyPrice) * 100;
      if (sellPrice > buyPrice && profitPct > Math.max(EPSILON, thresholdPct)) {
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

  opportunities.sort((a, b) => b.profitPct - a.profitPct);
  const topOpportunities = opportunities.slice(0, 3);

  if (!quiet) {
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
  if (topOpportunities.length === 0) {
    warnings.push('No arbitrage opportunities found.');
  }
  return { top: topOpportunities, warn: warnings };
} 