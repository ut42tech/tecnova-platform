import type { MetadataRoute } from 'next';

// admin を「ホーム画面に追加」できる PWA にするためのマニフェスト（Android / Chromium 用）。
// iOS 側は layout.tsx の appleWebApp で別途設定する（両方必要）。
// アイコンは app/icon.tsx・app/apple-icon.tsx でプログラム生成し、PNG は置かない。
// checkin と異なり orientation は固定しない（管理画面は縦横どちらでも使う）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'テクノバ管理画面',
    short_name: '管理画面',
    description: 'テクノバながさきの運営管理画面',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    lang: 'ja',
    // 生成アイコン（app/icon.tsx）の 512px PNG を参照する。favicon.ico は
    // ブラウザタブ用に Next が自動リンクするのでマニフェストには含めない
    // （.ico をマニフェストアイコンにすると Chrome が不正画像として警告するため）。
    icons: [{ src: '/icon', sizes: '512x512', type: 'image/png' }],
  };
}
