// app/coach/layout.tsx
import CoachSidebar from "@/components/CoachSidebar";
import CoachTopbar from "@/components/CoachTopbar";

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans">

      <CoachTopbar />
      <CoachSidebar />

      <div className="flex flex-col min-h-screen pt-24 pl-[84px]">

        <main className="flex-1 p-8 bg-white">
          {children}
        </main>

      </div>
    </div>
  );
}
