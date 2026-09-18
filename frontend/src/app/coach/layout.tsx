// app/coach/layout.tsx
import CoachSidebar from "@/components/CoachSidebar";
import CoachTopbar from "@/components/CoachTopbar";
import RoleGuard from "@/components/RoleGuard";

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={["coach"]}>
      <div className="min-h-screen bg-white font-sans">

        <CoachTopbar />
        <CoachSidebar />

        <div className="flex flex-col min-h-screen pt-24 pb-[calc(72px+env(safe-area-inset-bottom))] pl-0 md:pb-0 md:pl-[84px]">

          <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-white">
            {children}
          </main>

        </div>
      </div>
    </RoleGuard>
  );
}
