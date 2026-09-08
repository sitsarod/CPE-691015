'use client';

import React, { useEffect, useState, useRef } from 'react';
import { announcementAPI } from '@/services/announcementAPI';
import { Announcement, AnnouncementVisibility, Category } from '@/types/announcement';
import { MAX_UPLOAD_MB, IMAGE_ACCEPT, validateImageFile } from '@/utils/imageUpload';
import AnnouncementCoverCropModal from '@/components/AnnouncementCoverCropModal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Plus, Edit2, Trash2, Calendar, Tag, X, Image as ImageIcon, Loader2, Users, Eye, Crop, Search, ChevronLeft, ChevronRight } from 'lucide-react';

// ป้ายกำกับ + สีของตัวเลือก "แสดงให้ใครเห็น" — ใช้ทั้งในฟอร์มและตารางแสดงผล
const VISIBILITY_LABELS: Record<AnnouncementVisibility, string> = {
  all: 'ทุกคน',
  guest: 'ผู้เยี่ยมชมเท่านั้น',
  member: 'สมาชิกที่ล็อกอินเท่านั้น',
};
const VISIBILITY_BADGE_CLASSES: Record<AnnouncementVisibility, string> = {
  all: 'bg-sky-100 text-sky-800',
  guest: 'bg-amber-100 text-amber-800',
  member: 'bg-violet-100 text-violet-800',
};

// วันสิ้นสุดแบบ "ไม่มีวันหมดอายุ" — ยังคงต้องส่งเป็นวันที่จริงไปหลังบ้าน (ไม่มี field รองรับ null)
// จึงใช้วันที่ไกลมากในอนาคตแทน ระบบแสดงผล/ตรวจ "หมดอายุหรือยัง" จะถือว่ายัง active เสมอ
const NO_EXPIRY_END_DATE = '2099-12-31';
// ใช้เทียบตอนโหลดประกาศเดิมมาแก้ไข ว่าเข้าเกณฑ์ "ไม่มีวันหมดอายุ" หรือไม่ (กันปัญหา timezone ใกล้ปี 2099 พอดี)
const NO_EXPIRY_THRESHOLD_YEAR = 2098;

type EndDateMode = '1' | '3' | '5' | '7' | 'none' | 'custom';

// แปลง Date เป็นสตริง YYYY-MM-DD ตาม "เวลาท้องถิ่น" ไม่ใช่ UTC
// (เดิมใช้ toISOString() ซึ่งเป็น UTC ทำให้ไทย +7 คลาดวันไป 1 วัน เช่น ตั้งค่าวันนี้แต่ได้เมื่อวาน)
const toLocalDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
};

const daysBetween = (startStr: string, endStr: string): number => {
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // ค้นหาจากหัวข้อ + แบ่งหน้า (หน้าละ 8 รายการ) กันรายการยาวจนต้องเลื่อนหา
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 8;

  // Pop up ยืนยัน/แจ้งเตือนภายในเว็บ (แทน window.confirm / alert ของเบราว์เซอร์)
  const [dialog, setDialog] = useState<{
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    tone?: 'danger' | 'default';
    onConfirm?: () => void;
  } | null>(null);

  const showAlert = (message: string, title = 'แจ้งเตือน') =>
    setDialog({ title, message, confirmText: 'ตกลง' });

  const showConfirm = (
    message: string,
    onConfirm: () => void,
    opts?: { title?: string; confirmText?: string; tone?: 'danger' | 'default' }
  ) =>
    setDialog({
      title: opts?.title ?? 'ยืนยัน',
      message,
      confirmText: opts?.confirmText ?? 'ตกลง',
      cancelText: 'ยกเลิก',
      tone: opts?.tone ?? 'danger',
      onConfirm,
    });

  // Modal States
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  
  // Form States
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    image_url: string;
    link: string;
    visibility: AnnouncementVisibility;
    category_id: string;
    start_date: string;
    end_date_mode: EndDateMode;
    end_date_custom_days: string;
  }>({
    title: '',
    content: '',
    image_url: '',
    link: '',
    visibility: 'all',
    category_id: '',
    start_date: '',
    end_date_mode: '7',
    end_date_custom_days: '',
  });
  
  const [categoryName, setCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  
  // Image Upload State
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // object URL ของรูปที่เพิ่งเลือก ยังไม่ได้อัปโหลด — เปิดค้างไว้ระหว่างแอดมินครอบตัดรูป
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  // Fetch Data
  useEffect(() => {
    fetchData();
  }, []);

  // เปลี่ยนคำค้นแล้วเด้งกลับหน้าแรกเสมอ
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [annData, catData] = await Promise.all([
        announcementAPI.getAllAnnouncements(),
        announcementAPI.getAllCategories(),
      ]);
      setAnnouncements(annData || []);
      setCategories(catData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      showAlert('ไม่สามารถโหลดข้อมูลได้ โปรดตรวจสอบการเชื่อมต่อของคุณ');
    } finally {
      setLoading(false);
    }
  };

  // Handlers for Announcement
  const handleOpenAnnouncementModal = (announcement?: Announcement) => {
    if (announcement) {
      setEditingAnnouncement(announcement);
      const startDateStr = announcement.start_date.split('T')[0]; // Extract YYYY-MM-DD
      const endDateStr = announcement.end_date.split('T')[0];

      // แปลงวันสิ้นสุดที่บันทึกไว้ กลับมาเป็นตัวเลือกดรอปดาวน์ (1/3/5/7 วัน, ไม่มีวันหมดอายุ, หรืออื่นๆ)
      let endDateMode: EndDateMode = 'custom';
      let endDateCustomDays = '';
      if (new Date(endDateStr).getFullYear() >= NO_EXPIRY_THRESHOLD_YEAR) {
        endDateMode = 'none';
      } else {
        const diff = daysBetween(startDateStr, endDateStr);
        if (diff === 1 || diff === 3 || diff === 5 || diff === 7) {
          endDateMode = String(diff) as EndDateMode;
        } else {
          endDateMode = 'custom';
          endDateCustomDays = diff > 0 ? String(diff) : '';
        }
      }

      setFormData({
        title: announcement.title,
        content: announcement.content,
        image_url: announcement.image_url || '',
        link: announcement.link || '',
        visibility: announcement.visibility || 'all',
        category_id: announcement.category_id.toString(),
        start_date: startDateStr,
        end_date_mode: endDateMode,
        end_date_custom_days: endDateCustomDays,
      });
    } else {
      setEditingAnnouncement(null);
      setFormData({
        title: '',
        content: '',
        image_url: '',
        link: '',
        visibility: 'all',
        category_id: categories.length > 0 ? categories[0].id.toString() : '',
        // ค่าเริ่มต้นเป็นวันนี้เสมอ — ถ้าจะประกาศวันนี้แอดมินไม่ต้องแก้ไขช่องนี้เลย
        // แต่ยังแก้เป็นวันในอนาคตได้ตามปกติ หากต้องการตั้งประกาศล่วงหน้า
        start_date: toLocalDateStr(new Date()),
        end_date_mode: '7',
        end_date_custom_days: '',
      });
    }
    setIsAnnouncementModalOpen(true);
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const categoryId = Number(formData.category_id);
      if (!categoryId) {
        showAlert("กรุณาเลือกหมวดหมู่ (Please select a category)");
        return;
      }

      // ลิงก์ที่แนบต้องเป็น http/https เท่านั้น — กัน scheme อันตราย เช่น "javascript:" ที่จะกลาย
      // เป็นช่องโหว่ XSS เมื่อหน้าเว็บลูกค้าเรนเดอร์เป็น <a href={link}> (backend ตรวจซ้ำอีกชั้นด้วย)
      const trimmedLink = formData.link.trim();
      if (trimmedLink) {
        const lower = trimmedLink.toLowerCase();
        if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
          showAlert('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https:// เท่านั้น');
          return;
        }
      }

      // แปลงตัวเลือกวันหมดอายุ (1/3/5/7 วัน, ไม่มีวันหมดอายุ, หรือกำหนดเอง) ให้เป็นวันที่จริง
      // โดยอิงจากวันที่เริ่มต้นประกาศเสมอ
      let endDateStr: string;
      if (formData.end_date_mode === 'none') {
        endDateStr = NO_EXPIRY_END_DATE;
      } else if (formData.end_date_mode === 'custom') {
        const customDays = parseInt(formData.end_date_custom_days, 10);
        if (!customDays || customDays < 1) {
          showAlert('กรุณากรอกจำนวนวันหมดอายุเป็นตัวเลขที่มากกว่า 0');
          return;
        }
        endDateStr = addDays(formData.start_date, customDays);
      } else {
        endDateStr = addDays(formData.start_date, parseInt(formData.end_date_mode, 10));
      }

      // ประกาศที่แสดงเฉพาะผู้เยี่ยมชม (guest) ใช้แค่หัวข้อไปพาดหัวหน้าแรก ไม่บังคับกรอกเนื้อหา
      if (formData.visibility !== 'guest' && !formData.content.trim()) {
        showAlert('กรุณากรอกเนื้อหาข่าว');
        return;
      }

      // ไม่ส่ง user_id แล้ว — backend ดึงเจ้าของประกาศจาก JWT ของแอดมินที่ล็อกอินเอง
      // (กันการปลอมเจ้าของ และการแก้ไขประกาศจะไม่เปลี่ยนผู้เขียนเดิม)
      const payload = {
        title: formData.title,
        content: formData.content,
        image_url: formData.image_url,
        link: trimmedLink,
        visibility: formData.visibility,
        category_id: categoryId,
        start_date: new Date(formData.start_date).toISOString(),
        end_date: new Date(endDateStr).toISOString(),
      };

      if (editingAnnouncement) {
        await announcementAPI.updateAnnouncement(editingAnnouncement.id, payload);
      } else {
        await announcementAPI.createAnnouncement(payload);
      }
      setIsAnnouncementModalOpen(false);
      fetchData(); // Refresh list
    } catch (error: any) {
      showAlert(`เกิดข้อผิดพลาดในการบันทึกประกาศ: ${error.message}`);
    }
  };

  const handleDeleteAnnouncement = (id: number) => {
    showConfirm(
      'คุณแน่ใจหรือไม่ว่าต้องการลบประกาศนี้? การกระทำนี้ไม่สามารถยกเลิกได้',
      async () => {
        try {
          await announcementAPI.deleteAnnouncement(id);
          fetchData();
        } catch (error: any) {
          showAlert(`เกิดข้อผิดพลาดในการลบประกาศ: ${error.message}`);
        }
      },
      { title: 'ยืนยันการลบประกาศ', confirmText: 'ลบ', tone: 'danger' }
    );
  };

  // Handlers for Category
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    try {
      await announcementAPI.createCategory({ name: categoryName.trim() });
      setCategoryName('');
      fetchData();
    } catch (error: any) {
      showAlert(`เกิดข้อผิดพลาดในการสร้างหมวดหมู่: ${error.message}`);
    }
  };

  const handleStartEditCategory = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setEditingCategoryName(cat.name);
  };

  const handleCancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditingCategoryName('');
  };

  const handleSaveEditCategory = async (id: number) => {
    const trimmed = editingCategoryName.trim();
    if (!trimmed) return;
    try {
      await announcementAPI.updateCategory(id, { name: trimmed });
      setEditingCategoryId(null);
      setEditingCategoryName('');
      fetchData();
    } catch (error: any) {
      showAlert(`เกิดข้อผิดพลาดในการแก้ไขหมวดหมู่: ${error.message}`);
    }
  };

  const handleDeleteCategory = (cat: Category) => {
    showConfirm(
      `ต้องการลบหมวดหมู่ "${cat.name}" ใช่หรือไม่?`,
      async () => {
        try {
          await announcementAPI.deleteCategory(cat.id);
          fetchData();
        } catch (error: any) {
          // Backend กัน "ลบหมวดหมู่ที่มีประกาศใช้งานอยู่" ไว้อยู่แล้ว (ErrCategoryInUse)
          // — แปลข้อความให้อ่านง่ายขึ้นแทนการโชว์ error ภาษาอังกฤษดิบ ๆ
          const msg = typeof error?.message === 'string' && error.message.toLowerCase().includes('in use')
            ? `ไม่สามารถลบหมวดหมู่ "${cat.name}" ได้ เนื่องจากมีประกาศที่ใช้หมวดหมู่นี้อยู่ กรุณาย้ายหรือลบประกาศเหล่านั้นก่อน`
            : `เกิดข้อผิดพลาดในการลบหมวดหมู่: ${error.message}`;
          showAlert(msg);
        }
      },
      { title: 'ยืนยันการลบหมวดหมู่', confirmText: 'ลบ', tone: 'danger' }
    );
  };

  // Handler for Image Upload — เลือกไฟล์แล้วเปิดหน้าครอบตัดก่อน ยังไม่อัปโหลดทันที
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileError = validateImageFile(file);
    if (fileError) {
      showAlert(fileError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // ใช้ object URL ของไฟล์ในเครื่อง (ยังไม่อัปโหลด) เปิดโมดัลให้เลือกส่วนที่จะแสดง
    setCropSrc(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ยกเลิกการครอบตัด — ปิดโมดัลและคืนหน่วยความจำของ object URL ที่สร้างไว้
  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  // ยืนยันครอบตัดแล้ว — อัปโหลดเฉพาะส่วนที่เลือกไว้ขึ้น Cloudinary
  const handleCropDone = async (croppedFile: File) => {
    const srcToRevoke = cropSrc;
    setCropSrc(null);
    try {
      setUploadingImage(true);
      const url = await announcementAPI.uploadImage(croppedFile);
      setFormData(prev => ({
        ...prev,
        image_url: url
      }));
    } catch (error: any) {
      showAlert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ${error.message}`);
    } finally {
      setUploadingImage(false);
      if (srcToRevoke) URL.revokeObjectURL(srcToRevoke);
    }
  };

  // กรองจากหัวข้อ แล้วแบ่งหน้า
  const filteredAnnouncements = announcements.filter((a) =>
    a.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredAnnouncements.length / PAGE_SIZE));
  const pageItems = filteredAnnouncements.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // กันหน้าเกินขอบเขต (เช่น ลบรายการจนหน้าปัจจุบันหาย) — ดึงกลับหน้าสุดท้ายที่มีอยู่
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#CC0000]"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in fade-in duration-500">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการประกาศข่าวสาร</h1>
          <p className="text-gray-500 text-sm mt-1">จัดการข่าวสารสาธารณะ การแจ้งเตือน และโปรโมชั่น</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 md:py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg font-medium transition-colors"
          >
            <Tag size={18} />
            จัดการหมวดหมู่
          </button>
          <button
            onClick={() => handleOpenAnnouncementModal()}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 md:py-2 bg-[#CC0000] hover:bg-[#990000] text-white rounded-lg font-medium shadow-md shadow-[#CC0000]/20 transition-all hover:-translate-y-0.5"
          >
            <Plus size={18} />
            สร้างประกาศ
          </button>
        </div>
      </div>

      {/* แถบค้นหาจากหัวข้อ */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาจากหัวข้อประกาศ..."
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2.5 pl-10 pr-9 text-sm text-gray-700 focus:border-[#CC0000] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              aria-label="ล้างคำค้น"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Announcements — การ์ดบนมือถือ/แท็บเล็ต, ตารางบนจอใหญ่ */}
      {filteredAnnouncements.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-12 text-center text-gray-400">
          {searchQuery
            ? `ไม่พบประกาศที่ตรงกับ "${searchQuery}"`
            : 'ไม่พบประกาศ คลิก "สร้างประกาศ" เพื่อเพิ่มรายการใหม่'}
        </div>
      ) : (
        <>
          {/* การ์ด: มือถือ/แท็บเล็ต */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:hidden">
            {pageItems.map((ann) => {
              const isExpired = new Date(ann.end_date) < new Date();
              const isFuture = new Date(ann.start_date) > new Date();
              const visibility = ann.visibility || 'all';
              return (
                <div key={ann.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="relative h-36 bg-gray-100">
                    {ann.image_url ? (
                      <img src={ann.image_url} alt="Cover" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <ImageIcon size={28} />
                      </div>
                    )}
                    <span className={`absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full shadow-sm ${isExpired ? 'bg-red-100 text-red-600' : isFuture ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                      {isExpired ? 'หมดอายุ' : isFuture ? 'รอดำเนินการ' : 'กำลังใช้งาน'}
                    </span>
                  </div>
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <div className="font-semibold text-gray-900 line-clamp-2">{ann.title}</div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {ann.category?.name}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${VISIBILITY_BADGE_CLASSES[visibility]}`}>
                        <Users size={11} /> {VISIBILITY_LABELS[visibility]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(ann.start_date).toLocaleDateString('th-TH')} - {new Date(ann.end_date).toLocaleDateString('th-TH')}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Eye size={12} /> {visibility === 'guest' ? '-' : `${ann.view_count} ครั้ง`}
                    </div>
                    <div className="mt-auto pt-2 flex items-center gap-2 border-t border-gray-50">
                      <button
                        onClick={() => handleOpenAnnouncementModal(ann)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg font-medium text-sm transition-colors"
                      >
                        <Edit2 size={16} /> แก้ไข
                      </button>
                      <button
                        onClick={() => handleDeleteAnnouncement(ann.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg font-medium text-sm transition-colors"
                      >
                        <Trash2 size={16} /> ลบ
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ตาราง: จอใหญ่ */}
          <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">รูปปก</th>
                    <th className="px-6 py-4">หัวข้อ</th>
                    <th className="px-6 py-4">หมวดหมู่</th>
                    <th className="px-6 py-4">แสดงให้ใครเห็น</th>
                    <th className="px-6 py-4">สถานะ / ระยะเวลา</th>
                    <th className="px-6 py-4 text-center">ยอดเข้าชม</th>
                    <th className="px-6 py-4 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageItems.map((ann) => {
                    const isExpired = new Date(ann.end_date) < new Date();
                    const isFuture = new Date(ann.start_date) > new Date();
                    const visibility = ann.visibility || 'all';

                    return (
                      <tr key={ann.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          {ann.image_url ? (
                            <img src={ann.image_url} alt="Cover" className="w-16 h-10 object-cover rounded-md shadow-sm border border-gray-200" />
                          ) : (
                            <div className="w-16 h-10 bg-gray-100 rounded-md flex items-center justify-center text-gray-400 border border-gray-200">
                              <ImageIcon size={16} />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900 line-clamp-1">{ann.title}</div>
                          <div className="text-xs text-gray-500 line-clamp-1 mt-1">{ann.content.substring(0, 50)}...</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {ann.category?.name}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${VISIBILITY_BADGE_CLASSES[visibility]}`}>
                            <Users size={11} /> {VISIBILITY_LABELS[visibility]}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className={`text-xs font-semibold ${isExpired ? 'text-red-500' : isFuture ? 'text-blue-500' : 'text-green-500'}`}>
                              {isExpired ? 'หมดอายุ' : isFuture ? 'รอดำเนินการ' : 'กำลังใช้งาน'}
                            </span>
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Calendar size={12}/>
                              {new Date(ann.start_date).toLocaleDateString('th-TH')} - {new Date(ann.end_date).toLocaleDateString('th-TH')}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-medium">
                          {visibility === 'guest' ? '-' : ann.view_count}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenAnnouncementModal(ann)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              title="แก้ไข"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteAnnouncement(ann.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="ลบ"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* แถบแบ่งหน้า — บอกจำนวนหน้า + ปุ่มย้อน/ถัดไป (มุมขวาล่าง) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
            <p className="text-sm text-gray-500">
              แสดง {(currentPage - 1) * PAGE_SIZE + 1}
              {'–'}
              {Math.min(currentPage * PAGE_SIZE, filteredAnnouncements.length)} จาก {filteredAnnouncements.length} รายการ
            </p>
            <div className="flex items-center gap-3 sm:ml-auto">
              <span className="text-sm text-gray-600">
                หน้า {currentPage} / {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="หน้าก่อนหน้า"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="หน้าถัดไป"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Create/Edit Announcement Modal */}
      {isAnnouncementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800">
                {editingAnnouncement ? 'แก้ไขประกาศ' : 'สร้างประกาศใหม่'}
              </h2>
              <button onClick={() => setIsAnnouncementModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveAnnouncement} className="overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">

              {/* Cover Image Upload */}
              <div className="mb-2">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <Crop size={14} className="text-gray-400" />
                  รูปภาพหน้าปก (Cover Image) <span className="font-normal text-gray-400">— ไม่เกิน {MAX_UPLOAD_MB} MB เลือกไฟล์แล้วครอบตัดส่วนที่จะแสดงได้ก่อนอัปโหลด</span>
                </label>
                <div className="flex flex-col items-stretch sm:items-start gap-4">
                  {formData.image_url && (
                    <img src={formData.image_url} alt="Cover Preview" className="w-full h-48 object-contain bg-gray-50 rounded-xl border border-gray-200 shadow-sm" />
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
                    >
                      {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                      {uploadingImage ? 'กำลังอัปโหลด...' : (formData.image_url ? 'เปลี่ยนรูปภาพ' : 'อัปโหลดรูปภาพ')}
                    </button>
                    {formData.image_url && (
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, image_url: ''})}
                        className="px-3 py-2.5 text-sm text-red-500 hover:text-red-700"
                      >
                        ลบรูปภาพ
                      </button>
                    )}
                    <input
                      type="file"
                      accept={IMAGE_ACCEPT}
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หัวข้อ</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
                  placeholder="เช่น ปิดปรับปรุงระบบ"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่</label>
                  <select
                    required
                    value={formData.category_id}
                    onChange={(e) => setFormData({...formData, category_id: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
                  >
                    <option value="" disabled>เลือกหมวดหมู่...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                    <Users size={14} className="text-gray-400" /> แสดงให้ใครเห็น
                  </label>
                  <select
                    required
                    value={formData.visibility}
                    onChange={(e) => setFormData({...formData, visibility: e.target.value as AnnouncementVisibility})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
                  >
                    <option value="all">ทั้งคู่ (ผู้เยี่ยมชม + สมาชิก)</option>
                    <option value="guest">เฉพาะผู้เยี่ยมชม (ยังไม่ล็อกอิน)</option>
                    <option value="member">เฉพาะสมาชิกที่ล็อกอินแล้ว</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันที่เริ่มต้นประกาศ <span className="font-normal text-gray-400">— ค่าเริ่มต้นคือวันนี้</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
                  />
                  <p className="mt-1 text-xs text-gray-400">ถ้าจะประกาศวันนี้ไม่ต้องแก้ไขช่องนี้ หรือเลือกวันในอนาคตเพื่อตั้งประกาศล่วงหน้า</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันหมดอายุประกาศ</label>
                  <select
                    required
                    value={formData.end_date_mode}
                    onChange={(e) => setFormData({...formData, end_date_mode: e.target.value as EndDateMode})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
                  >
                    <option value="1">หมดอายุใน 1 วัน</option>
                    <option value="3">หมดอายุใน 3 วัน</option>
                    <option value="5">หมดอายุใน 5 วัน</option>
                    <option value="7">หมดอายุใน 7 วัน</option>
                    <option value="none">ไม่มีวันหมดอายุ</option>
                    <option value="custom">อื่นๆ (กำหนดจำนวนวันเอง)</option>
                  </select>
                  {formData.end_date_mode === 'custom' && (
                    <input
                      type="number"
                      min={1}
                      required
                      value={formData.end_date_custom_days}
                      onChange={(e) => setFormData({...formData, end_date_custom_days: e.target.value})}
                      placeholder="จำนวนวัน เช่น 14"
                      className="mt-2 w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เนื้อหา
                  {formData.visibility === 'guest' && (
                    <span className="font-normal text-gray-400"> — ไม่บังคับ (ประกาศนี้แสดงแค่หัวข้อบนหน้าแรกของผู้เยี่ยมชม)</span>
                  )}
                </label>
                <textarea
                  required={formData.visibility !== 'guest'}
                  rows={6}
                  value={formData.content}
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all resize-none"
                  placeholder="เขียนเนื้อหาประกาศทั้งหมดที่นี่..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ลิงก์ที่เกี่ยวข้อง <span className="font-normal text-gray-400">— ไม่บังคับ (เช่น ลิงก์สมัคร/รายละเอียดเพิ่มเติม)</span>
                </label>
                <input
                  type="url"
                  value={formData.link}
                  onChange={(e) => setFormData({...formData, link: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
                  placeholder="https://example.com/..."
                />
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAnnouncementModalOpen(false)}
                  className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#CC0000] hover:bg-[#990000] text-white rounded-lg font-medium shadow-md shadow-[#CC0000]/20 transition-colors"
                >
                  บันทึกประกาศ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Categories Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">จัดการหมวดหมู่</h2>
              <button
                onClick={() => { setIsCategoryModalOpen(false); handleCancelEditCategory(); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* รายการหมวดหมู่ที่มีอยู่ — แก้ไข/ลบได้ */}
            <div className="px-6 pt-4 overflow-y-auto">
              {categories.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีหมวดหมู่</p>
              ) : (
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg mb-2">
                  {categories.map((cat) => (
                    <li key={cat.id} className="flex items-center gap-2 px-3 py-2">
                      {editingCategoryId === cat.id ? (
                        <>
                          <input
                            type="text"
                            autoFocus
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); handleSaveEditCategory(cat.id); }
                              if (e.key === 'Escape') handleCancelEditCategory();
                            }}
                            className="flex-1 px-2 py-1 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEditCategory(cat.id)}
                            className="px-2 py-1 text-xs font-medium text-white bg-[#CC0000] hover:bg-[#990000] rounded-md transition-colors"
                          >
                            บันทึก
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEditCategory}
                            className="px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
                          >
                            ยกเลิก
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm text-gray-800">{cat.name}</span>
                          <button
                            type="button"
                            onClick={() => handleStartEditCategory(cat)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="แก้ไข"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="ลบ"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form onSubmit={handleSaveCategory} className="p-6 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">เพิ่มหมวดหมู่ใหม่</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
                  placeholder="เช่น โปรโมชั่น"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#CC0000] hover:bg-[#990000] text-white rounded-lg font-medium transition-colors whitespace-nowrap"
                >
                  เพิ่ม
                </button>
              </div>
              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={() => { setIsCategoryModalOpen(false); handleCancelEditCategory(); }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  ปิด
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ครอบตัดรูปภาพก่อนอัปโหลด — เปิดทันทีที่แอดมินเลือกไฟล์รูปหน้าปก */}
      {cropSrc && (
        <AnnouncementCoverCropModal
          src={cropSrc}
          onCancel={handleCropCancel}
          onConfirm={handleCropDone}
        />
      )}

      {/* Pop up ยืนยัน/แจ้งเตือนภายในเว็บ — แทน window.confirm / alert */}
      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title}
        message={dialog?.message ?? ''}
        confirmText={dialog?.confirmText}
        cancelText={dialog?.cancelText}
        tone={dialog?.tone}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          const cb = dialog?.onConfirm;
          setDialog(null);
          cb?.();
        }}
      />

    </div>
  );
}