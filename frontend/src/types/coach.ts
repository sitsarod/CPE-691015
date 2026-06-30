export interface Coach {
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  DeletedAt?: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  uid: string;
  address: string;
  birth_date: string;
  nickname: string;
  profile_picture: string;
  specialization: string;
  bank_account: string;
  payment_info: string;
}

export interface UICoach {
  name: string;
  role: string;
  experience: string;
  specialty: string;
  rating: string;
}

export interface DashboardCoach {
  id: number | string;
  name: string;
  role: string;
  hours: string;
  status: string;
}
