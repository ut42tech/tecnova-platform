import type { MetadataRoute } from 'next';

// 壁掛けモニター向け。display:'fullscreen' + orientation:'landscape' が最も強いキオスク表示。
// アイコンは省略（--kiosk 起動では PWA インストール不要）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'テクノバながさき サイネージ',
    short_name: 'サイネージ',
    description: 'テクノバながさきの会場サイネージ表示',
    start_url: '/',
    display: 'fullscreen',
    orientation: 'landscape',
    // 配信レイアウトの明るい地に合わせる（スプラッシュ＝sky-50、テーマ＝sky-500）。
    background_color: '#f0f9ff',
    theme_color: '#0ea5e9',
    lang: 'ja',
  };
}
