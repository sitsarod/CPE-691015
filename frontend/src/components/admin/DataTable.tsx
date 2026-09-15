import React from "react";

export interface Column<T> {
  header: string;
  className?: string;
  render: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  isLoading: boolean;
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string | number;
  emptyMessage?: string;
  totalCount?: number;
}

export function DataTable<T>({
  isLoading,
  data,
  columns,
  keyExtractor,
  emptyMessage = "ไม่พบข้อมูลในระบบ",
  totalCount,
}: DataTableProps<T>) {
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead>
            <tr className="bg-gray-50/70 text-[13px] font-bold text-gray-700">
              {columns.map((col, idx) => (
                <th key={idx} className={`px-6 py-4 whitespace-nowrap ${col.className || ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              // แถวจำลองตอนโหลด — จำนวนคอลัมน์เท่าของจริง ตารางจึงไม่กระโดดตอนข้อมูลมาถึง
              // เดิมเป็นไอคอนหมุนแถวเดียวกลางตาราง
              <>
                {Array.from({ length: 5 }).map((_, r) => (
                  <tr key={r} className="animate-pulse">
                    {columns.map((_c, i) => (
                      <td key={i} className="px-6 py-4">
                        <div
                          className="h-4 rounded bg-gray-200"
                          style={{ width: i === 0 ? "60%" : i === columns.length - 1 ? "24px" : "45%" }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-20 text-center text-gray-400 font-normal">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr key={keyExtractor(item)} className="transition-colors hover:bg-gray-50/50">
                  {columns.map((col, idx) => (
                    <td key={idx} className={`px-6 py-4 whitespace-nowrap align-middle ${col.className || ""}`}>
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && data.length > 0 && totalCount !== undefined && (
        <div className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">
          แสดง {data.length} จาก {totalCount} รายการ
        </div>
      )}
    </div>
  );
}