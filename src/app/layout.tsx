import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { BgController } from "./_components/bg-controller";
import { FeedbackButton } from "./_components/feedback-button";
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
          <BgController />
          <main style={{ position: "relative", zIndex: 2 }}>
            {children}
          </main>
          <FeedbackButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
