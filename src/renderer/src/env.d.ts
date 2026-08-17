import type { PaperForgeApi } from '../../shared/types';

declare global {
  interface Window {
    paperForge: PaperForgeApi;
  }
}

export {};
