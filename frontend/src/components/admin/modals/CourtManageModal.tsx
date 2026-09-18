import React, { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, MapPin } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import { FormError } from "@/components/admin/ManagementUI";
import { Court, getCourts, createCourt, updateCourt, deleteCourt } from "@/services/courtAPI";

import { useConfirm } from "@/components/ConfirmProvider";
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void; // เรียกหลังเพิ่ม/แก้/ลบ เพื่อให้หน้าหลักโหลดรายการสนามใหม่
}

export function CourtManageModal({ isOpen, onClose, onChanged }: Props) {
  const confirmAction = useConfirm();
  const [courts, setCourts] = useState<Court[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setCourts(await getCourts());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "โหลดรายการสนามไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setNewName("");
      setError(null);
      load();
    }
  }, [isOpen]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return setError("กรุณากรอกชื่อสนาม");
    setError(null);
    try {
      setBusyId(-1);
      await createCourt(name);
      setNewName("");
      await load();
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เพิ่มสนามไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  // บันทึกชื่อใหม่เมื่อออกจากช่อง (ถ้าเปลี่ยนจริง)
  const handleRename = async (court: Court, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === court.name) return;
    try {
      setBusyId(court.ID);
      await updateCourt(court.ID, { name: trimmed });
      await load();
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "แก้ชื่อสนามไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (court: Court) => {
    try {
      setBusyId(court.ID);
      await updateCourt(court.ID, { is_active: !court.is_active });
      await load();
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เปลี่ยนสถานะสนามไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (court: Court) => {
    if (!(await confirmAction({ message: `ลบสนาม "${court.name}" ใช่หรือไม่?`, tone: "danger" }))) return;
    try {
      setBusyId(court.ID);
      await deleteCourt(court.ID);
      await load();
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ลบสนามไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="จัดการสนาม"
      subtitle="เพิ่ม แก้ชื่อ หรือลบสนามที่ใช้มอบหมายคาบสอน"
      maxWidth="max-w-lg"
      footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}
    >
      <div className="space-y-4">
        {error && <FormError message={error} />}

        {/* เพิ่มสนามใหม่ */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">เพิ่มสนามใหม่</label>
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="เช่น สนาม 1, คอร์ต A"
              className="flex-1 min-w-0 px-4 py-3 border border-gray-200 rounded-xl text-base bg-white text-gray-900 focus:outline-none focus:border-orange-primary"
            />
            <button
              onClick={handleAdd}
              disabled={busyId === -1}
              className="shrink-0 flex items-center gap-1.5 bg-[#E63946] hover:bg-[#d62839] text-white font-bold text-sm px-5 py-3 rounded-xl cursor-pointer disabled:opacity-60"
            >
              <Plus className="w-4 h-4" /> เพิ่ม
            </button>
          </div>
        </div>

        {/* รายการสนาม */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#CD0D13]" /></div>
          ) : courts.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">ยังไม่มีสนาม — เพิ่มด้านบน</p>
          ) : (
            courts.map((court) => (
              <div key={court.ID} className={`flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 ${court.is_active ? "" : "bg-slate-50 opacity-70"}`}>
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  defaultValue={court.name}
                  onBlur={(e) => handleRename(court, e.target.value)}
                  disabled={busyId === court.ID}
                  className="flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none border-b border-transparent focus:border-slate-300"
                />
                <button
                  onClick={() => handleToggleActive(court)}
                  disabled={busyId === court.ID}
                  className={`text-[11px] font-bold px-2 py-1 rounded-lg cursor-pointer ${court.is_active ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100"}`}
                  title="เปิด/ปิดการใช้งาน"
                >
                  {court.is_active ? "ใช้งาน" : "ปิดใช้"}
                </button>
                <button
                  onClick={() => handleDelete(court)}
                  disabled={busyId === court.ID}
                  className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-[#CD0D13] cursor-pointer"
                  title="ลบสนาม"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-slate-400">สนามที่ &quot;ปิดใช้&quot; จะไม่ขึ้นให้เลือกตอนมอบหมายคาบ แต่คาบเก่าที่ใช้สนามนั้นไม่กระทบ</p>
      </div>
    </Modal>
  );
}
