'use client';
//import { useState } from "react";
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

          <div className="w-full sm:w-[calc(50%-0.75rem)] mr-auto flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">ชื่อเล่น</label>
            <input type="text" placeholder="ชื่อเล่น" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full sm:w-[calc(50%-0.75rem)] flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">เพศ</label>
            <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base">
              <option value="">เลือกเพศของคุณ</option>
              <option value="male">ชาย</option>
              <option value="female">หญิง</option>
            </select>
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">วันเกิด</label>
            <input type="text" placeholder="วัน / เดือน / ปี" className="w-full px-4 py-3 border border-gray-200 rounded-xl" />
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">อีเมล</label>
            <input type="email" placeholder="ระบุอีเมล" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full sm:w-[calc(50%-0.75rem)] mr-auto flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">รหัสผ่าน</label>
            <input type="password" placeholder="รหัสผ่าน" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full sm:w-[calc(50%-0.75rem)] flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">ยืนยันรหัสผ่าน</label>
            <input type="password" placeholder="ยืนยันรหัสผ่าน" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">หมายเลขโทรศัพท์มือถือ</label>
            <input type="text" placeholder="ระบุหมายเลขโทรศัพท์มือถือ" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">อีเมลผู้ปกครอง</label>
            <input type="email" placeholder="ระบุอีเมลผู้ปกครอง" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
          </div>

          <div className="w-full flex flex-col space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">หมายเลขโทรศัพท์ผู้ปกครอง</label>
            <input type="text" placeholder="ระบุหมายเลขโทรศัพท์ผู้ปกครอง" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
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