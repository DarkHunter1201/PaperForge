import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataPaths } from './data-paths';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export class AppLogger {
  private readonly logPath: string;

  constructor(paths: DataPaths) {
    this.logPath = join(paths.logs, 'paperforge.jsonl');
  }

  info(event: string, details: Record<string, unknown> = {}): void {
    this.write('INFO', event, details);
  }

  warn(event: string, details: Record<string, unknown> = {}): void {
    this.write('WARN', event, details);
  }

  error(event: string, error: unknown, details: Record<string, unknown> = {}): void {
    const safeError = error instanceof Error ? { name: error.name, message: error.message } : {};
    this.write('ERROR', event, { ...details, error: safeError });
  }

  purgeUser(userId: string): void {
    if (!existsSync(this.logPath)) return;
    const retained = readFileSync(this.logPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.includes(userId));
    const temporaryPath = `${this.logPath}.purge`;
    writeFileSync(temporaryPath, retained.length ? `${retained.join('\n')}\n` : '', 'utf8');
    renameSync(temporaryPath, this.logPath);
  }

  private write(level: LogLevel, event: string, details: Record<string, unknown>): void {
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, details });
    appendFileSync(this.logPath, `${entry}\n`, { encoding: 'utf8' });
  }
}
