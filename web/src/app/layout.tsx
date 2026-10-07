import type { Metadata } from "next";
import Image from "next/image";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { MobileNav, Sidebar } from "@/components/Sidebar";
import { data } from "@/lib/data";
import { dateLabel, num } from "@/lib/format";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Hamina RevOps · Revenue forecast (demo)",
  description:
    "Demo revenue-forecasting workspace built on synthetic Stripe + HubSpot data, prepared for Hamina Wireless.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const { meta } = data;
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <Suspense fallback={<div className="hidden w-60 shrink-0 lg:block" />}>
            <Sidebar />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur-sm">
              <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-2 lg:hidden">
                  <Image src="/hamina-logo.svg" alt="Hamina" width={88} height={22} priority />
                </div>
                <div className="hidden items-center gap-2 text-sm text-gray-500 lg:flex">
                  <span className="font-medium text-gray-900">Revenue forecast</span>
                  <span className="text-gray-300">/</span>
                  <span>Stripe + HubSpot</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="hidden items-center gap-1.5 rounded-full bg-warning-bg px-2.5 py-1 text-[11px] font-semibold text-warning-text sm:inline-flex">
                    <span className="uppercase tracking-wider">Demo</span>
                    <span className="font-medium normal-case tracking-normal">· synthetic data · prepared for Hamina</span>
                  </span>
                  <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning-text sm:hidden">
                    Demo
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-white px-2.5 py-1 text-xs text-gray-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                    Data as of <strong className="font-semibold text-gray-900">{dateLabel(meta.asOf)}</strong>
                  </span>
                </div>
              </div>
              <Suspense fallback={<div className="h-[45px] border-b border-gray-100 lg:hidden" />}>
                <MobileNav />
              </Suspense>
            </header>
            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </main>
            <footer className="border-t border-gray-100 px-4 py-4 text-xs text-gray-400 sm:px-6 lg:px-8">
              Demo built on synthetic data · {num(meta.simulations)} Monte Carlo simulations · horizon to{" "}
              {meta.horizonEnd} · generated {meta.generatedAt.slice(0, 16).replace("T", " ")} UTC · not affiliated
              with Hamina Wireless.
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
