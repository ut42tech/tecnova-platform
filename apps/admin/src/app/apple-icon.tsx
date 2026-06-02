import { ImageResponse } from 'next/og';

// iOS のホーム画面用アイコン（apple-touch-icon）。iOS が角丸を付けるので
// フルブリードのブランドブルー地に "tec" を置くだけでよい。
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
        fontSize: 74,
        fontWeight: 800,
        letterSpacing: '-0.06em',
      }}
    >
      tec
    </div>,
    { ...size },
  );
}
