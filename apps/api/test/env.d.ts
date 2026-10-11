import type { D1Migration } from 'cloudflare:test';

// テストから見える env（cloudflare:workers の env は Cloudflare.Env 型）に binding を足す。
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
