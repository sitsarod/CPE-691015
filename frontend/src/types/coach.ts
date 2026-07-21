// frontend/src/types/coach.ts

export interface CoachProfile {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  nickname: string;
  phone: string;
  uid: string;
  address: string;
  birth_date: string;
  specialization: string;
  profile_picture: string;
  pay_rate_per_session: number;
}

export interface AvailabilitySlot {
  ID?: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

export interface WorkScheduleItem {
  ID: number;
  date: string;
  start_time: string;
  end_time: string;
  description: string;
  court_number: string;
  coach_id: number;
  course_id: number;
  course?: {
    course_name: string;
  };
}

export interface CoachWageEntry {
  id: number;
  expenseamount: number;
  expensetype: string;
  expensedescription: string;
  expensedate: string;
  receipturl: string;
  created_at: string;
}
