import { ImageResponse } from 'next/og';

// iOS ホーム画面追加時に使われるアイコン。Apple は 180x180 を推奨。
// 透明背景は丸抜きで切られるので塗りつぶしておく。
export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 120,
        fontWeight: 700,
        background: '#2563eb',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
      }}
    >
      テ
    </div>,
    { ...size },
  );
}
