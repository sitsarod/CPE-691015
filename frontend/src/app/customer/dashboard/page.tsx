// app/admin/dashboard/page.tsx
'use client'; 

import { useState } from "react";

export default function AdminDashboard() {

  const [activeMenu, setActiveMenu] = useState("Overview");

  const menus = ["Overview", "Courses", "Coaches", "Customers", "Settings"];

  return (
    <div className="min-h-screen bg-gray-100 flex font-sans text-gray-800">
        <h2 className="text-4xl font-bold text-gray-800">ลูกค้า (Customers)</h2>


    </div>
  );
}