"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * เครื่องมือกลางของหน้าจัดการข้อมูลฝั่งแอดมิน
 *
 * ─── ปัญหาที่แก้ ───
 *
 * หน้าจัดการสมาชิก จัดการโค้ช และจัดการผู้เรียน เขียนโครงเดียวกันคนละชุด
 * ทั้งสามหน้ามี state ชุดนี้เหมือนกันเป๊ะ:
 *
 *   รายการ + กำลังโหลด + ข้อความผิดพลาด + คำค้น
 *   โหมดหน้าต่างย่อย + รายการที่เลือก + รายละเอียด + กำลังโหลดรายละเอียด
 *   กำลังบันทึก + ข้อความผิดพลาดของฟอร์ม
 *
 * และมีขั้นตอนเดียวกันเป๊ะ: โหลด → ค้นหา → เปิดดู → แก้ไข → บันทึก → โหลดใหม่
 *
 * ผลของการมีสามชุดคือเวลาแก้พฤติกรรมสักอย่าง (เช่นเปลี่ยนวิธีแสดง error)
 * ต้องไล่แก้สามที่ ซึ่งไม่เคยมีใครแก้ครบทั้งสามที่จริง ๆ สักครั้ง
 *
 * ─── สิ่งที่ไฟล์นี้ "ไม่" ทำ ───
 *
 * ไม่รู้จักฟอร์มแก้ไข ไม่รู้จักกติกาการตรวจข้อมูล ไม่รู้จักหน้าตา
 * เพราะสามอย่างนั้นต่างกันจริงในแต่ละหน้า การพยายามยุบเข้ามาด้วย
 * จะได้ฟังก์ชันที่รับ option สิบกว่าตัวแล้วอ่านยากกว่าเดิม
 *
 * แต่ละหน้าจึงเอาตัวนี้ไปเป็นฐาน แล้วต่อของเฉพาะตัวเองข้างบน
 */

/** ดึงข้อความจาก error ที่ไม่รู้ชนิด — โค้ดเดิมเขียนบรรทัดนี้ซ้ำกว่าสิบห้าครั้ง */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * ดึง id ออกจาก object ให้ได้ไม่ว่า backend จะส่งมาแบบไหน
 *
 * ⚠️ GORM ส่งคีย์หลักมาเป็น "ID" ตัวใหญ่ แต่ DTO บางเส้นแปลงเป็น "id" ตัวเล็ก
 * ถ้าอ่านแค่ตัวใดตัวหนึ่งจะได้ undefined เงียบ ๆ แล้วทั้งแถวกดอะไรไม่ได้เลย
 *
 * ใช้ร่วมกันระหว่างหน้าจัดการสมาชิกและหน้าจัดการผู้เรียน — เดิมแต่ละหน้าเขียนซ้ำเอง
 * ทั้งที่ทั้งคู่ใช้ useAdminResource ร่วมกันอยู่แล้ว
 */
export function getId(item: { id?: number } | null | undefined): number {
  return item?.id ?? (item as unknown as { ID?: number } | null | undefined)?.ID ?? 0;
}

interface AdminResourceConfig<TItem, TDetail> {
  /** ดึงรายการทั้งหมดมาแสดงในตาราง */
  fetchList: () => Promise<TItem[]>;

  /** ดึงรายละเอียดของรายการเดียว (ไม่ใส่ก็ได้ ถ้าหน้านั้นไม่มีหน้าต่างดูรายละเอียด) */
  fetchDetail?: (item: TItem) => Promise<TDetail>;

  /** เงื่อนไขว่ารายการนี้ตรงกับคำค้นหรือไม่ — term ถูกแปลงเป็นตัวพิมพ์เล็กมาแล้ว */
  matches: (item: TItem, term: string) => boolean;

  /** ข้อความเมื่อโหลดรายการไม่สำเร็จ */
  listError: string;

  /** ข้อความเมื่อโหลดรายละเอียดไม่สำเร็จ */
  detailError?: string;
}

export function useAdminResource<TItem, TDetail = unknown>(
  config: AdminResourceConfig<TItem, TDetail>,
) {
  const [items, setItems] = useState<TItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [modalMode, setModalMode] = useState<string | null>(null);
  const [selected, setSelected] = useState<TItem | null>(null);
  const [detail, setDetail] = useState<TDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /**
   * ⚠️ เก็บ config ไว้ใน ref แทนการอ้างถึงตรง ๆ — จุดนี้สำคัญมาก
   *
   * หน้าที่เรียกมักส่งฟังก์ชันแบบเขียนสด เช่น
   *
   *     useAdminResource({ fetchList: () => getAllCoachesAPI(), ... })
   *
   * ฟังก์ชันแบบนั้นเป็นวัตถุใหม่ทุกครั้งที่เรนเดอร์ ถ้า reload ไปผูกกับมันตรง ๆ
   * reload ก็จะเป็นวัตถุใหม่ทุกเรนเดอร์ตาม แล้ว effect ที่เรียก reload ก็จะทำงานใหม่
   * ซึ่งทำให้ setState แล้วเรนเดอร์ใหม่อีก — วนไม่หยุด ยิง API รัวจนเซิร์ฟเวอร์อ่วม
   *
   * การเก็บใน ref ตัดวงจรนั้นทิ้ง reload จึงเป็นตัวเดิมตลอดอายุของหน้า
   * แต่ยังอ่านค่าล่าสุดได้เสมอเพราะอัปเดต ref ทุกเรนเดอร์
   *
   * แปลว่าหน้าที่เรียก "ไม่ต้อง" ห่อฟังก์ชันด้วย useCallback เอง
   * ซึ่งเป็นเรื่องที่ลืมกันง่ายมากและอาการเวลาลืมก็หาต้นเหตุยาก
   */
  const configRef = useRef(config);

  /** เลขคำขอ "ดูรายละเอียด" ล่าสุด ใช้กันคำตอบมาไม่เรียงลำดับใน openView ด้านล่าง */
  const viewRequestId = useRef(0);

  // อัปเดตค่าใน ref หลังเรนเดอร์เสร็จ ไม่ใช่ระหว่างเรนเดอร์
  //
  // การเขียน ref ระหว่างเรนเดอร์ทำให้ผลลัพธ์ขึ้นกับว่า React เรนเดอร์กี่รอบ
  // ซึ่งเป็นเรื่องที่ React ไม่รับประกัน (โหมด strict เรนเดอร์ซ้ำสองรอบเสมอ)
  //
  // ไม่ใส่รายการ dependency โดยตั้งใจ — ต้องการให้ทำงานทุกครั้งที่เรนเดอร์
  // ค่าตอนสร้างครั้งแรกถูกต้องอยู่แล้วจาก useRef(config) การโหลดรอบแรกจึงไม่พลาด
  useEffect(() => {
    configRef.current = config;
  });

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setItems(await configRef.current.fetchList());
    } catch (err: unknown) {
      setError(errorMessage(err, configRef.current.listError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // โหลดครั้งแรกตอนเข้าหน้า
  //
  // ⚠️ eslint มีกฎห้ามเรียก setState ใน effect เพราะทำให้เรนเดอร์ซ้อน
  // แต่การโหลดข้อมูลตอนเข้าหน้าคือข้อยกเว้นที่ตั้งใจ — เราไม่มีทางรู้ข้อมูล
  // ก่อนจะไปถามเซิร์ฟเวอร์ และ setState เกิดหลัง await ไม่ใช่ในตัว effect ตรง ๆ
  //
  // เดิมคำสั่งปิดกฎนี้ต้องเขียนสามที่ (สามหน้า) ตอนนี้เหลือที่เดียว
  // ถ้าวันหนึ่งย้ายไปใช้ตัวจัดการข้อมูลอย่าง TanStack Query ก็แก้จุดนี้จุดเดียว
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const closeModal = useCallback(() => {
    setModalMode(null);
    setSelected(null);
    setDetail(null);
    setFormError(null);
  }, []);

  /**
   * เปิดหน้าต่างดูรายละเอียด
   *
   * ล้าง detail เป็น null ก่อนเสมอ ไม่งั้นจะเห็นข้อมูลของคนก่อนหน้าค้างอยู่
   * ระหว่างรอโหลด ซึ่งชวนให้เข้าใจผิดว่ากำลังดูของคนใหม่แล้ว
   *
   * ⚠️ กันคำตอบมาไม่เรียงลำดับ (out-of-order response)
   *
   * ถ้าคลิกดูรายการ A แล้วรีบคลิกดูรายการ B ต่อก่อนคำขอของ A จะโหลดเสร็จ
   * และคำขอของ A ตอบกลับช้ากว่า B จริง ๆ — ถ้าไม่กันไว้ setDetail ของ A
   * จะมาทับ detail ของ B ที่กำลังแสดงอยู่ ทำให้เห็นชื่อ B แต่ข้อมูลเป็นของ A
   * (ทุกหน้าที่พึ่ง base.detail รวมถึงตอนกด "แก้ไข" ต่อจากหน้าต่างดูข้อมูล
   * จึงเสี่ยงบันทึกข้อมูลทับผิดคนไปด้วย)
   *
   * requestId ทำหน้าที่เป็นตั๋วคิว: ก่อนจะเอาผลลัพธ์ไปใช้ ต้องเช็คก่อนว่า
   * ยังเป็นคำขอล่าสุดอยู่ไหม ถ้ามีคนคลิกดูรายการอื่นแซงไปแล้วก็ทิ้งผลลัพธ์นี้เงียบ ๆ
   */
  const openView = useCallback(async (item: TItem) => {
    setModalMode("view");
    setSelected(item);
    setDetail(null);

    const { fetchDetail, detailError } = configRef.current;
    if (!fetchDetail) return;

    const requestId = ++viewRequestId.current;
    setIsLoadingDetail(true);
    try {
      const result = await fetchDetail(item);
      if (viewRequestId.current !== requestId) return; // มีคำขอใหม่แซงไปแล้ว
      setDetail(result);
    } catch (err: unknown) {
      if (viewRequestId.current !== requestId) return;
      setError(errorMessage(err, detailError ?? "ไม่สามารถดึงรายละเอียดได้"));
    } finally {
      if (viewRequestId.current === requestId) setIsLoadingDetail(false);
    }
  }, []);

  /**
   * ทำงานที่ส่งจากฟอร์ม แล้วปิดหน้าต่างและโหลดข้อมูลใหม่ให้อัตโนมัติ
   *
   * รวมสี่ขั้นที่ต้องทำคู่กันเสมอไว้ที่เดียว: ล้าง error เดิม → ตั้งสถานะกำลังบันทึก
   * → ปิดหน้าต่างและโหลดใหม่เมื่อสำเร็จ → คืนสถานะเสมอแม้พลาด
   *
   * ⚠️ ถ้าลืมขั้นสุดท้าย ปุ่มบันทึกจะค้างเป็น disabled ตลอดไปเมื่อเกิดข้อผิดพลาด
   * ผู้ใช้จะกดอะไรไม่ได้เลยจนกว่าจะรีเฟรชหน้า
   */
  const submit = useCallback(
    async (action: () => Promise<void>, failMessage: string) => {
      setFormError(null);
      try {
        setIsSubmitting(true);
        await action();
        closeModal();
        await reload();
      } catch (err: unknown) {
        setFormError(errorMessage(err, failMessage));
      } finally {
        setIsSubmitting(false);
      }
    },
    [closeModal, reload],
  );

  // งานที่รอให้แอดมินกดยืนยัน (null = ไม่มีกล่องเปิดอยู่)
  const [pending, setPending] = useState<{
    message: string;
    action: () => Promise<void>;
    failMessage: string;
    tone: "danger" | "default";
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  /**
   * ถามยืนยันก่อนทำ แล้วโหลดข้อมูลใหม่เมื่อเสร็จ
   *
   * ใช้กับการลบและการสลับสถานะ ซึ่งเป็นการกระทำที่ย้อนกลับไม่ได้หรือย้อนยาก
   */
  // ⚠️ ห้ามกลับไปใช้ confirm() ของเบราว์เซอร์
  // ข้อความยืนยันการลบยาวหลายบรรทัด (บอกว่าอะไรหายอะไรอยู่) แต่ Chrome ตัดจบ
  // ด้วย "..." แอดมินจึงอ่านไม่ครบว่ากดแล้วจะเกิดอะไรขึ้นบ้าง
  const confirmAndRun = useCallback(
    async (
      message: string,
      action: () => Promise<void>,
      failMessage: string,
      tone: "danger" | "default" = "default",
    ) => {
      setPending({ message, action, failMessage, tone });
    },
    [],
  );

  const closeConfirm = useCallback(() => setPending(null), []);

  const runPending = useCallback(async () => {
    if (!pending || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await pending.action();
      await reload();
      setPending(null);
    } catch (err: unknown) {
      setPending(null);
      setError(errorMessage(err, pending.failMessage));
    } finally {
      setConfirmBusy(false);
    }
  }, [pending, confirmBusy, reload]);

  const term = searchTerm.trim().toLowerCase();
  const filtered = term ? items.filter((item) => config.matches(item, term)) : items;

  return {
    items,
    filtered,
    isLoading,
    error,
    setError,
    reload,

    searchTerm,
    setSearchTerm,

    modalMode,
    setModalMode,
    selected,
    setSelected,
    detail,
    setDetail,
    isLoadingDetail,
    openView,
    closeModal,

    isSubmitting,
    formError,
    setFormError,
    submit,
    confirmAndRun,
    // ส่งให้หน้าเอาไปผูกกับ <ConfirmDialog> — ทุกหน้าที่ใช้ hook นี้ต้องเรนเดอร์กล่อง
    confirmDialog: {
      open: pending !== null,
      message: pending?.message ?? "",
      tone: pending?.tone ?? "default",
      busy: confirmBusy,
      onConfirm: runPending,
      onCancel: closeConfirm,
    },
  };
}
