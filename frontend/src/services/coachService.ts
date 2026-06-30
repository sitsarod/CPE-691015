import { apiFetch } from './apiClient';
import { Coach, UICoach, DashboardCoach } from '../types/coach';
import { FALLBACK_COACHES, FALLBACK_DASHBOARD_COACHES } from '../constants/mockData';

export async function fetchCoaches(): Promise<Coach[]> {
  return apiFetch<Coach[]>('/api/coaches');
}

export function mapToUICoach(coach: Coach): UICoach {
  return {
    name: `โค้ช${coach.nickname || coach.first_name} (${coach.first_name} ${coach.last_name})`,
    role: coach.specialization ? 'Coach Staff' : 'Senior Coach',
    experience: `ผู้ฝึกสอนของสถาบัน เบอร์โทรติดต่อ: ${coach.phone}`,
    specialty: coach.specialization || 'ทักษะแบดมินตันทั่วไป',
    rating: '4.9',
  };
}

export function mapToDashboardCoach(coach: Coach): DashboardCoach {
  return {
    id: coach.ID,
    name: `โค้ช${coach.nickname || coach.first_name} (${coach.first_name} ${coach.last_name})`,
    role: coach.specialization || 'สตาฟผู้ฝึกสอน',
    hours: coach.phone ? `ติดต่อ: ${coach.phone}` : '42 ชั่วโมง',
    status: 'ปกติ',
  };
}

export async function getUICoaches(): Promise<UICoach[]> {
  try {
    const coaches = await fetchCoaches();
    if (coaches && coaches.length > 0) {
      return coaches.map(mapToUICoach);
    }
    return FALLBACK_COACHES;
  } catch (error) {
    console.warn('Backend API is down or empty, using fallback coaches data:', error);
    return FALLBACK_COACHES;
  }
}

export async function getDashboardCoaches(): Promise<DashboardCoach[]> {
  try {
    const coaches = await fetchCoaches();
    if (coaches && coaches.length > 0) {
      return coaches.map(mapToDashboardCoach);
    }
    return FALLBACK_DASHBOARD_COACHES;
  } catch (error) {
    console.warn('Backend not available, using fallback dashboard coaches list:', error);
    return FALLBACK_DASHBOARD_COACHES;
  }
}
