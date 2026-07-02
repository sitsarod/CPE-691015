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
      <body className="min-h-screen flex flex-col">
        <Navbar />

        <main>
          {children}
        </main>
      </body>
    </html>
  );
}