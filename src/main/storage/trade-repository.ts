import type { DatabaseSync } from 'node:sqlite';
import type { TradeRecord } from '../../shared/types';

export interface TradeRow {
  id: string;
  game_id: string;
  user_id: string;
  instrument_id: string;
  symbol: string;
  asset_class: string;
  exchange_id: string;
  side: string;
  simulation_timestamp: string;
  encrypted_payload: string;
  integrity_hash: string;
  created_at: string;
}

export class TradeRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(row: TradeRow): void {
    this.database
      .prepare(
        `INSERT INTO trades
         (id, game_id, user_id, instrument_id, symbol, asset_class, exchange_id, side,
          simulation_timestamp, encrypted_payload, integrity_hash, created_at)
         VALUES (@id, @game_id, @user_id, @instrument_id, @symbol, @asset_class, @exchange_id,
          @side, @simulation_timestamp, @encrypted_payload, @integrity_hash, @created_at)`,
      )
      .run(row as unknown as Record<string, string | number>);
  }

  toRow(trade: TradeRecord, encryptedPayload: string, integrityHash: string): TradeRow {
    return {
      id: trade.id,
      game_id: trade.gameId,
      user_id: trade.userId,
      instrument_id: trade.instrument.id,
      symbol: trade.instrument.symbol,
      asset_class: trade.instrument.assetClass,
      exchange_id: trade.instrument.exchange,
      side: trade.side,
      simulation_timestamp: trade.simulationTimestamp,
      encrypted_payload: encryptedPayload,
      integrity_hash: integrityHash,
      created_at: trade.realTimestamp,
    };
  }
}
