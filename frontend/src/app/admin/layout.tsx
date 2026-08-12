// app/admin/layout.tsx
import AdminSideBar from "@/components/AdminSideBar";
import AdminTopBar from "@/components/AdminTopBar";
import RoleGuard from "@/components/RoleGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={["admin"]}>
      <div className="min-h-screen bg-white font-sans">

        <AdminTopBar />
        <AdminSideBar />

        <div className="flex flex-col min-h-screen pt-24 pb-24 pl-0 md:pb-0 md:pl-[84px]">

          <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-white">
            {children}
          </main>

        </div>
      </div>
    </RoleGuard>
  );
}