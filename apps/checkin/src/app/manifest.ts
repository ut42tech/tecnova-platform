import type { MetadataRoute } from 'next';

// iPad のホーム画面に追加できる PWA として最低限必要なマニフェスト。
// 名前・アイコン・display: 'standalone' があれば「Add to Home Screen」後に
// Safari クロムなしのフルスクリーン起動になる。アイコンは app/icon.tsx と
// app/apple-icon.tsx でプログラム生成し、別途 PNG ファイルは置かない。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'テクノバながさき チェックイン',
    short_name: 'テクノバ',
    description: 'テクノバながさきの来場チェックイン用 iPad アプリ',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    lang: 'ja',
    icons: [
      {
        src: '/favicon.ico',
        sizes: '192x192',
        type: 'image/x-icon',
      },
    ],
  };
}
