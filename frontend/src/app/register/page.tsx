'use client';
//improt { useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";

export default function RegisterPage() {


  return (

    <div className="w-full min-h-[calc(100vh-96px)] bg-gray-50 flex items-center justify-center p-4 md:p-8">
      

      <div className="bg-white w-full max-w-3xl p-8 md:p-12 rounded-3xl shadow-md">
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">KOYAMA</h1>
        <p className="text-sm text-gray-500 mb-8">สร้างบัญชีใหม่เพื่อเริ่มต้นใช้งานระบบของคุณ</p>

        <form className="flex flex-row flex-wrap w-full gap-y-5 text-left">
          

          <div className="w-full sm:w-[calc(50%-0.75rem)] mr-auto flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">ชื่อ</label>
            <input type="text" placeholder="ชื่อจริง" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>


          <div className="w-full sm:w-[calc(50%-0.75rem)] flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">นามสกุล</label>
            <input type="text" placeholder="นามสกุล" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>


          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">วันเกิด</label>
            <input type="text" placeholder="วัน / เดือน / ปี" className="w-full px-4 py-3 border border-gray-200 rounded-xl" />
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">เพศ</label>
            <input type="text" placeholder="เลือกเพศของคุณ" className="w-full px-4 py-3 border border-gray-200 rounded-xl" />
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">หมายเลขโทรศัพท์มือถือหรืออีเมล</label>
            <input type="text" placeholder="ระบุเบอร์โทรศัพท์หรืออีเมล" className="w-full px-4 py-3 border border-gray-200 rounded-xl" />
          </div>


          <div className="flex justify-end space-x-3 w-full mt-6 pt-4 border-t border-gray-100">
            <Button variant="outline" type="button" onClick={() => window.history.back()}>
              ยกเลิก
            </Button>
            <Button variant="secondary" type="submit">
              สร้างบัญชีใหม่
            </Button>
          </div>

        </form>

      </div>
    </div>
  );
}