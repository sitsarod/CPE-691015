'use client';

import React, { useEffect, useState, useRef } from 'react';
import { announcementAPI } from '@/services/announcementAPI';
import { Announcement, AnnouncementVisibility, Category } from '@/types/announcement';
import { MAX_UPLOAD_MB, validateImageSize } from '@/utils/imageUpload';
import { Plus, Edit2, Trash2, Calendar, Tag, X, Image as ImageIcon, Loader2, Users, Eye } from 'lucide-react';

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

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

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
    end_date: string;
  }>({
    title: '',
    content: '',
    image_url: '',
    link: '',
    visibility: 'all',
    category_id: '',
    start_date: '',
    end_date: '',
  });
  
  const [categoryName, setCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  
  // Image Upload State
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Data
  useEffect(() => {
    fetchData();
  }, []);

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
      alert('ไม่สามารถโหลดข้อมูลได้ โปรดตรวจสอบการเชื่อมต่อของคุณ');
    } finally {
      setLoading(false);
    }
  };

  // Handlers for Announcement
  const handleOpenAnnouncementModal = (announcement?: Announcement) => {
    if (announcement) {
      setEditingAnnouncement(announcement);
      setFormData({
        title: announcement.title,
        content: announcement.content,
        image_url: announcement.image_url || '',
        link: announcement.link || '',
        visibility: announcement.visibility || 'all',
        category_id: announcement.category_id.toString(),
        start_date: announcement.start_date.split('T')[0], // Extract YYYY-MM-DD
        end_date: announcement.end_date.split('T')[0],
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
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
    }
    setIsAnnouncementModalOpen(true);
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const categoryId = Number(formData.category_id);
      if (!categoryId) {
        alert("กรุณาเลือกหมวดหมู่ (Please select a category)");
        return;
      }

      // ลิงก์ที่แนบต้องเป็น http/https เท่านั้น — กัน scheme อันตราย เช่น "javascript:" ที่จะกลาย
      // เป็นช่องโหว่ XSS เมื่อหน้าเว็บลูกค้าเรนเดอร์เป็น <a href={link}> (backend ตรวจซ้ำอีกชั้นด้วย)
      const trimmedLink = formData.link.trim();
      if (trimmedLink) {
        const lower = trimmedLink.toLowerCase();
        if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
          alert('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https:// เท่านั้น');
          return;
        }
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
        end_date: new Date(formData.end_date).toISOString(),
      };

      if (editingAnnouncement) {
        await announcementAPI.updateAnnouncement(editingAnnouncement.id, payload);
      } else {
        await announcementAPI.createAnnouncement(payload);
      }
      setIsAnnouncementModalOpen(false);
      fetchData(); // Refresh list
    } catch (error: any) {
      alert(`เกิดข้อผิดพลาดในการบันทึกประกาศ: ${error.message}`);
    }
  };

  const handleDeleteAnnouncement = async (id: number) => {
    if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบประกาศนี้? การกระทำนี้ไม่สามารถยกเลิกได้')) {
      try {
        await announcementAPI.deleteAnnouncement(id);
        fetchData();
      } catch (error: any) {
        alert(`เกิดข้อผิดพลาดในการลบประกาศ: ${error.message}`);
      }
    }
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
      alert(`เกิดข้อผิดพลาดในการสร้างหมวดหมู่: ${error.message}`);
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
      alert(`เกิดข้อผิดพลาดในการแก้ไขหมวดหมู่: ${error.message}`);
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!window.confirm(`ต้องการลบหมวดหมู่ "${cat.name}" ใช่หรือไม่?`)) return;
    try {
      await announcementAPI.deleteCategory(cat.id);
      fetchData();
    } catch (error: any) {
      // Backend กัน "ลบหมวดหมู่ที่มีประกาศใช้งานอยู่" ไว้อยู่แล้ว (ErrCategoryInUse)
      // — แปลข้อความให้อ่านง่ายขึ้นแทนการโชว์ error ภาษาอังกฤษดิบ ๆ
      const msg = typeof error?.message === 'string' && error.message.toLowerCase().includes('in use')
        ? `ไม่สามารถลบหมวดหมู่ "${cat.name}" ได้ เนื่องจากมีประกาศที่ใช้หมวดหมู่นี้อยู่ กรุณาย้ายหรือลบประกาศเหล่านั้นก่อน`
        : `เกิดข้อผิดพลาดในการลบหมวดหมู่: ${error.message}`;
      alert(msg);
    }
  };

  // Handler for Image Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeError = validateImageSize(file);
    if (sizeError) {
      alert(sizeError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setUploadingImage(true);
      const url = await announcementAPI.uploadImage(file);
      setFormData(prev => ({
        ...prev,
        image_url: url
      }));
    } catch (error: any) {
      alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ${error.message}`);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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

      {/* Announcements — การ์ดบนมือถือ/แท็บเล็ต, ตารางบนจอใหญ่ */}
      {announcements.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-12 text-center text-gray-400">
          ไม่พบประกาศ คลิก "สร้างประกาศ" เพื่อเพิ่มรายการใหม่
        </div>
      ) : (
        <>
          {/* การ์ด: มือถือ/แท็บเล็ต */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:hidden">
            {announcements.map((ann) => {
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
                      <Eye size={12} /> {ann.view_count} ครั้ง
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
                  {announcements.map((ann) => {
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
                          {ann.view_count}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  รูปภาพหน้าปก (Cover Image) <span className="font-normal text-gray-400">— ไม่เกิน {MAX_UPLOAD_MB} MB</span>
                </label>
                <div className="flex flex-col items-stretch sm:items-start gap-4">
                  {formData.image_url && (
                    <img src={formData.image_url} alt="Cover Preview" className="w-full h-48 object-cover rounded-xl border border-gray-200 shadow-sm" />
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
                      accept="image/*"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่เริ่มต้นประกาศ</label>
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่สิ้นสุดประกาศ</label>
                  <input
                    type="date"
                    required
                    value={formData.end_date}
                    onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เนื้อหา</label>
                <textarea
                  required
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

    </div>
  );
}