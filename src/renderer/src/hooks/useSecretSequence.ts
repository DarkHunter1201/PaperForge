import { useEffect, useRef } from 'react';

const expectedHash = 'a25feeee1ea19fbbce388acc2c5e692e6c37192a7a8b1792aa6589757df2f5e3';
const sequenceLength = 5;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function matchesSecretSequence(value: string): Promise<boolean> {
  return value.length === sequenceLength && (await sha256(value)) === expectedHash;
}

export function useSecretSequence(enabled: boolean, onMatch: () => void): void {
  const buffer = useRef('');

  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1
      ) {
        buffer.current = '';
        return;
      }
      buffer.current = `${buffer.current}${event.key.toLocaleLowerCase('en-US')}`.slice(
        -sequenceLength,
      );
      if (buffer.current.length !== sequenceLength) return;
      const candidate = buffer.current;
      void matchesSecretSequence(candidate).then((matches) => {
        if (matches) {
          buffer.current = '';
          onMatch();
        }
      });
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, [enabled, onMatch]);
}
