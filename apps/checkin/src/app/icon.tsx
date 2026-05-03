import { ImageResponse } from 'next/og';

// Web マニフェスト用のアプリアイコン。プログラム生成なので PNG ファイルを
// public/ に置かなくて済む。MVPでは「テ」一文字を青地に置くだけのミニマム実装。
export const size = {
  width: 192,
  height: 192,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 128,
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
