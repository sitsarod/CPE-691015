import type { Metadata } from "next";
import "./globals.css";
import Navbar from "../components/Navbar";
<<<<<<< HEAD
import ChatWidget from "../components/ChatWidget";
=======
import SessionGuard from "../components/SessionGuard";
>>>>>>> ce0e3c4142bc366203f55bcad4cd24b4b10bba36

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
        <SessionGuard />
        <Navbar />

        <main className="w-full flex-1 block clear-both">
          {children}
        </main>
        
        {/* Global Floating Chat Widget */}
        <ChatWidget />
      </body>
    </html>
  );
}