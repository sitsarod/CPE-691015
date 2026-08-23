"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  RefreshCw,
  PlayCircle,
  LogIn,
  Lock,
  Clock,
  Users,
  History,
  KeyRound,
  Camera,
  CameraOff,
  AlertTriangle,
} from "lucide-react";

import {
  fetchOpenablePackages,
  fetchOpenSessions,
  openSession,
  fetchSession,
  lookupByQR,
  checkInByQR,
  manualCheckIn,
  closeSession,
  updateAttendanceStatus,
} from "@/services/attendanceAPI";
import type {
  OpenablePackage,
  OpenSessionSummary,
  AttendanceSession,
  ScanResult,
  RosterItem,
  AttendanceStatus,
} from "@/types/attendance";

import QRScanner from "./components/QRScanner";
import ConfirmIdentityDialog from "./components/ConfirmIdentityDialog";
import ScanResultBanner, { type ScanOutcome } from "./components/ScanResult";
import RosterList from "./components/RosterList";
import EditStatusModal from "./components/EditStatusModal";


const SCAN_COOLDOWN_SECONDS = 3;

// session_date มาเป็น date ล้วน (UTC midnight ของวันตามเวลาสนาม)
function formatSessionDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export default function AdminAttendancePage() {
  const [openable, setOpenable] = useState<OpenablePackage[]>([]);
  const [openSessions, setOpenSessions] = useState<OpenSessionSummary[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [enteringSessionId, setEnteringSessionId] = useState<number | null>(null);

  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [busyPackageId, setBusyPackageId] = useState<number | null>(null);

  const [manualCode, setManualCode] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [pendingScan, setPendingScan] = useState<ScanResult | null>(null);
  const [pendingCode, setPendingCode] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);

  // เปิดกล้องไว้ตั้งแต่แรก — เครื่องที่สนามตั้งไว้เพื่อรับสแกนอย่างเดียว
  // การให้กดเปิดกล้องเองทุกครั้งที่เข้ารอบเป็นขั้นที่ไม่ได้ให้ทางเลือกอะไรจริง ๆ
  // ใครไม่ต้องการก็กดปิดได้ แต่ค่าเริ่มต้นควรเป็นสิ่งที่จะใช้ 99% ของเวลา
  const [useCamera, setUseCamera] = useState(true);
  const [editing, setEditing] = useState<RosterItem | null>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // ─── ช่วงพักกล้องหลังจบคนหนึ่งคน ───────────────────────────────────────────
  //
  // หลังกดยืนยันหรือกดไม่ใช่ กล้องจะหยุดอ่าน 3 วินาทีก่อนเริ่มอ่านคนถัดไป
  //
  // ที่ต้องมีเพราะ QR ของคนเดิมยังอยู่ในกรอบกล้อง ถ้าเริ่มอ่านทันที
  // มันจะอ่านใบเดิมซ้ำก่อนที่เจ้าตัวจะเดินออกไป แล้วขึ้นกล่องยืนยันของคนเดิมอีกรอบ
  // (ครั้งที่สองจะถูกด่านกันซ้ำปฏิเสธ แต่แอดมินเห็นข้อความแดงทั้งที่เพิ่งสำเร็จ = สับสน)
  //
  // สามวินาทีพอให้เดินออกจากกรอบ และพอให้อ่านผลบนแถบสีทันก่อนจอเปลี่ยน
  const [cooldown, setCooldown] = useState(0);

  // นับถอยหลังทีละวินาที — setState อยู่ใน callback ของ setTimeout ไม่ใช่ในตัว effect
  // จึงไม่ผิดกฎ react-hooks/set-state-in-effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const startCooldown = useCallback(() => setCooldown(SCAN_COOLDOWN_SECONDS), []);


  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // ต้องได้ทั้งคู่ — รายการรอบที่เปิดค้างคือตาข่ายกันลืมปิดรอบ
        // ถ้าปล่อยให้มันพังเงียบ ๆ ก็เท่ากับไม่มีตั้งแต่แรก
        const [packages, sessions] = await Promise.all([
          fetchOpenablePackages(),
          fetchOpenSessions(),
        ]);
        if (cancelled) return;
        setOpenable(packages);
        setOpenSessions(sessions);
        setListError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setListError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายการแพ็กเกจได้");
      } finally {
        if (!cancelled) setIsLoadingList(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const loadOpenable = useCallback(() => {
    setIsLoadingList(true);
    setRefreshTick((t) => t + 1);
  }, []);

  // ─── เปิด / เข้าสู่รอบ ─────────────────────────────────────────────────────

  const handleOpen = async (pkg: OpenablePackage) => {
    setBusyPackageId(pkg.package_id);
    try {
      // มีรอบของวันนี้อยู่แล้วก็เข้าไปเลย ไม่ต้องเปิดใหม่
      // (เปิดซ้ำจะถูก unique index ปฏิเสธและได้ 409 กลับมาเปล่า ๆ)
      const data = pkg.existing_session_id
        ? await fetchSession(pkg.existing_session_id)
        : await openSession(pkg.package_id);
      setSession(data);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถเปิดรอบเช็คชื่อได้");
      loadOpenable();
    } finally {
      setBusyPackageId(null);
    }
  };

  const handleEnterSession = async (sessionId: number) => {
    setEnteringSessionId(sessionId);
    try {
      setSession(await fetchSession(sessionId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถเข้าสู่รอบเช็คชื่อได้");
      loadOpenable();
    } finally {
      setEnteringSessionId(null);
    }
  };

  const refreshSession = useCallback(async () => {
    if (!session) return;
    try {
      setSession(await fetchSession(session.id));
    } catch {
      // รีเฟรชไม่สำเร็จไม่ควรล้างจอที่แอดมินกำลังใช้อยู่ ปล่อยข้อมูลเดิมค้างไว้
    }
  }, [session]);

  // ─── จังหวะ 1: lookup ──────────────────────────────────────────────────────

  const runLookup = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code || !session) return;

      setIsLookingUp(true);
      setOutcome(null);
      try {
        const result = await lookupByQR(session.id, code);
        setPendingScan(result);
        setPendingCode(code);
      } catch (err: unknown) {
        setOutcome({
          ok: false,
          title: "สแกนไม่สำเร็จ",
          detail: err instanceof Error ? err.message : "ไม่ทราบสาเหตุ",
        });

        startCooldown();
      } finally {
        setIsLookingUp(false);
        setManualCode("");
      }
    },
    [session, startCooldown]
  );

  // ─── จังหวะ 2: ยืนยันแล้วบันทึก ────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!session || !pendingCode) return;

    setIsConfirming(true);
    try {
      const result = await checkInByQR(session.id, pendingCode);
      setOutcome({
        ok: true,
        title: `เช็คชื่อสำเร็จ — ${result.full_name.trim() || result.nickname}`,
        detail: `เหลือ ${result.remaining_sessions} ครั้ง`,
      });
      setPendingScan(null);
      setPendingCode("");
      await refreshSession();
    } catch (err: unknown) {
      setOutcome({
        ok: false,
        title: "เช็คชื่อไม่สำเร็จ",
        detail: err instanceof Error ? err.message : "ไม่ทราบสาเหตุ",
      });
      setPendingScan(null);
      setPendingCode("");
      // ยังต้องรีเฟรช เพราะบางกรณีบันทึกสำเร็จแล้วแต่ตอบกลับไม่ถึง
      await refreshSession();
    } finally {
      setIsConfirming(false);
      // พักกล้องทั้งกรณีสำเร็จและล้มเหลว — ทั้งสองกรณี QR ใบเดิมยังอยู่ในกรอบ
      startCooldown();
    }
  };

  // ใช้ทั้งตอนกด "ไม่ใช่" และตอนกล่องยืนยันหมดเวลายกเลิกเอง
  const handleReject = useCallback(() => {
    setPendingScan(null);
    setPendingCode("");
    startCooldown();
  }, [startCooldown]);

  // ─── เช็คชื่อให้ (manual) ───────────────────────────────────────────────────

  const handleManualCheckIn = async (enrollmentId: number) => {
    if (!session) return;
    try {
      const result = await manualCheckIn(session.id, enrollmentId, "แอดมินเช็คชื่อให้ที่สนาม");
      setOutcome({
        ok: true,
        title: `เช็คชื่อให้ ${result.full_name.trim() || result.nickname} แล้ว`,
        detail: `เหลือ ${result.remaining_sessions} ครั้ง`,
      });
      await refreshSession();
    } catch (err: unknown) {
      setOutcome({
        ok: false,
        title: "เช็คชื่อให้ไม่สำเร็จ",
        detail: err instanceof Error ? err.message : "ไม่ทราบสาเหตุ",
      });
    }
  };

  // ─── แก้สถานะ ──────────────────────────────────────────────────────────────

  const handleSaveStatus = async (status: AttendanceStatus, remarks: string) => {
    if (!editing?.attendance_id) return;

    setIsSavingStatus(true);
    try {
      const result = await updateAttendanceStatus(editing.attendance_id, status, remarks);
      const note =
        result.quota_delta === 1
          ? "คืนโควตา 1 ครั้ง"
          : result.quota_delta === -1
            ? "หักโควตา 1 ครั้ง"
            : "โควตาไม่เปลี่ยน";
      setOutcome({
        ok: true,
        title: "แก้สถานะแล้ว",
        detail: `${note} — เหลือ ${result.remaining_sessions} ครั้ง`,
      });
      setEditing(null);
      await refreshSession();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถแก้สถานะได้");
    } finally {
      setIsSavingStatus(false);
    }
  };

  // ─── ปิดรอบ ────────────────────────────────────────────────────────────────

  const handleClose = async () => {
    if (!session) return;

    const pending = session.pending_count;
    const confirmed = window.confirm(
      pending > 0
        ? `ปิดรอบแล้วนักเรียนที่ยังไม่ได้เช็คชื่อ ${pending} คนจะถูกบันทึกเป็นขาดเรียนและถูกหักโควตาทันที\n\nถ้ามีคนแจ้งลาไว้ ให้แก้สถานะเป็น "ลา" ทีหลังเพื่อคืนโควตาให้\n\nยืนยันปิดรอบ?`
        : "ยืนยันปิดรอบเช็คชื่อ?"
    );
    if (!confirmed) return;

    setIsClosing(true);
    try {
      setSession(await closeSession(session.id));
      setUseCamera(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถปิดรอบได้");
      await refreshSession();
    } finally {
      setIsClosing(false);
    }
  };

  // ─── จอเลือกแพ็กเกจ ────────────────────────────────────────────────────────

  // รอบที่เปิดค้างและไม่มีทางเข้าถึงจากรายการแพ็กเกจอีกแล้ว จึงยกมาแสดงแยก
  // ตัวที่ยังกดเข้าได้จากรายการปกติไม่ต้องเอามาซ้ำ
  const reachableSessionIds = new Set(
    openable
      .map((pkg) => pkg.existing_session_id)
      .filter((id): id is number => id !== null)
  );
  const staleSessions = openSessions.filter((row) => !reachableSessionIds.has(row.id));

  if (!session) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">เช็คชื่อเข้าเรียน</h1>
            <p className="mt-1 text-gray-500">
              เลือกแพ็กเกจที่กำลังอยู่ในคาบเรียน แล้วเปิดรอบเช็คชื่อ
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/admin/attendance/history"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <History className="h-4 w-4" />
              ประวัติ
            </Link>
            <button
              onClick={loadOpenable}
              disabled={isLoadingList}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingList ? "animate-spin" : ""}`} />
              รีเฟรช
            </button>
          </div>
        </div>

        {listError && (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{listError}</div>
        )}

        {staleSessions.length > 0 && (
          <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">รอบที่เปิดค้างไว้ ยังไม่ได้ปิด</p>
                <p className="mt-0.5 text-sm text-amber-800">
                  คนที่ไม่ได้เช็คชื่อจะยังไม่ถูกมาร์คขาดเรียนจนกว่าจะปิดรอบ —
                  ระบบจะปิดให้อัตโนมัติหลังเลยเวลาคาบ แต่เข้าไปตรวจและปิดเองก่อนได้
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {staleSessions.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-4"
                >
                  <div>
                    <p className="font-semibold text-gray-900">
                      {row.course_name || "ไม่ทราบคอร์ส"}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {formatSessionDate(row.session_date)} · {row.schedule_start_time} –{" "}
                        {row.schedule_end_time}
                      </span>
                      <span
                        className={
                          row.pending_count > 0 ? "font-medium text-amber-700" : undefined
                        }
                      >
                        ยังไม่เช็ค {row.pending_count} / {row.total_count} คน
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleEnterSession(row.id)}
                    disabled={enteringSessionId !== null}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
                  >
                    {enteringSessionId === row.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Lock className="h-5 w-5" />
                    )}
                    เข้าไปปิดรอบ
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoadingList ? (
          <div className="mt-16 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : openable.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-gray-200 p-12 text-center">
            <Clock className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-4 text-lg font-medium text-gray-700">
              ตอนนี้ไม่มีแพ็กเกจที่อยู่ในคาบเรียน
            </p>
            <p className="mt-2 text-gray-500">
              เปิดรอบเช็คชื่อได้ตั้งแต่ 30 นาทีก่อนคาบเริ่ม จนถึง 30 นาทีหลังคาบจบ
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {openable.map((pkg) => {
              const isClosed = pkg.existing_session_status === "closed";
              return (
                <div
                  key={pkg.package_id}
                  className="flex items-center justify-between rounded-2xl border border-gray-200 p-5"
                >
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{pkg.course_name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {pkg.start_time} – {pkg.end_time}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {pkg.student_count} คน
                      </span>
                      <span>{pkg.sessions_count} ครั้ง/แพ็กเกจ</span>
                    </div>
                  </div>

                  {isClosed ? (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
                        <Lock className="h-4 w-4" />
                        ปิดรอบแล้ววันนี้
                      </span>
                      <button
                        onClick={() => handleOpen(pkg)}
                        disabled={busyPackageId !== null}
                        className="rounded-xl border border-gray-300 px-4 py-2.5 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                      >
                        ดูรายชื่อ
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOpen(pkg)}
                      disabled={busyPackageId !== null}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      {busyPackageId === pkg.package_id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : pkg.existing_session_id ? (
                        <LogIn className="h-5 w-5" />
                      ) : (
                        <PlayCircle className="h-5 w-5" />
                      )}
                      {pkg.existing_session_id ? "เข้าสู่รอบ" : "เปิดรอบเช็คชื่อ"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── จอสแกนในรอบ ───────────────────────────────────────────────────────────

  const isOpen = session.status === "open";

  // เปิดอยู่ ≠ สแกนได้ — รอบที่เลยเวลาแล้วยังต้องเข้ามาดูรายชื่อและกด "ปิดรอบ" ได้
  // แต่ backend ปฏิเสธการสแกนทุกครั้ง (ErrAttendanceExpired) โชว์กล้องต่อ = หลอกให้กดเปล่า
  const canScan = isOpen && session.can_scan;

  // กล้องโชว์อยู่จริงหรือไม่ — ตัวตัดสินว่าผลการเช็คชื่อจะไปขึ้นที่ไหน
  // ถ้าดูแค่ useCamera ผลจะไม่โผล่ที่ไหนเลยตอนบล็อกกล้องไม่ถูกเรนเดอร์
  const showResultOnCamera = canScan && useCamera;

  return (
    // สองคอลัมน์บนจอ lg ขึ้นไป (iPad วางนอนเข้าเกณฑ์) — กล้องซ้าย รายชื่อขวา
    //
    // ล็อกความสูงไว้เท่าจอแล้วให้ "รายชื่อ" เลื่อนในตัวเอง (ดู RosterList)
    // เพื่อไม่ให้ทั้งหน้าเลื่อน ซึ่งจะทำให้กล้องหลุดออกจากจอตอนไถหารายชื่อ
    //
    // 11rem มาจาก admin/layout.tsx: pt-24 (96px) + main lg:p-8 หัวท้าย (32+32)
    // = 160px = 10rem แล้วเผื่อไว้อีก 1rem กันไม่ให้ล้นจนเกิด scrollbar ของทั้งหน้า
    // ⚠️ ถ้าใครแก้ padding ใน admin/layout.tsx ต้องมาแก้เลขนี้ตาม
    <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:h-[calc(100vh-11rem)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => {
              setSession(null);
              loadOpenable();
            }}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ← กลับไปเลือกแพ็กเกจ
          </button>
          <h1 className="truncate text-2xl font-bold text-gray-900">
            {session.course_name}
          </h1>
          <p className="text-gray-500">
            คาบ {session.schedule_start_time} – {session.schedule_end_time} ·{" "}
            {!isOpen ? (
              <span className="font-medium text-gray-600">ปิดรอบแล้ว</span>
            ) : canScan ? (
              <span className="font-medium text-green-600">รอบเปิดอยู่</span>
            ) : (
              <span className="font-medium text-amber-600">เปิดค้างอยู่ · เลยเวลาแล้ว</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* ตัวเลขสรุปย่อเป็นแถวเดียว — เดิมเป็นการ์ด 4 ใบสูงเกือบ 100px
              ซึ่งกินที่แนวตั้งไปเปล่า ๆ แล้วดันกล้องหลุดจอบน iPad */}
          <div className="flex gap-4">
            {[
              { label: "มา", value: session.present_count, tone: "text-green-600" },
              { label: "ขาด", value: session.absent_count, tone: "text-red-600" },
              { label: "ลา", value: session.leave_count, tone: "text-amber-600" },
              { label: "ค้าง", value: session.pending_count, tone: "text-gray-900" },
            ].map((box) => (
              <div key={box.label} className="text-center">
                <p className={`text-2xl font-bold leading-none ${box.tone}`}>
                  {box.value}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">{box.label}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={refreshSession}
              aria-label="รีเฟรช"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 px-4 font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {isOpen && (
              <button
                onClick={handleClose}
                disabled={isClosing}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-800 px-4 font-semibold text-white transition hover:bg-gray-900 disabled:opacity-60"
              >
                {isClosing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                ปิดรอบ
              </button>
            )}
          </div>
        </div>
      </div>

      {isOpen && !canScan && (
        <div className="flex shrink-0 items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-900">เลยเวลาคาบแล้ว — สแกนเพิ่มไม่ได้</p>
            <p className="mt-0.5 text-sm text-amber-800">
              {session.pending_count > 0
                ? `กด "ปิดรอบ" เพื่อบันทึกคนที่ยังไม่เช็คชื่อ ${session.pending_count} คนเป็นขาดเรียน (หักโควตาคนละ 1 ครั้ง) — ถ้ามีคนแจ้งลาไว้ ให้แก้สถานะเป็น "ลา" ทีหลังเพื่อคืนโควตา`
                : 'เช็คชื่อครบทุกคนแล้ว กด "ปิดรอบ" เพื่อปิดงานของคาบนี้ได้เลย'}
            </p>
          </div>
        </div>
      )}

      {/* ปิดรอบแล้วคอลัมน์ซ้ายหายไป ต้องสลับเป็นคอลัมน์เดียวด้วย
          ไม่งั้นรายชื่อจะไปนั่งในช่องซ้ายที่กว้างแค่ 380px แล้วตารางแน่นจนอ่านยาก */}
      <div
        className={`grid min-h-0 flex-1 gap-4 ${
          canScan ? "lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]" : "lg:grid-cols-1"
        }`}
      >
        {/* ── ซ้าย: รับการเช็คชื่อ ── */}
        {canScan && (
          <div className="flex min-h-0 flex-col gap-3">
            {useCamera ? (
              <QRScanner
                onScan={runLookup}
                paused={pendingScan !== null || isConfirming || cooldown > 0}
                pausedReason={
                  cooldown > 0
                    ? `พร้อมสแกนคนถัดไปใน ${cooldown} วินาที`
                    : "หยุดอ่านชั่วคราว — รอยืนยันตัวตน"
                }
                overlay={
                  outcome && (
                    <ScanResultBanner
                      variant="overlay"
                      outcome={outcome}
                      onDismiss={() => setOutcome(null)}
                    />
                  )
                }
              />
            ) : (
              <div className="space-y-3">
                <div className="flex aspect-[4/3] max-h-[52vh] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50">
                  <CameraOff className="h-12 w-12 text-gray-400" strokeWidth={1.5} />
                  <p className="text-lg font-semibold text-gray-600">กล้องปิดอยู่</p>
                </div>

                {/* บรรทัดสถานะให้อยู่ตำแหน่งเดียวกับของ QRScanner */}
                <p className="flex items-center gap-2 text-gray-500">
                  <CameraOff className="h-4 w-4" />
                  ปิดกล้องไว้ — รับเฉพาะรหัสที่พิมพ์เอง
                </p>
              </div>
            )}

            {/* ปิดกล้องอยู่ → ผลมาขึ้นเป็นแถบตรงนี้ (ตอนเปิดกล้องมันไปขึ้นทับบนภาพ)
                ต้องเลือกอย่างใดอย่างหนึ่ง ไม่งั้นผลเดียวกันโผล่สองที่
                แล้วจะได้ยินเสียงซ้อนสองครั้งด้วย (แต่ละตัวเรียก beep ของตัวเอง) */}
            {outcome && !showResultOnCamera && (
              <ScanResultBanner outcome={outcome} onDismiss={() => setOutcome(null)} />
            )}

            {/* ช่องพิมพ์รหัสด้วยมือ — ต้องมีเสมอ ไม่ใช่ของสำรอง
                กล้องเว็บใช้ได้เฉพาะบน https หรือ localhost เปิดจาก LAN ด้วย IP
                จะถูกบล็อกเงียบ ๆ ช่องนี้ยิง endpoint เดียวกันทุกอย่าง */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runLookup(manualCode);
              }}
              className="flex shrink-0 gap-2"
            >
              <div className="relative min-w-0 flex-1">
                <KeyRound className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="พิมพ์รหัส QR"
                  className="w-full rounded-xl border border-gray-300 py-3 pl-11 pr-3 text-gray-900 outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={isLookingUp || !manualCode.trim()}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {isLookingUp && <Loader2 className="h-5 w-5 animate-spin" />}
                ตรวจ
              </button>
            </form>

            <button
              onClick={() => setUseCamera((v) => !v)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {useCamera ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {useCamera ? "ปิดกล้อง" : "เปิดกล้องสแกน"}
            </button>
          </div>
        )}

        {/* ── ขวา: รายชื่อ ── */}
        <div className="flex min-h-0 flex-col">
          <RosterList
            session={session}
            onManualCheckIn={handleManualCheckIn}
            onEditStatus={setEditing}
          />
        </div>
      </div>

      {pendingScan && (
        <ConfirmIdentityDialog
          scan={pendingScan}
          isSubmitting={isConfirming}
          onConfirm={handleConfirm}
          onReject={handleReject}
        />
      )}

      {editing?.attendance_id && (
        <EditStatusModal
          studentName={editing.full_name.trim() || editing.nickname}
          currentStatus={editing.status ?? "present"}
          currentRemarks={editing.remarks}
          isSubmitting={isSavingStatus}
          onSubmit={handleSaveStatus}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
