import React from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import { CoachListItem } from "@/services/coachAPI";
import { CoachProfile } from "@/types/coach";
import {  Pill, DetailItem, BRAND } from "@/components/admin/ManagementUI";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selected: CoachListItem | null;
  detail: CoachProfile | null;
  isLoadingDetail: boolean;
}

export function ViewCoachModal({ isOpen, onClose, selected, detail, isLoadingDetail }: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="รายละเอียดโค้ช"
      footer={<Button variant="primary" onClick={onClose}>ปิด</Button>}
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
            <DetailItem label="วันเกิด" value={detail.birth_date} />
            <DetailItem label="ที่อยู่" value={detail.address} />
            <DetailItem
              label="ค่าจ้างต่อครั้ง"
              value={detail.pay_rate_per_session != null ? `${detail.pay_rate_per_session.toLocaleString()} บาท` : "-"}
            />
          </dl>
        </div>
      ) : selected ? (
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <DetailItem label="ชื่อ - นามสกุล" value={`${selected.firstName} ${selected.lastName}`} />
          <DetailItem label="ชื่อเล่น" value={selected.nickname} />
          <DetailItem label="ระดับ" value={selected.specialization} />
          <DetailItem label="เบอร์โทรศัพท์" value={selected.phone} />
        </dl>
      ) : null}
    </Modal>
  );
}