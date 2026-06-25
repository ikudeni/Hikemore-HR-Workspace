/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AppLog {
  id: string;
  action: string;
  userName: string;
  details: Record<string, string>;
  timestamp: string;
}

export interface Employee {
  id: string;
  nip?: string;
  name: string;
  dob: string;
  joinDate: string;
  gender: 'Laki-Laki' | 'Perempuan';
  religion: string;
  maritalStatus: string;
  edu: string;
  major: string;
  pos: string;
  dept: string;
  status: string;
  isActive: boolean;
  resignDate?: string;
  resignReason?: string;
  customDept?: string;
  customReligion?: string;
  customStatus?: string;
  customContractType?: string;
  contractType?: string;
  contractStart?: string;
  contractEnd?: string;
  managerId?: string; // For Organization Chart
  hideFromOrgChart?: boolean;
  isExternal?: boolean;
  isVirtualExternal?: boolean;
  avatar?: string;
  branch?: string;
  // Computed fields
  formattedJoinDate?: string;
  formattedResignDate?: string;
  calculatedDuration?: string;
  formattedDob?: string;
  calculatedAge?: number;
  documents?: { name: string; url: string; size?: number; type?: string }[];
}

export interface JobListing {
  id: number;
  title: string;
  dept: string;
  status: string;
  catBg: string;
  catText: string;
  catDot: string;
  applied: number;
  progress: number;
  accepted: number;
  isActiveJob: boolean;
  quota: number;
}

export interface KanbanStage {
  id: string;
  label: string;
  color: string;
  badgeColor: string;
}

export interface Candidate {
  id: number;
  jobId: number;
  name: string;
  email?: string;
  phone?: string;
  source: string;
  customSource?: string;
  stage: string;
  tag?: 'DITERIMA' | 'DITOLAK' | 'TIDAK HADIR' | 'TIDAK RESPON' | null;
  rating?: number;
  appliedDate: string;
  hiredDate?: string;
  documents?: { name: string; url: string; size?: number; type?: string }[];
}

export interface Schedule {
  id: number;
  candidateId?: number;
  candidateName?: string;
  interviewer?: string;
  title: string;
  description?: string;
  type: 'Meeting' | 'Task' | 'Event' | 'Interview Online' | 'Interview Offline' | 'Lainnya' | string;
  customType?: string;
  date: string; // ISO string or YYYY-MM-DD
  startTime: string;
  endTime: string;
  method: string; // e.g., 'Google Meet', 'Zoom', 'Room 2A'
  location?: string;
  participants: string[]; // for now just URLs or IDs
  link?: string;
  attendance?: 'Hadir' | 'Tidak Hadir' | 'Selesai' | null;
  listOrder?: number;
}

export interface DashboardWidget {
  id: string;
  type: string;
  span: 1 | 2 | 3;
}
