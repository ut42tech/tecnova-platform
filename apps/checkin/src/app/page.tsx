import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-3xl font-bold">テクノバながさき チェックイン</h1>
      <Link
        href="/first-time"
        className="rounded-lg bg-blue-600 px-8 py-4 text-xl font-semibold text-white"
      >
        初めての方はこちら
      </Link>
    </main>
  );
}
