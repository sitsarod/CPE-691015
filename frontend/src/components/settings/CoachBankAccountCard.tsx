"use client";

import React, { useState } from "react";
import { Landmark, ShieldAlert } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import InputField from "@/components/InputField";
import SelectField from "@/components/SelectField";
import { updateCoachBankAccountAPI } from "@/services/coachAPI";
import { BANK_OPTIONS } from "@/types/coach";

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
  /** ชื่อธนาคาร (คอลัมน์ bank_account) */
  initialBankAccount: string;
  /** เลขบัญชี (คอลัมน์ payment_info) */
  initialPaymentInfo: string;
  /** เบอร์พร้อมเพย์ */
  initialPromptPay: string;
}

export default function CoachBankAccountCard({
  coachId,
  initialBankAccount,
  initialPaymentInfo,
  initialPromptPay,
}: Props) {
  // ค่าที่บันทึกลงฐานแล้วจริง ๆ ใช้เทียบว่ามีอะไรเปลี่ยนไหม และใช้ย้อนค่าตอนกดยกเลิก
  const [saved, setSaved] = useState({
    bankAccount: initialBankAccount,
    paymentInfo: initialPaymentInfo,
    promptPay: initialPromptPay,
  });

  const [draft, setDraft] = useState({
    bankAccount: initialBankAccount,
    paymentInfo: initialPaymentInfo,
    promptPay: initialPromptPay,
  });

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isDirty =
    draft.bankAccount !== saved.bankAccount ||
    draft.paymentInfo !== saved.paymentInfo ||
    draft.promptPay !== saved.promptPay;

  const closeConfirm = () => {
    setIsConfirmOpen(false);
    // ล้างรหัสผ่านออกจาก state ทันทีที่ปิด ไม่เก็บค้างไว้ใน memory นานเกินจำเป็น
    setPassword("");
    setError(null);
  };

  const handleReset = () => {
    setDraft({ ...saved });
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
      // ⚠️ ต้องส่ง prompt_pay ไปด้วยทุกครั้ง แม้ผู้ใช้ไม่ได้แก้ช่องนี้
      //
      // ฝั่ง service เขียนทั้งสามคอลัมน์แบบไม่มีเงื่อนไข ถ้าไม่ส่งมาจะกลายเป็น
      // ค่าว่างแล้วลบพร้อมเพย์เดิมทิ้ง ทั้งที่ผู้ใช้แค่มาแก้เลขบัญชีเฉย ๆ
      const updated = await updateCoachBankAccountAPI(coachId, {
        currentPassword: password,
        bank_account: draft.bankAccount,
        payment_info: draft.paymentInfo,
        prompt_pay: draft.promptPay,
      });

      // ยึดค่าที่ backend ตอบกลับเป็นความจริง ไม่ใช่ค่าที่พิมพ์ไว้ในฟอร์ม
      const next = {
        bankAccount: updated.bank_account ?? draft.bankAccount,
        paymentInfo: updated.payment_info ?? draft.paymentInfo,
        promptPay: updated.prompt_pay ?? draft.promptPay,
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
      <div className="p-4 sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-3 rounded-xl bg-red-50 flex-shrink-0">
            <Landmark className="w-6 h-6 text-[#CC0000]" />
          </div>

          <div className="min-w-0">
            <h2 className="font-bold text-gray-900">บัญชีรับเงิน</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              ปลายทางที่โรงเรียนโอนค่าจ้างให้ท่าน การเปลี่ยนข้อมูลนี้ต้องยืนยันรหัสผ่านทุกครั้ง
            </p>
          </div>
        </div>

        {notice && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">
            {notice}
          </div>
        )}

        {/* ชื่อคอลัมน์กับความหมายสลับกันอยู่: bank_account เก็บ "ชื่อธนาคาร"
            ส่วน payment_info เก็บ "เลขบัญชี" — แก้ชื่อคอลัมน์ตอนนี้จะกระทบโค้ดเพื่อน
            หลายจุด จึงใช้ label สื่อความหมายที่ถูกต้องแทน ให้ตรงกับหน้าจัดการสมาชิก */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="ธนาคาร"
            name="bankAccount"
            options={BANK_OPTIONS}
            value={draft.bankAccount}
            onChange={(e) => {
              setDraft((prev) => ({ ...prev, bankAccount: e.target.value }));
              setNotice(null);
            }}
          />
          <InputField
            label="เลขบัญชี"
            name="paymentInfo"
            inputMode="numeric"
            value={draft.paymentInfo}
            onChange={(e) => {
              setDraft((prev) => ({ ...prev, paymentInfo: e.target.value.replace(/\D/g, "") }));
              setNotice(null);
            }}
            placeholder="ระบุเลขบัญชี"
          />
        </div>

        <div className="mt-4">
          <InputField
            label="พร้อมเพย์"
            name="promptPay"
            inputMode="numeric"
            value={draft.promptPay}
            onChange={(e) => {
              setDraft((prev) => ({ ...prev, promptPay: e.target.value.replace(/\D/g, "") }));
              setNotice(null);
            }}
            placeholder="เบอร์โทรหรือเลขบัตรประชาชนที่ผูกพร้อมเพย์"
          />
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
            <p className="font-mono text-base break-all">{draft.paymentInfo || "(ยังไม่ได้กรอกเลขบัญชี)"}</p>
            <p className="text-xs">{draft.bankAccount || "(ยังไม่ได้เลือกธนาคาร)"}</p>
            <p className="text-xs">พร้อมเพย์: {draft.promptPay || "(ไม่ได้ระบุ)"}</p>
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
