import React from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import { CoachListItem } from "@/services/coachAPI";
import { CoachProfile } from "@/types/coach";

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  per_session: "รายครั้ง",
  monthly: "รายเดือน",
};
import {  Pill, DetailItem, BRAND } from "@/components/admin/ManagementUI";
import { formatDate } from "@/lib/format";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selected: CoachListItem | null;
  detail: CoachProfile | null;
  isLoadingDetail: boolean;
  onEdit?: () => void;
}

export function ViewCoachModal({ isOpen, onClose, selected, detail, isLoadingDetail, onEdit }: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="รายละเอียดโค้ช"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>ปิด</Button>
          {onEdit && detail && (
            <Button variant="primary" onClick={onEdit} className="bg-[#E63946] hover:bg-[#d62839]">
              แก้ไขข้อมูล
            </Button>
          )}
        </>
      }
    >
      {isLoadingDetail ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND }} />
        </div>
      ) : detail ? (
        <div>
          <div className="mb-5 flex items-center gap-3">      
            <div>
              <div className="font-bold text-gray-900">{detail.first_name} {detail.last_name}</div>
              {detail.specialization && (
                <div className="mt-1">
                  <Pill label={detail.specialization} color="bg-sky-50 text-sky-700 ring-sky-600/20" />
                </div>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <DetailItem label="ชื่อเล่น" value={detail.nickname} />
            <DetailItem label="อีเมล" value={detail.email} />
            <DetailItem label="เบอร์โทรศัพท์" value={detail.phone} />
            <DetailItem label="Line ID" value={detail.lineId || "-"} />
            <DetailItem label="Facebook" value={detail.facebook || "-"} />
            <DetailItem label="เลขบัตรประชาชน" value={detail.uid} />
            <DetailItem label="วันเกิด" value={formatDate(detail.birth_date)} />
            <DetailItem label="ระดับฝีมือ" value={detail.specialization} />
            <DetailItem label="ใบรับรองผู้ฝึกสอน" value={detail.coach_license} />
            <DetailItem label="ที่อยู่" value={detail.address} />
            <DetailItem label="เลขบัญชีธนาคาร" value={detail.bank_account} />
            <DetailItem label="ข้อมูลการจ่ายเงิน" value={detail.payment_info} />
            <DetailItem
              label="ประเภทการจ่ายเงิน"
              value={PAYMENT_TYPE_LABEL[detail.payment_type] ?? "-"}
            />
            <DetailItem
              label={detail.payment_type === "monthly" ? "ค่าจ้างต่อเดือน" : "ค่าจ้างต่อครั้ง"}
              value={detail.pay_rate != null ? `${detail.pay_rate.toLocaleString()} บาท` : "-"}
            />
          </dl>
        </div>
      ) : selected ? (
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <DetailItem label="ชื่อ - นามสกุล" value={`${selected.firstName} ${selected.lastName}`} />
          <DetailItem label="ชื่อเล่น" value={selected.nickname} />
          <DetailItem label="ระดับฝีมือ" value={selected.specialization} />
          <DetailItem label="ใบรับรองผู้ฝึกสอน" value={selected.coach_license} />
          <DetailItem label="เบอร์โทรศัพท์" value={selected.phone} />
          <DetailItem label="Line ID" value={selected.lineId || "-"} />
          <DetailItem label="Facebook" value={selected.facebook || "-"} />
        </dl>
      ) : null}
    </Modal>
  );
}