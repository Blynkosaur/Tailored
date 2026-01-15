import type { Metadata } from "next";
import { Comfortaa, Shizuru } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin"],
});

const shizuru = Shizuru({
  variable: "--font-shizuru",
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
        className={`${comfortaa.variable} ${shizuru.variable} antialiased font-sans`}
      >
        <main>{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
