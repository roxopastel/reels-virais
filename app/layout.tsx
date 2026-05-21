import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * Inter is the closest open-source equivalent to Apple's SF Pro — the font
 * Instagram actually uses inside its iOS app. By loading it explicitly we
 * guarantee identical text rendering on Windows / Linux / mobile browsers
 * where SF Pro is not available.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gerador de Conversas Instagram",
  description: "Gere vídeos de conversas falsas no estilo Instagram DM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className={`${inter.className} min-h-screen bg-[#050505] text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
