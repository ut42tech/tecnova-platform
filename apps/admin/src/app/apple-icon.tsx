import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// iOS ホーム画面用アイコン（apple-touch-icon）。iOS が角丸を付けるので白地フルブリードでよい。
// 公式ロゴ（横長ワードマーク）を中央配置する。詳細は icon.tsx と同方針。
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default async function AppleIcon() {
  const logo = await readFile(join(process.cwd(), 'public', 'logo_tecnova.png'));
  const src = `data:image/png;base64,${logo.toString('base64')}`;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: ImageResponse(Satori) はネイティブ <img> のみ対応。next/image は使えない。 */}
      <img src={src} width={150} height={39} alt="tec-nova Nagasaki" />
    </div>,
    { ...size },
  );
}
