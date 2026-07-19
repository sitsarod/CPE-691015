"use client";

import React, { useEffect, useState } from 'react';
import Button from '@/components/Button';

export default function QRInPage() {
  const [firstName, setFirstName] = useState<string>("นักเรียน");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
   
    const savedName = localStorage.getItem("firstName");
    const savedEmail = localStorage.getItem("email");

    if (savedName) setFirstName(savedName);

    if (savedEmail) {
      const qrValue = `QR_${savedEmail}`;
   
      const generatedUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrValue)}`;
      setQrCodeUrl(generatedUrl);
    } else {
   
      setQrCodeUrl(null);
    }
  }, []);

return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-gray-50 flex items-center justify-center p-4 md:p-8">
      
      {/* 🌟 ขยายขนาดความกว้างของการ์ดหลักให้ใหญ่เต็มตาขึ้น (ปรับจาก max-w-4xl เป็น max-w-5xl) */}
      <div className="bg-white w-full max-w-5xl p-10 md:p-16 rounded-3xl shadow-sm text-left">

        

        {/* 🌟 3. ขยายข้อมูลเนื้อหาการ์ดใบรับเช็กชื่อด้านล่างให้ตัวใหญ่คมชัดขึ้น */}
        <div className="space-y-2 mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900"> บัตรเช็กชื่อ Example !!!!!! </h1>
          <p className="text-base md:text-lg text-gray-500 font-medium">สวัสดีคัปคุณ {firstName}</p>
        </div>

        
        {/* 🌟 4. ขยายขนาดกล่องคิวอาร์โค้ดด้านล่างให้ใหญ่เด่นชัดเจนเต็มสัดส่วนการ์ดใหม่ */}
        <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 mb-8 shadow-inner flex items-center justify-center min-w-[300px] min-h-[300px] mx-auto max-w-[340px]">
          {qrCodeUrl ? (
            <img 
              src={qrCodeUrl} 
              alt="QR Code สำหรับเช็กชื่อ"
              className="w-[280px] h-[280px] object-contain"
              style={{ height: 'auto', width: 'auto' }} 
            />
          ) : (
            <div className="text-base text-gray-400 text-center p-6">
              ไม่พบข้อมูลอีเมล <br />กรุณาลองเข้าสู่ระบบใหม่อีกครั้งคัป
            </div>
          )}
        </div>

        {/* แถบสีส้มด้านล่างสุด */}
        <div className="bg-orange-50 text-orange-700 px-6 py-4 rounded-xl text-sm font-bold mb-6 text-center shadow-xs">
          เปิดหน้าจอนี้ให้เครื่องสแกนหน้าสนามเพื่อเช็กชื่อเข้าเรียน
        </div>
        
      </div>
    </div>
  );
}