import SettingsSidebar from "@/components/settings/SettingsSidebar";

export default function SettingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full bg-white text-gray-900 flex flex-col md:flex-row font-sans">
      <SettingsSidebar basePath="/customer/settings" />

      <div className="flex-1 flex flex-col">
        <main className="flex-1 p-6 md:p-10 bg-white overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
