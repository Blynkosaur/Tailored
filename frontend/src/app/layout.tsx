import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Playfair_Display, Roboto } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  weight: "700",
  subsets: ["latin"],
});

const roboto = Roboto({
  variable: "--font-roboto",
  weight: "300",
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
        className={`${playfairDisplay.variable} ${roboto.variable} antialiased font-sans`}
      >
        <main>{children}</main>
        <SpeedInsights />
        <Toaster />
      </body>
    </html>
  );
}
