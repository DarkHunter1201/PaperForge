import type { GameState, PortfolioSnapshot, Quote } from '../../shared/types';
import { canonicalDecimal, decimal } from './decimal';

export class PortfolioEngine {
  calculate(
    state: GameState,
    quotes: Map<string, Quote>,
    fxRates: Map<string, string>,
  ): PortfolioSnapshot {
    const reportingCurrency = state.reportingCurrency;
    const unavailableConversions = new Set<string>();
    const convert = (value: string, currency: string) => {
      if (currency === reportingCurrency) {
        return decimal(value);
      }
      const direct = fxRates.get(`${currency}/${reportingCurrency}`);
      if (direct) {
        return decimal(value).mul(direct);
      }
      const inverse = fxRates.get(`${reportingCurrency}/${currency}`);
      if (inverse) {
        return decimal(value).div(inverse);
      }
      unavailableConversions.add(`${currency}/${reportingCurrency}`);
      return null;
    };
    let cashValue = decimal(0);
    for (const [currency, balance] of Object.entries(state.cash)) {
      const converted = convert(balance, currency);
      if (converted) cashValue = cashValue.plus(converted);
    }
    let positionsValue = decimal(0);
    let unrealizedPnl = decimal(0);
    let realizedPnl = decimal(0);
    const positions = state.holdings.map((holding) => {
      const quote = quotes.get(holding.instrument.id);
      const marketValue = quote ? decimal(quote.price).mul(holding.quantity) : null;
      const positionPnl = quote
        ? decimal(quote.price).minus(holding.averageCost).mul(holding.quantity)
        : null;
      const convertedValue = marketValue
        ? convert(canonicalDecimal(marketValue), holding.instrument.quoteCurrency)
        : null;
      const convertedPnl = positionPnl
        ? convert(canonicalDecimal(positionPnl), holding.instrument.quoteCurrency)
        : null;
      const convertedRealized = convert(holding.realizedPnl, holding.instrument.quoteCurrency);
      if (convertedValue) positionsValue = positionsValue.plus(convertedValue);
      if (convertedPnl) unrealizedPnl = unrealizedPnl.plus(convertedPnl);
      if (convertedRealized) realizedPnl = realizedPnl.plus(convertedRealized);
      const returnPercent = quote
        ? decimal(quote.price).minus(holding.averageCost).div(holding.averageCost).mul(100)
        : null;
      return {
        instrument: holding.instrument,
        quantity: holding.quantity,
        averageCost: holding.averageCost,
        currentPrice: quote?.price ?? null,
        marketValue: marketValue ? canonicalDecimal(marketValue) : null,
        unrealizedPnl: positionPnl ? canonicalDecimal(positionPnl) : null,
        realizedPnl: holding.realizedPnl,
        returnPercent: returnPercent ? canonicalDecimal(returnPercent) : null,
      };
    });
    return {
      reportingCurrency,
      cash: state.cash,
      cashValue: canonicalDecimal(cashValue),
      positionsValue: canonicalDecimal(positionsValue),
      totalValue: canonicalDecimal(cashValue.plus(positionsValue)),
      realizedPnl: canonicalDecimal(realizedPnl),
      unrealizedPnl: canonicalDecimal(unrealizedPnl),
      positions,
      unavailableConversions: [...unavailableConversions],
    };
  }
}
