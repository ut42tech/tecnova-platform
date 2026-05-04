// Workers 上で Google Sheets API を叩くための薄いクライアント。
// googleapis パッケージは Node.js 依存のため使えないので、Web Crypto API で
// 自前 JWT を生成し fetch で REST を直接呼ぶ。

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const base64UrlEncode = (input: string | ArrayBuffer): string => {
  let str: string;
  if (typeof input === 'string') {
    str = btoa(input);
  } else {
    str = btoa(String.fromCharCode(...new Uint8Array(input)));
  }
  return str.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

// 入力は base64 エンコードされた service account JSON 文字列を受け取る。
// .dev.vars の dotenv パーサは JSON 内の \n エスケープを実改行に変換してしまい
// そのままの文字列だと JSON.parse が「Bad control character」で失敗するため、
// ローカル/本番ともに base64 にラップする運用にしている。
const decodeServiceAccountKey = (encoded: string): ServiceAccountKey => {
  const json = atob(encoded.trim());
  return JSON.parse(json) as ServiceAccountKey;
};

const fetchAccessToken = async (encodedServiceAccountKey: string): Promise<string> => {
  const key = decodeServiceAccountKey(encodedServiceAccountKey);

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const claimB64 = base64UrlEncode(JSON.stringify(claim));
  const signInput = `${headerB64}.${claimB64}`;

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(key.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signInput),
  );

  const jwt = `${signInput}.${base64UrlEncode(signature)}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    throw new Error(`Token request failed: ${tokenResp.status} ${body}`);
  }

  const { access_token } = (await tokenResp.json()) as { access_token: string };
  return access_token;
};

// アクセストークンは Worker のモジュールスコープにキャッシュする。
// 1リクエスト内で再生成しないため、複数の Sheets 操作が連続するときの
// 余分な往復が消える。Workers のインスタンスがリサイクルされたら自然に再生成される。
let cachedToken: { value: string; expiresAt: number } | null = null;

export const getCachedAccessToken = async (encodedServiceAccountKey: string): Promise<string> => {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value;
  }
  const token = await fetchAccessToken(encodedServiceAccountKey);
  cachedToken = { value: token, expiresAt: now + 3600_000 };
  return token;
};

export const fetchSheetRows = async (
  encodedServiceAccountKey: string,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> => {
  const token = await getCachedAccessToken(encodedServiceAccountKey);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Sheets fetch failed: ${resp.status} ${body}`);
  }
  const data = (await resp.json()) as { values?: string[][] };
  return data.values ?? [];
};

export const updateSheetRow = async (
  encodedServiceAccountKey: string,
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<void> => {
  const token = await getCachedAccessToken(encodedServiceAccountKey);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Sheets update failed: ${resp.status} ${body}`);
  }
};

// 新規行を追加する。`insertDataOption=INSERT_ROWS` を指定することで、
// クリア跡（空行）に上書きされず必ず新しい行として挿入される。
export const appendSheetRows = async (
  encodedServiceAccountKey: string,
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<void> => {
  const token = await getCachedAccessToken(encodedServiceAccountKey);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Sheets append failed: ${resp.status} ${body}`);
  }
};

// 指定レンジのセル値をクリアする（行自体は残る）。事前登録者削除では
// 行をフィジカルに消す代わりにこれを使い、パーサ側の空行フィルタで吸収する。
// `deleteDimension` だと sheetId（数値）解決の追加コールが必要になるため避けた。
export const clearSheetRange = async (
  encodedServiceAccountKey: string,
  spreadsheetId: string,
  range: string,
): Promise<void> => {
  const token = await getCachedAccessToken(encodedServiceAccountKey);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Sheets clear failed: ${resp.status} ${body}`);
  }
};
