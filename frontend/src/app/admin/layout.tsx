// app/customer/layout.tsx
import AdminSideBar from "@/components/AdminSideBar";
import AdminTopBar from "@/components/AdminTopBar";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans">
      
      <AdminTopBar />
      <AdminSideBar />

      <div className="flex flex-col min-h-screen pt-24 pl-[84px]">
        
        <main className="flex-1 p-8 bg-white">
          {children}
        </main>

      </div>
    </div>
  );
}