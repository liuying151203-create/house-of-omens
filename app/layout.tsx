import type { Metadata } from 'next';
import './globals.css';
import './game.css';
import './revision.css';
import './iteration-three.css';
import './immersion.css';

export const metadata: Metadata = {
  title: '山屋惊魂 · 三个午夜故事',
  description:
    '探索黑松岭宅邸，指挥 3–6 人探险队，体验三个原创惊魂剧本的单人试玩游戏。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body>{children}</body>
    </html>
  );
}

