'use client';

import React, { useEffect, useState, useRef } from 'react';
import { announcementAPI } from '@/services/announcementAPI';
import { Announcement, Category } from '@/types/announcement';
import { MAX_UPLOAD_MB, validateImageSize } from '@/utils/imageUpload';
import { Plus, Edit2, Trash2, Calendar, Tag, X, Image as ImageIcon, Loader2 } from 'lucide-react';

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  
  // Form States
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    image_url: '',
    category_id: '',
    start_date: '',
    end_date: '',
  });
  
  const [categoryName, setCategoryName] = useState('');
  
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
      // Basic fallback to admin 1 if user context is missing
      const userIdStr = localStorage.getItem('userId');
      const userId = userIdStr ? Number(userIdStr) : 1; 

      const categoryId = Number(formData.category_id);
      if (!categoryId) {
        alert("กรุณาเลือกหมวดหมู่ (Please select a category)");
        return;
      }

      const payload = {
        title: formData.title,
        content: formData.content,
        image_url: formData.image_url,
        category_id: categoryId,
        user_id: userId,
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
      setIsCategoryModalOpen(false);
      fetchData();
    } catch (error: any) {
      alert(`เกิดข้อผิดพลาดในการสร้างหมวดหมู่: ${error.message}`);
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
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-500"></div>
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
        <div className="flex gap-3">
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg font-medium transition-colors"
          >
            <Tag size={18} />
            เพิ่มหมวดหมู่ใหม่
          </button>
          <button 
            onClick={() => handleOpenAnnouncementModal()}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium shadow-md shadow-orange-500/20 transition-all hover:-translate-y-0.5"
          >
            <Plus size={18} />
            สร้างประกาศ
          </button>
        </div>
      </div>

      {/* Announcements Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">รูปปก</th>
                <th className="px-6 py-4">หัวข้อ</th>
                <th className="px-6 py-4">หมวดหมู่</th>
                <th className="px-6 py-4">สถานะ / ระยะเวลา</th>
                <th className="px-6 py-4 text-center">ยอดเข้าชม</th>
                <th className="px-6 py-4 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {announcements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    ไม่พบประกาศ คลิก "สร้างประกาศ" เพื่อเพิ่มรายการใหม่
                  </td>
                </tr>
              ) : (
                announcements.map((ann) => {
                  const isExpired = new Date(ann.end_date) < new Date();
                  const isFuture = new Date(ann.start_date) > new Date();
                  
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
            
            <form onSubmit={handleSaveAnnouncement} className="overflow-y-auto p-6 flex flex-col gap-4">
              
              {/* Cover Image Upload */}
              <div className="mb-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  รูปภาพหน้าปก (Cover Image) <span className="font-normal text-gray-400">— ไม่เกิน {MAX_UPLOAD_MB} MB</span>
                </label>
                <div className="flex flex-col items-start gap-4">
                  {formData.image_url && (
                    <img src={formData.image_url} alt="Cover Preview" className="w-full h-48 object-cover rounded-xl border border-gray-200 shadow-sm" />
                  )}
                  <div className="flex items-center gap-3">
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
                    >
                      {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                      {uploadingImage ? 'กำลังอัปโหลด...' : (formData.image_url ? 'เปลี่ยนรูปภาพ' : 'อัปโหลดรูปภาพ')}
                    </button>
                    {formData.image_url && (
                      <button 
                        type="button" 
                        onClick={() => setFormData({...formData, image_url: ''})}
                        className="text-sm text-red-500 hover:text-red-700"
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
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                  placeholder="เช่น ปิดปรับปรุงระบบ"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่</label>
                <select 
                  required
                  value={formData.category_id}
                  onChange={(e) => setFormData({...formData, category_id: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                >
                  <option value="" disabled>เลือกหมวดหมู่...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่เริ่มต้นประกาศ</label>
                  <input 
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่สิ้นสุดประกาศ</label>
                  <input 
                    type="date"
                    required
                    value={formData.end_date}
                    onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
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
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all resize-none"
                  placeholder="เขียนเนื้อหาประกาศทั้งหมดที่นี่..."
                />
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAnnouncementModalOpen(false)}
                  className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium shadow-md shadow-orange-500/20 transition-colors"
                >
                  บันทึกประกาศ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">เพิ่มหมวดหมู่ใหม่</h2>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveCategory} className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อหมวดหมู่</label>
              <input 
                type="text"
                required
                autoFocus
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all mb-6"
                placeholder="เช่น โปรโมชั่น"
              />
              <div className="flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-900 text-white rounded-lg font-medium transition-colors"
                >
                  เพิ่มหมวดหมู่
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}