import { ImageResponse } from 'next/og';

// ブラウザタブ・PWA 用のアイコンをプログラム生成する（PNG をリポジトリに置かない方針）。
// ブランドブルー地に "tec" のワードマーク。ImageResponse は flexbox のみ対応。
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#2563eb',
        color: '#ffffff',
        fontSize: 210,
        fontWeight: 800,
        letterSpacing: '-0.06em',
      }}
    >
      tec
    </div>,
    { ...size },
  );
}
