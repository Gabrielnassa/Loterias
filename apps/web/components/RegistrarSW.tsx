'use client';

import { useEffect } from 'react';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Registra o service worker do painel (PWA instalável e Web Push). */
export function RegistrarSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }).catch(() => {});
  }, []);
  return null;
}
