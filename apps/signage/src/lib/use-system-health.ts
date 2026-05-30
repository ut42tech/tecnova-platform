'use client';

import type { SignageHealthResponse } from '@tecnova/shared/schemas';
import { apiJson } from '@tecnova/ui/lib/api-client';
import { useEffect, useState } from 'react';

export type HealthStatus = 'checking' | 'ok' | 'down';

// 基盤システムの稼働確認。/api/signage/health を定期 ping し、成功=ok / 失敗=down。
const POLL_MS = 30_000;

export const useSystemHealth = (): HealthStatus => {
  const [status, setStatus] = useState<HealthStatus>('checking');

  useEffect(() => {
    let active = true;
    const ping = async (): Promise<void> => {
      try {
        const res = await apiJson<SignageHealthResponse>('/api/signage/health');
        if (active) setStatus(res.status === 'ok' ? 'ok' : 'down');
      } catch {
        if (active) setStatus('down');
      }
    };
    void ping();
    const id = window.setInterval(() => void ping(), POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return status;
};
