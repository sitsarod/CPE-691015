"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, QrCode, AlertCircle } from "lucide-react";
import Button from "@/components/Button";
import { getMyQRAPI, PersonalQR } from "@/services/personalQrAPI";

/** ขนาดการ์ดที่ดาวน์โหลด (พิกเซล) — อัตราส่วนใกล้เคียงบัตรแนวตั้ง พิมพ์บน A6 ได้พอดี */
const CARD_W = 660;
const CARD_H = 900;

const ROLE_LABEL: Record<string, string> = {
  customer: "บัตรประจำตัวนักเรียน",
  coach: "บัตรประจำตัวผู้ฝึกสอน",
};

/**
 * PersonalQRCard แสดง QR ประจำตัวของผู้ใช้ที่ล็อกอินอยู่ พร้อมปุ่มดาวน์โหลดเป็นการ์ด PNG
 *
 * ใช้ได้ทั้งหน้าโปรไฟล์นักเรียนและโปรไฟล์โค้ช เพราะ endpoint /me/qr
 * แยกบทบาทให้เองจาก JWT — component นี้ไม่ต้องรู้ว่ากำลังแสดงของใคร
 *
 * ดึงข้อมูลสดจาก API ทุกครั้งที่ mount ไม่อ่านจาก localStorage
 * เพื่อให้ล้าง cache หรือเปลี่ยนเครื่องแล้วยังเห็น QR ได้โดยไม่ต้อง login ใหม่
 */
export default function PersonalQRCard({ className = "" }: { className?: string }) {
  const [qr, setQr] = useState<PersonalQR | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await getMyQRAPI();
        if (!cancelled) setQr(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "ไม่สามารถโหลด QR ประจำตัวได้");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * วาดการ์ดลง canvas แล้วสั่งดาวน์โหลดเป็น PNG
   *
   * วาดเองแทนการเซฟรูป QR ดิบ ๆ เพื่อให้มีชื่อกำกับอยู่บนบัตร
   * เวลาปรินต์ออกมาหลายใบจะได้ไม่สับสนว่าใบไหนของใคร
   */
  const handleDownload = useCallback(async () => {
    if (!qr) return;
    setIsDownloading(true);

    try {
      const img = new Image();
      img.src = qr.qrImage;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("โหลดรูป QR ไม่สำเร็จ"));
      });

      const canvas = document.createElement("canvas");
      canvas.width = CARD_W;
      canvas.height = CARD_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("เบราว์เซอร์นี้ไม่รองรับการสร้างรูปภาพ");

      // พื้นหลังขาว — จำเป็นสำหรับการปรินต์ ถ้าโปร่งใสจะกลายเป็นดำในโปรแกรมบางตัว
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CARD_W, CARD_H);

      // แถบหัวบัตร
      ctx.fillStyle = "#E63946";
      ctx.fillRect(0, 0, CARD_W, 110);

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "bold 34px 'Noto Sans Thai', 'Sarabun', sans-serif";
      ctx.fillText(ROLE_LABEL[qr.role] ?? "บัตรประจำตัว", CARD_W / 2, 70);

      // กรอบนอกของบัตร
      ctx.strokeStyle = "#e5e5e5";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, CARD_W - 2, CARD_H - 2);

      // รูป QR วางกลางบัตร
      const qrSize = 380;
      const qrX = (CARD_W - qrSize) / 2;
      const qrY = 175;
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

      // กรอบบาง ๆ รอบ QR ให้ขอบเขตชัดตอนสแกน
      ctx.strokeStyle = "#d8d8d8";
      ctx.lineWidth = 1;
      ctx.strokeRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);

      // ชื่อ-นามสกุล
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "bold 38px 'Noto Sans Thai', 'Sarabun', sans-serif";
      ctx.fillText(qr.displayName || "-", CARD_W / 2, qrY + qrSize + 90);

      // ชื่อเล่น
      if (qr.nickname) {
        ctx.fillStyle = "#6b6b6b";
        ctx.font = "28px 'Noto Sans Thai', 'Sarabun', sans-serif";
        ctx.fillText(`(${qr.nickname})`, CARD_W / 2, qrY + qrSize + 138);
      }

      // รหัสดิบ เผื่อเครื่องสแกนเสียแล้วต้องกรอกมือ
      ctx.fillStyle = "#9a9a9a";
      ctx.font = "20px 'Courier New', monospace";
      ctx.fillText(qr.code, CARD_W / 2, CARD_H - 52);

      // ตั้งชื่อไฟล์จากชื่อเล่นเพื่อให้หาเจอง่ายในโฟลเดอร์ดาวน์โหลด
      // ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ออก (คงอักษรไทยและอังกฤษไว้)
      const safeName = (qr.nickname || qr.displayName || "qr")
        .replace(/[\\/:*?"<>|]/g, "")
        .trim()
        .replace(/\s+/g, "-");

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `QR-${safeName}.png`;
      link.click();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setIsDownloading(false);
    }
  }, [qr]);

  if (isLoading) {
    return (
      <div className={`rounded-2xl border border-gray-200 bg-white p-6 ${className}`}>
        <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">กำลังโหลด QR ประจำตัว...</span>
        </div>
      </div>
    );
  }

  if (errorMsg || !qr) {
    return (
      <div className={`rounded-2xl border border-gray-200 bg-white p-6 ${className}`}>
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-amber-800">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold">ยังแสดง QR ประจำตัวไม่ได้</p>
            <p className="mt-1 text-xs">{errorMsg || "ไม่พบข้อมูล QR"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-6 shadow-xs ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        <QrCode className="h-5 w-5 text-[#E63946]" />
        <h2 className="text-lg font-bold text-gray-900">QR ประจำตัว</h2>
      </div>

      <p className="mb-5 text-sm text-gray-500">
        ใช้สแกนตอนเช็คชื่อ เก็บไว้กับตัวและอย่าส่งต่อให้คนอื่น
        เพราะใครถือ QR นี้ก็เช็คชื่อแทนคุณได้
      </p>

      <div className="flex flex-col items-center gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.qrImage} alt="QR ประจำตัว" width={220} height={220} className="block" />
        </div>

        <div className="text-center">
          <p className="font-bold text-gray-900">{qr.displayName || "-"}</p>
          {qr.nickname && <p className="text-sm text-gray-500">({qr.nickname})</p>}
          <p className="mt-2 font-mono text-xs break-all text-gray-400">{qr.code}</p>
        </div>

        <Button
          variant="primary"
          onClick={handleDownload}
          disabled={isDownloading}
          className="!w-fit bg-[#E63946] px-5 hover:bg-[#d62839]"
        >
          <span className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            {isDownloading ? "กำลังสร้างไฟล์..." : "ดาวน์โหลดบัตร QR"}
          </span>
        </Button>
      </div>
    </div>
  );
}
