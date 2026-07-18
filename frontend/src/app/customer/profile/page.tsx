"use client";

import React, { useEffect, useState } from 'react';

export default function QRCheckInPage() {
  const [firstName, setFirstName] = useState<string>("นักเรียน");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full text-center border border-gray-100 flex flex-col items-center">
        
        <h1 className="text-2xl font-bold text-gray-900 mb-2"> บัตรเช็กชื่อ Example !!!!!! </h1>
        <p className="text-sm text-gray-500 mb-6">สวัสดีคัปคุณ {firstName}</p>
        

        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-4 shadow-inner flex items-center justify-center min-w-[240px] min-h-[240px]">
          {qrCodeUrl ? (
            <img 
              src={qrCodeUrl} 
              alt="QR Code สำหรับเช็กชื่อ"
              className="w-[220px] h-[220px] object-contain"
              style={{ height: 'auto', width: 'auto' }} 
            />
          ) : (
            <div className="text-sm text-gray-400 text-center p-4">
              ไม่พบข้อมูลอีเมล <br />กรุณาลองเข้าสู่ระบบใหม่อีกครั้งคัป
            </div>
          )}
        </div>

        <div className="bg-orange-50 text-orange-700 px-4 py-2.5 rounded-xl text-xs font-semibold mb-6">
          เปิดหน้าจอนี้ให้เครื่องสแกนหน้าสนามเพื่อเช็กชื่อเข้าเรียน
        </div>
        
      </div>
    </div>
  );
}