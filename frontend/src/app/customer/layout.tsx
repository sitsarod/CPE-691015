// app/customer/layout.tsx
import CustomerSidebar from "@/components/CustomerSidebar";
import CustomerTopbar from "@/components/CustomerTopbar";
import RoleGuard from "@/components/RoleGuard";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={["customer"]}>
      <div className="min-h-screen bg-white font-sans">

        <CustomerTopbar />
        <CustomerSidebar />

        <div className="flex flex-col min-h-screen pt-24 pl-[84px]">

          <main className="flex-1 p-8 bg-white">
            {children}
          </main>

        </div>
      </div>
    </RoleGuard>
  );
}