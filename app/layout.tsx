import type { Metadata } from 'next';
import './globals.css';
import './game.css';
import './revision.css';
import './iteration-three.css';
import './immersion.css';
import './map-stage.css';
import './explorer-ui.css';
import './lobby.css';

export const metadata: Metadata = {
  title: '预兆之屋 · 四个午夜故事',
  description:
    '探索黑松岭宅邸，指挥 3–6 人探险队，体验包含血月狼人在内的四个原创惊魂剧本，支持单人与局域网试玩。',
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
