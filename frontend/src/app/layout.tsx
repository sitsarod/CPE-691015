import type { Metadata } from "next";
import "./globals.css";
import Navbar from "../components/Navbar";

export const metadata: Metadata = {
  title: "ระบบบริหารจัดการสถานฝึกสอนแบดมินตัน",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth" data-scroll-behavior="smooth">
      <body className="min-h-screen flex flex-col bg-[#F3F4F6] font-sans">
        <Navbar />

        <main className="w-full flex-1 block clear-both">
          {children}
        </main>
      </body>
    </html>
  );
}