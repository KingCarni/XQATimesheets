import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MyHourVault — Your Hours. Accounted For.",
    template: "%s · MyHourVault",
  },
  description:
    "Track hours, approve timesheets, manage time off, and understand where your team's time goes.",
  applicationName: "MyHourVault",
  openGraph: {
    title: "MyHourVault — Your Hours. Accounted For.",
    description:
      "Track hours, approve timesheets, manage time off, and understand where your team's time goes.",
    siteName: "MyHourVault",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
