/// <reference types="vite/client" />

import type { WorkTrackBridge } from '../shared/types';

declare global {
  interface Window {
    worktrack: WorkTrackBridge;
  }
}