import EditSidebar from './_components/EditSidebar';

export default function SettingLayout({ children }: { children: React.ReactNode }) {
  return (

    <div className="w-full bg-white text-gray-900 flex flex-row font-sans">
      

      <EditSidebar /> 


      <div className="flex-1 flex flex-col">
        
        <main className="flex-1 p-6 md:p-10 bg-white overflow-y-auto">
          {children}
        </main>

      </div>
    </div>
  );
}