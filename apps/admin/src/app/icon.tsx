import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// ブラウザタブ・PWA 用アイコン。公式ロゴ（横長ワードマーク）を白地の正方形に
// 中央配置して生成する。ImageResponse(Satori) は flexbox のみ・画像は <img> で埋める。
// ロゴ PNG は public から読み込み base64 で渡す（admin は Vercel/Node ランタイムなので fs 可）。
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default async function Icon() {
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
      <img src={src} width={440} height={115} alt="tec-nova Nagasaki" />
    </div>,
    { ...size },
  );
}
