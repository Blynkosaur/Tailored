import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Inconsolata, Shizuru, Coming_Soon } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inconsolata = Inconsolata({
  variable: "--font-inconsolata",
  subsets: ["latin"],
});

const shizuru = Shizuru({
  variable: "--font-shizuru",
  weight: "400",
  subsets: ["latin"],
});

const comingSoon = Coming_Soon({
  variable: "--font-coming-soon",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tailored - Cover Letter Generator",
  description: "Generate personalized cover letters in seconds",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inconsolata.variable} ${shizuru.variable} ${comingSoon.variable} antialiased font-sans`}
      >
        <main>{children}</main>
        <SpeedInsights />
        <Toaster />
      </body>
    </html>
  );
}
