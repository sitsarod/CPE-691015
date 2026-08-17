"use client";

import React, { useState } from "react";
import { Landmark, ShieldAlert } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import InputField from "@/components/InputField";
import { updateCoachBankAccountAPI } from "@/services/coachAPI";

/**
 * ส่วนแก้ข้อมูลบัญชีรับเงินของโค้ช
 *
 * แยกออกมาจากฟอร์มโปรไฟล์หลักโดยตั้งใจ เพราะสองอย่างนี้เสี่ยงไม่เท่ากัน
 * เบอร์โทรกรอกผิดแล้วแก้ใหม่ได้ แต่เลขบัญชีผิดหรือถูกคนอื่นเปลี่ยน
 * = เงินเดือนเข้ากระเป๋าคนอื่น และกว่าจะรู้ตัวก็สิ้นเดือนแล้ว
 *
 * การกดบันทึกจึงต้องผ่าน modal ยืนยันรหัสผ่านก่อนเสมอ (step-up authentication)
 * ถ้ารวมไว้ในฟอร์มเดียวกับเบอร์โทร คนจะต้องกรอกรหัสผ่านทุกครั้งที่แก้อะไรก็ตาม
 * ซึ่งกวนจนสุดท้ายมักจบที่ยกเลิกการยืนยันทิ้งทั้งหมด
 */
interface Props {
  coachId: number;
  initialBankAccount: string;
  initialPaymentInfo: string;
}

export default function CoachBankAccountCard({
  coachId,
  initialBankAccount,
  initialPaymentInfo,
}: Props) {
  // ค่าที่บันทึกลงฐานแล้วจริง ๆ ใช้เทียบว่ามีอะไรเปลี่ยนไหม และใช้ย้อนค่าตอนกดยกเลิก
  const [saved, setSaved] = useState({
    bankAccount: initialBankAccount,
    paymentInfo: initialPaymentInfo,
  });

  const [draft, setDraft] = useState({
    bankAccount: initialBankAccount,
    paymentInfo: initialPaymentInfo,
  });

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isDirty =
    draft.bankAccount !== saved.bankAccount || draft.paymentInfo !== saved.paymentInfo;

  const closeConfirm = () => {
    setIsConfirmOpen(false);
    // ล้างรหัสผ่านออกจาก state ทันทีที่ปิด ไม่เก็บค้างไว้ใน memory นานเกินจำเป็น
    setPassword("");
    setError(null);
  };

  const handleReset = () => {
    setDraft({ bankAccount: saved.bankAccount, paymentInfo: saved.paymentInfo });
    setNotice(null);
  };

  const handleConfirm = async () => {
    if (!password) {
      setError("กรุณากรอกรหัสผ่านเพื่อยืนยัน");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updated = await updateCoachBankAccountAPI(coachId, {
        currentPassword: password,
        bank_account: draft.bankAccount,
        payment_info: draft.paymentInfo,
      });

      // ยึดค่าที่ backend ตอบกลับเป็นความจริง ไม่ใช่ค่าที่พิมพ์ไว้ในฟอร์ม
      const next = {
        bankAccount: updated.bank_account ?? draft.bankAccount,
        paymentInfo: updated.payment_info ?? draft.paymentInfo,
      };
      setSaved(next);
      setDraft(next);

      closeConfirm();
      setNotice("บันทึกข้อมูลบัญชีรับเงินเรียบร้อยแล้ว");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถบันทึกข้อมูลได้");
      setPassword("");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-red-50 flex-shrink-0">
            <Landmark className="w-6 h-6 text-[#CC0000]" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900">บัญชีรับเงิน</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              ปลายทางที่โรงเรียนโอนค่าจ้างให้ท่าน การเปลี่ยนข้อมูลนี้ต้องยืนยันรหัสผ่านทุกครั้ง
            </p>

            {notice && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">
                {notice}
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                label="เลขบัญชีธนาคาร"
                name="bankAccount"
                value={draft.bankAccount}
                onChange={(e) => {
                  setDraft((prev) => ({ ...prev, bankAccount: e.target.value }));
                  setNotice(null);
                }}
                placeholder="ระบุเลขบัญชี"
              />
              <InputField
                label="ข้อมูลการจ่ายเงิน (ชื่อธนาคาร / ชื่อบัญชี)"
                name="paymentInfo"
                value={draft.paymentInfo}
                onChange={(e) => {
                  setDraft((prev) => ({ ...prev, paymentInfo: e.target.value }));
                  setNotice(null);
                }}
                placeholder="เช่น ธนาคารกสิกรไทย / สมชาย ใจดี"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex flex-wrap items-center justify-end gap-3">
        {isDirty && (
          <span className="mr-auto text-xs text-amber-700 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4" />
            มีการแก้ไขที่ยังไม่ได้บันทึก
          </span>
        )}
        <Button variant="outline" type="button" onClick={handleReset} disabled={!isDirty}>
          ยกเลิกการแก้ไข
        </Button>
        <Button
          variant="primary"
          type="button"
          onClick={() => setIsConfirmOpen(true)}
          disabled={!isDirty}
          className="bg-[#E63946] hover:bg-[#d62839]"
        >
          บันทึกบัญชีรับเงิน
        </Button>
      </div>

      <Modal
        isOpen={isConfirmOpen}
        onClose={closeConfirm}
        title="ยืนยันตัวตนก่อนเปลี่ยนบัญชีรับเงิน"
        subtitle="กรอกรหัสผ่านของท่านเพื่อยืนยันว่าเป็นเจ้าของบัญชีจริง"
        footer={
          <>
            <Button variant="outline" onClick={closeConfirm} disabled={isSaving}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isSaving}
              className="bg-[#E63946] hover:bg-[#d62839]"
            >
              {isSaving ? "กำลังบันทึก..." : "ยืนยันการเปลี่ยน"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {/* สรุปสิ่งที่กำลังจะเปลี่ยนให้เห็นชัด ๆ ก่อนกดยืนยัน
              คนที่ถูกหลอกให้กดมักไม่ได้อ่านฟอร์มด้านหลัง modal */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
            <p className="font-bold">ค่าจ้างงวดถัดไปจะถูกโอนไปที่</p>
            <p className="font-mono text-base break-all">{draft.bankAccount || "(ยังไม่ได้กรอก)"}</p>
            <p className="text-xs">{draft.paymentInfo || "(ยังไม่ได้กรอกข้อมูลการจ่ายเงิน)"}</p>
          </div>

          <InputField
            label="รหัสผ่านของท่าน"
            name="currentPassword"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="กรอกรหัสผ่านเพื่อยืนยัน"
            autoComplete="current-password"
          />

          <p className="text-xs text-gray-500 leading-relaxed">
            ระบบขอรหัสผ่านซ้ำเฉพาะรายการที่เกี่ยวกับเงิน เพื่อให้แน่ใจว่าถ้ามีคนอื่น
            เข้าถึงเครื่องของท่านได้ ก็ยังเปลี่ยนปลายทางค่าจ้างไม่ได้
          </p>
        </div>
      </Modal>
    </div>
  );
}
