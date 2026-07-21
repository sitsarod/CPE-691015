import React, { useState } from "react";
import { 
  X, 
  CreditCard, 
  QrCode, 
  Building2, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Loader2 
} from "lucide-react";
import { BankAccount } from "./types";
import SlipUploader from "@/components/SlipUploader";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "existing";
  invoiceId: number | null;
  billingIds: number[];
  amount: number;
  bankAccounts: BankAccount[];
  uploadedSlipUrl: string;
  onUploadSuccess: (url: string) => void;
  onSubmitCheckout: (method: "qr" | "bank_transfer") => void;
  isSubmittingPayment: boolean;
  triggerToast: (message: string, type?: "success" | "error" | "info") => void;
}

export default function CheckoutModal({
  isOpen,
  onClose,
  mode,
  invoiceId,
  billingIds,
  amount,
  bankAccounts,
  uploadedSlipUrl,
  onUploadSuccess,
  onSubmitCheckout,
  isSubmittingPayment,
  triggerToast
}: CheckoutModalProps) {
  const [activePaymentMethod, setActivePaymentMethod] = useState<"qr" | "bank_transfer">("qr");
  const [copySuccess, setCopySuccess] = useState<Record<number, boolean>>({});

  if (!isOpen) return null;

  const activeBankAccount = bankAccounts.find(b => b.is_active) || bankAccounts[0];

  const handleCopyText = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopySuccess(prev => ({ ...prev, [id]: false }));
    }, 2000);
    triggerToast("คัดลอกเลขบัญชีเรียบร้อยแล้ว!", "success");
  };

  const handleConfirmSubmit = () => {
    if (!uploadedSlipUrl) {
      triggerToast("กรุณาอัปโหลดรูปภาพสลิปหลักฐานการโอนเงิน", "error");
      return;
    }
    onSubmitCheckout(activePaymentMethod);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-gray-150 flex items-center justify-between bg-gray-50">
          <div>
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#CC0000]" />
              ดำเนินการชำระเงิน
            </h3>
            <span className="text-xs text-gray-500 mt-1 block">
              {mode === "create" ? `เลือกจ่ายเงินจากบิล ${billingIds.length} ใบ` : `ใบแจ้งหนี้ #${invoiceId}`}
            </span>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-200 rounded-full transition-colors cursor-pointer"
            disabled={isSubmittingPayment}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Total Amount Panel */}
          <div className="bg-[#FFF0F0] border border-[#FFE0E0] rounded-2xl p-5 text-center">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">ยอดเงินที่ต้องชำระ</span>
            <span className="text-3xl font-black text-[#CC0000] mt-1 block">
              ฿{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Payment Method Switcher */}
          {mode === "create" && (
            <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActivePaymentMethod("qr")}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activePaymentMethod === "qr"
                    ? "bg-white text-[#CC0000] shadow-sm"
                    : "text-gray-655 hover:text-black"
                }`}
              >
                <QrCode className="w-4 h-4" />
                PromptPay QR
              </button>
              <button
                type="button"
                onClick={() => setActivePaymentMethod("bank_transfer")}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activePaymentMethod === "bank_transfer"
                    ? "bg-white text-[#CC0000] shadow-sm"
                    : "text-gray-655 hover:text-black"
                }`}
              >
                <Building2 className="w-4 h-4" />
                โอนบัญชีธนาคาร
              </button>
            </div>
          )}

          {/* Payment Details Container */}
          <div className="space-y-4">
            {activePaymentMethod === "qr" ? (
              // PromptPay Mode
              <div className="flex flex-col items-center space-y-4 p-4 border border-gray-200 rounded-2xl bg-white shadow-inner">
                <span className="text-xs font-bold text-gray-550">สแกนจ่ายเงินสะดวกผ่านพร้อมเพย์ QR Code</span>
                
                {activeBankAccount ? (
                  <div className="relative p-2 bg-white rounded-xl border border-gray-150 shadow-sm flex flex-col items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={`https://promptpay.io/${activeBankAccount.account_no}/${amount}.png`}
                      alt="PromptPay QR Code"
                      className="w-48 h-48 object-contain"
                    />
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-550 font-bold bg-gray-55 px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ระบุยอดเงิน ฿{amount.toLocaleString("th-TH")}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-gray-550">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2 animate-bounce" />
                    ไม่พบข้อมูลพร้อมเพย์ของสโมสร กรุณาใช้วิธีโอนเงินธนาคาร
                  </div>
                )}
                
                <div className="text-[11px] text-gray-500 text-center space-y-1">
                  <p className="font-bold text-gray-800">
                    พร้อมเพย์: {activeBankAccount?.account_name || "สโมสรแบดมินตัน"}
                  </p>
                  <p>เปิดแอปธนาคารของคุณ เลือก &quot;สแกนจ่าย/Scan&quot; เพื่อดำเนินการ</p>
                </div>
              </div>
            ) : (
              // Bank Transfer Mode
              <div className="space-y-3">
                <span className="text-xs font-bold text-gray-650 block">บัญชีสำหรับโอนเงินธนาคาร:</span>
                {bankAccounts.filter(b => b.is_active).length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-500 border border-gray-200 rounded-2xl">
                    ไม่พบบัญชีธนาคารสโมสร กรุณาติดต่อผู้ดูแลระบบ
                  </div>
                ) : (
                  bankAccounts.filter(b => b.is_active).map((acc) => (
                    <div key={`bank-acc-${acc.ID}`} className="p-4 border border-gray-200 rounded-xl bg-white flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                          KTB
                        </div>
                        <div>
                          <h5 className="font-bold text-gray-800 text-sm">{acc.bank_name}</h5>
                          <p className="text-xs text-gray-500 mt-0.5">ชื่อบัญชี: {acc.account_name}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <code className="font-mono text-xs font-bold text-gray-900">{acc.account_no}</code>
                            <button
                              type="button"
                              onClick={() => handleCopyText(acc.account_no, acc.ID)}
                              className="p-1 text-gray-400 hover:text-black hover:bg-gray-150 rounded cursor-pointer"
                              title="คัดลอกเลขบัญชี"
                            >
                              {copySuccess[acc.ID] ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Slip Uploader Section */}
          <div className="border-t border-gray-150 pt-6 space-y-3">
            <span className="text-xs font-bold text-gray-650 block">แนบหลักฐานการโอนเงิน (สลิป):</span>
            <SlipUploader
              currentUrl={uploadedSlipUrl}
              onUploadSuccess={onUploadSuccess}
              onError={triggerToast}
              label="สลิปโอนเงิน (JPG/PNG)"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-gray-150 flex items-center justify-end gap-3 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-white border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-black rounded-xl text-xs font-bold transition-all cursor-pointer"
            disabled={isSubmittingPayment}
          >
            ปิดหน้าต่าง
          </button>
          <button
            type="button"
            onClick={handleConfirmSubmit}
            disabled={!uploadedSlipUrl || isSubmittingPayment}
            className="px-6 py-2.5 bg-[#CC0000] hover:bg-[#A30000] text-white disabled:bg-gray-200 disabled:text-gray-400 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg cursor-pointer"
          >
            {isSubmittingPayment ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังแจ้งชำระเงิน...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                ยืนยันส่งหลักฐานโอนเงิน
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
