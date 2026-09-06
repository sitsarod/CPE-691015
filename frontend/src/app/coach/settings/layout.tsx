import SettingsSidebar from "@/components/settings/SettingsSidebar";

// โครงเดียวกับหน้าตั้งค่าของฝั่งผู้เรียน ต่างแค่ base path ของเมนู
export default function CoachSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full bg-white text-gray-900 flex flex-col md:flex-row font-sans">
      <SettingsSidebar basePath="/coach/settings" />

      <div className="flex-1 flex flex-col">
        <main className="flex-1 p-6 md:p-10 bg-white overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
