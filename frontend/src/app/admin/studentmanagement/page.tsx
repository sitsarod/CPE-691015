"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Eye } from "lucide-react";

// Import Reusable Components ที่เราทำไว้
import StatusBadge from "@/components/StatusBadge";
import SearchInput from "@/components/SearchInput";
import DataTable, { Column } from "@/components/DataTable";

// อินเทอร์เฟซตัวอย่างสำหรับข้อมูลนักเรียน
export interface Student {
  id: number;
  student_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: "active" | "inactive" | "suspended";
  created_at: string;
}

export default function StudentManagementPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadStudents = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("token");
      if (!token) return;

      // TODO: เปลี่ยนเป็น API ดึงข้อมูลนักเรียนของคุณ เช่น fetchAllStudents(token)
      // const data = await fetchAllStudents(token);
      // setStudents(data);
      
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลนักเรียน");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("คุณต้องการลบข้อมูลนักเรียนคนนี้ใช่หรือไม่?")) return;
    try {
      // TODO: เรียก API ลบข้อมูลนักเรียน
      // await deleteStudent(id, token);
      alert("ลบข้อมูลสำเร็จ");
      loadStudents();
    } catch (err: unknown) {
      alert("ไม่สามารถลบข้อมูลได้");
    }
  };

  // กรองค้นหาด้วย รหัสนักเรียน, ชื่อ, นามสกุล, หรือ อีเมล
  const filteredStudents = students.filter(
    (student) =>
      student.student_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // กำหนด Columns สำหรับ DataTable
  const columns: Column<Student>[] = [
    {
      header: "รหัสนักเรียน",
      className: "font-semibold text-gray-900",
      render: (item) => item.student_code || "-",
    },
    {
      header: "ชื่อ - นามสกุล",
      render: (item) => (
        <div>
          <div className="font-semibold text-gray-900">
            {item.first_name} {item.last_name}
          </div>
          <div className="text-xs text-gray-500">{item.email}</div>
        </div>
      ),
    },
    {
      header: "เบอร์โทรศัพท์",
      className: "text-sm text-gray-600",
      render: (item) => item.phone || "-",
    },
    {
      header: "วันที่ลงทะเบียน",
      className: "text-sm text-gray-600",
      render: (item) =>
        item.created_at
          ? new Date(item.created_at).toLocaleDateString("th-TH")
          : "-",
    },
    {
      header: "สถานะ",
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      header: "จัดการ",
      headerClassName: "text-center",
      className: "text-center",
      render: (item) => (
        <div className="flex items-center justify-center gap-2">
          {/* ปุ่มดูรายละเอียด */}
          <button
            onClick={() => /* TODO: เปิด Modal หรือ ไปหน้ารายละเอียด */ {}}
            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="ดูรายละเอียด"
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* ปุ่มแก้ไข */}
          <button
            onClick={() => /* TODO: เปิด Modal หรือ ไปหน้าแก้ไข */ {}}
            className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
            title="แก้ไข"
          >
            <Edit className="w-4 h-4" />
          </button>

          {/* ปุ่มลบ */}
          <button
            onClick={() => handleDelete(item.id)}
            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="ลบ"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">จัดการข้อมูลนักเรียน</h1>
          <p className="text-gray-500 mt-1">
            ดูรายชื่อ แก้ไขข้อมูล และจัดการสถานะนักเรียนทั้งหมดในระบบ
          </p>
        </div>

        {/* ปุ่มเพิ่มนักเรียนใหม่ */}
        <button
          onClick={() => /* TODO: เปิด Modal เพิ่มนักเรียน */ {}}
          className="flex items-center gap-2 px-4 py-2 bg-[#CC0000] text-white font-bold text-sm rounded-lg hover:bg-red-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          เพิ่มนักเรียนใหม่
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex justify-between items-center mb-6">
        <SearchInput
          placeholder="ค้นหาชื่อ, รหัสนักเรียน, อีเมล..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-[320px]"
        />
      </div>

      {/* Reusable Data Table */}
      <DataTable
        columns={columns}
        data={filteredStudents}
        isLoading={isLoading}
        emptyText="ไม่พบข้อมูลนักเรียน"
        keyExtractor={(item) => item.id}
      />
    </div>
  );
}