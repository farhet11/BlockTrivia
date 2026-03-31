import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { BlockPatternBg } from "@/components/ui/block-pattern-bg";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "BlockTrivia",
  description:
    "Real-time trivia for Web3 communities. Surface your most knowledgeable members.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={outfit.variable}>
      <body className="min-h-dvh bg-background text-foreground font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true}>
          <BlockPatternBg />
          <main style={{ position: "relative", zIndex: 2 }}>
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
