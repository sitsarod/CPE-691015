import React, { useEffect, useState } from "react";
import { Loader2, CalendarClock } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import AvailabilityGridView from "@/components/AvailabilityGridView";
import { CoachListItem, fetchCoachAvailability } from "@/services/coachAPI";
import { AvailabilitySlot } from "@/types/coach";
import { BRAND } from "@/components/admin/ManagementUI";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  coach: CoachListItem | null;
}

// Modal ให้ admin ดูตารางเวลาว่างของโค้ช (อ่านอย่างเดียว — admin ไม่มีสิทธิ์แก้เวลาว่างของโค้ช)
export function ViewCoachScheduleModal({ isOpen, onClose, coach }: Props) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !coach) return;
    let active = true;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
        const data = await fetchCoachAvailability(coach.id, token);
        if (active) setSlots(data);
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : "ไม่สามารถดึงตารางเวลาว่างได้");
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, coach]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="ตารางเวลาว่างของโค้ช"
      subtitle={coach ? `${coach.firstName} ${coach.lastName}${coach.nickname ? ` (${coach.nickname})` : ""}` : undefined}
      maxWidth="max-w-4xl"
      footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}
    >
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND }} />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      ) : slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <CalendarClock className="w-10 h-10 mb-3 text-slate-300" />
          <p className="text-sm">โค้ชคนนี้ยังไม่ได้ตั้งตารางเวลาว่าง</p>
        </div>
      ) : (
        <AvailabilityGridView slots={slots} />
      )}
    </Modal>
  );
}
