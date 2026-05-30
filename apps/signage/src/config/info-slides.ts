// 巡回スライド用の静的設定。データ駆動でない値だけをここに置く。

// 公式 Instagram のハンドル（先頭の @ は付けない）。
export const INSTAGRAM_HANDLE = 'tecnovanagasaki';

// 上記から組み立てる公式 Instagram の URL（QR・リンク用）。
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;

// プロフィールアイコン（正方形画像）を public に置いてパスを設定すると、フォローカードの
// アバターに使われる（例: '/instagram-avatar.png'）。null のときはブランドアイコンで代用。
export const INSTAGRAM_AVATAR: string | null = null;
