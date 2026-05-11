import type { Metadata } from 'next';
import { Roboto_Flex, Roboto_Mono } from 'next/font/google';
import './globals.css';

const sans = Roboto_Flex({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = Roboto_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Wyrd Console — execution tracer for AI agents',
  description: 'Trace, inspect, and replay every LLM call and tool invocation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
