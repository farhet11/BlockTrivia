import type { Metadata } from "next";
import Script from "next/script";
import { Outfit, Inter, Lora, JetBrains_Mono } from "next/font/google";
import { Providers } from "./_components/providers";
import { BgController } from "./_components/bg-controller";
import { FeedbackButton } from "./_components/feedback-button";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: "BlockTrivia",
  description:
    "Real-time trivia for Web3 communities. Surface your most knowledgeable members.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${inter.variable} ${lora.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh bg-background text-foreground font-sans antialiased">
        {/* Suppress next-themes React 19 script-tag warning before hydration */}
        <Script id="suppress-next-themes-warning" strategy="beforeInteractive">{`(function(){var e=console.error.bind(console);console.error=function(){if(arguments[0]&&String(arguments[0]).indexOf('Encountered a script tag')!==-1)return;e.apply(console,arguments)};})();`}</Script>
        <Providers>
          <BgController />
          <main style={{ position: "relative", zIndex: 2 }}>
            {children}
          </main>
          <FeedbackButton />
        </Providers>
      </body>
    </html>
  );
}
