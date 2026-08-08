import React from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import { UserProfileResponseDTO } from "@/types/user";
import Button from "@/components/Button";
import {
  RoleBadge,
  StatusPill,
  DetailItem,
  normalizeRole,
  isActive,
  BRAND,
} from "@/components/admin/ManagementUI";

interface ViewMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  selected: UserProfileResponseDTO | null;
  isLoadingDetail: boolean;
  getId: (item: UserProfileResponseDTO) => number;
}

export function ViewMemberModal({
  isOpen,
  onClose,
  selected,
  isLoadingDetail,
  getId,
}: ViewMemberModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="รายละเอียดสมาชิก"
      footer={
        <Button
          onClick={onClose}
          variant="primary"
        >
          ปิด
        </Button>
      }
    >
      {isLoadingDetail ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND }} />
        </div>
      ) : selected ? (
        <div>
          <div className="mb-5 flex items-center gap-3">
            <div>
              <div className="font-bold text-gray-900">
                {selected.firstName} {selected.lastName}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <RoleBadge role={normalizeRole(selected.role)} />
                <StatusPill active={isActive(selected.status)} status={selected.status} />
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <DetailItem label="ชื่อเล่น" value={selected.nickname} />
            <DetailItem label="อีเมล" value={selected.email} />
            <DetailItem label="เบอร์โทรศัพท์" value={selected.phoneNumber} />
            <DetailItem label="บทบาท" value={selected.role} />
            <DetailItem label="อีเมลผู้ปกครอง" value={selected.parentEmail} />
            <DetailItem label="เบอร์ผู้ปกครอง" value={selected.parentPhoneNumber} />
          </dl>
        </div>
      ) : null}
    </Modal>
  );
}