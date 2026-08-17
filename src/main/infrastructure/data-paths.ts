import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface DataPaths {
  root: string;
  database: string;
  saves: string;
  cache: string;
  marketData: string;
  logs: string;
  temp: string;
  config: string;
  security: string;
}

export function resolveDataPaths(applicationRoot: string, override?: string): DataPaths {
  const configuredRoot = override ?? process.env.PAPERFORGE_DATA_ROOT;
  const root = configuredRoot ? resolve(configuredRoot) : resolve(applicationRoot, '.paperforge');
  const paths: DataPaths = {
    root,
    database: resolve(root, 'database'),
    saves: resolve(root, 'saves'),
    cache: resolve(root, 'cache'),
    marketData: resolve(root, 'market-data'),
    logs: resolve(root, 'logs'),
    temp: resolve(root, 'temp'),
    config: resolve(root, 'config'),
    security: resolve(root, 'security'),
  };
  for (const directory of Object.values(paths)) {
    mkdirSync(directory, { recursive: true });
  }
  return paths;
}
