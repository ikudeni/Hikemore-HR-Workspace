/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useDeferredValue, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DateRangePicker } from './ui/DateRangePicker';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { SearchableSelect } from './ui/FormSelect';
import { TimePicker } from './ui/TimePicker';
import { CustomDonutChartWidget } from './ui/DonutChart';
import { EduGaugeChart } from './ui/EduGaugeChart';
import { getSourceBadgeClass, removeUndefined } from '../utils';
import { Employee, JobListing, KanbanStage, Candidate, Schedule, DashboardWidget } from '../types';
import { EmployeeTrendChart } from './EmployeeTrendChart';
import { db, logActivity, storage, uploadFileToFirestore, getFileFromFirestore } from '../firebase';
import { doc, setDoc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  BarChart as ReBarChart, 
  Bar as ReBar, 
  XAxis as ReXAxis, 
  YAxis as ReYAxis, 
  CartesianGrid as ReCartesianGrid, 
  Tooltip as ReTooltip, 
  Legend as ReLegend,
  ResponsiveContainer as ReResponsiveContainer,
  PieChart as RePieChart, 
  Pie as RePie, 
  Cell as ReCell,
  AreaChart as ReAreaChart,
  Area as ReArea,
  ReferenceLine as ReReferenceLine
} from 'recharts';

interface BudgetAllocation {
  dept: string;
  allocated: number;
}

interface BudgetExpense {
  id: string;
  date: string;
  dept: string;
  category: string;
  amount: number;
  description: string;
  paymentMethod?: string;
}

const STATUS_COLORS_MAP: Record<string, string> = {
  'Karyawan': '#60A5FA',     // Soft Blue
  'Kontrak': '#A78BFA',      // Soft Purple
  'Outsource': '#4FD1C5',    // Soft Teal
  'Magang': '#F472B6',       // Soft Rose
  'Daily Worker': '#FBBF24', // Soft Amber
  'Freelance': '#34D399'     // Soft Emerald
};

const calculateTimeDuration = (start: string, end: string) => {
  if (!start || !end) return 0;
  const [h1, m1] = start.split('.').map(Number);
  const [h2, m2] = end.split('.').map(Number);
  const startTotalMinutes = h1 * 60 + m1;
  const endTotalMinutes = h2 * 60 + m2;
  const diff = endTotalMinutes - startTotalMinutes;
  return diff > 0 ? diff / 60 : 0;
};

const getMonthLabel = (dateStr: string) => {
  const parts = dateStr.split('-');
  if (parts.length < 2) return '';
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const monthsMapping: Record<number, string> = {
    0: 'Jan', 1: 'Feb', 2: 'Mar', 3: 'Apr', 4: 'Mei', 5: 'Jun',
    6: 'Jul', 7: 'Agu', 8: 'Sep', 9: 'Okt', 10: 'Nov', 11: 'Des'
  };
  return `${monthsMapping[m]} ${y}`;
};

interface DashboardContentProps {
  layout: DashboardWidget[];
  setLayout: React.Dispatch<React.SetStateAction<DashboardWidget[]>>;
  employees: Employee[];
  jobListings: JobListing[];
  setJobListings: React.Dispatch<React.SetStateAction<JobListing[]>>;
  kanbanStages: KanbanStage[];
  jobStagesMap: Record<number, string[]>;
  candidates: Candidate[];
  schedules: Schedule[];
  setSchedules: React.Dispatch<React.SetStateAction<Schedule[]>>;
}

export const DashboardContent = ({ 
  layout, setLayout, employees, jobListings, setJobListings, 
  kanbanStages, jobStagesMap, candidates, schedules, setSchedules 
}: DashboardContentProps) => {

  const spanClasses = {
    1: 'md:col-span-1',
    2: 'md:col-span-2',
    3: 'md:col-span-3',
  };

  const [barTooltip, setBarTooltip] = useState<{ show: boolean, x: number, y: number, data: any | null }>({ show: false, x: 0, y: 0, data: null });

  // Pipeline Job Drag & Drop state
  const [draggedPipelineJobId, setDraggedPipelineJobId] = useState<number | null>(null);
  const [pipelineDropIndex, setPipelineDropIndex] = useState<number | null>(null);
  const [dragPipelinePos, setDragPipelinePos] = useState({ x: -9999, y: -9999 });
  const dragPipelineOffset = useRef({ x: 0, y: 0, width: 0 });
  const customPipelineDragRef = useRef<HTMLDivElement>(null);
  const pipelineAutoScrollFrame = useRef<number | null>(null);
  const pipelineMousePos = useRef({ x: -1, y: -1 });

  // Refs for synchronized scrolling
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  // Filters for Employee Dashboard
  const [filterDept, setFilterDept] = useState('All Departemen');
  const [filterStatus, setFilterStatus] = useState('All Status');
  const [filterEdu, setFilterEdu] = useState('All Pendidikan');
  const [filterReligion, setFilterReligion] = useState('All Agama'); 
  const [filterGender, setFilterGender] = useState('All Gender'); 
  const [filterEmployeeId, setFilterEmployeeId] = useState<string | null>(null); 
  const [openDropdown, setOpenDropdown] = useState<string | null>(null); 
  
  const [activeDashboardTab, setActiveDashboardTab] = useState('Karyawan');
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const deferredEmployeeSearchTerm = useDeferredValue(employeeSearchTerm);

  // Filters for Recruitment Dashboard
  const [recFilter, setRecFilter] = useState<{ jobId: number | null, stageId: string | null, source: string | null, candidateId: number | null }>({
    jobId: null,
    stageId: null,
    source: null,
    candidateId: null
  });
  const [searchRecruitmentName, setSearchRecruitmentName] = useState('');

  useEffect(() => {
    const leftEl = leftScrollRef.current;
    const rightEl = rightScrollRef.current;
    if (leftEl && rightEl) {
      const handleScroll = (e: any) => {
        rightEl.scrollTop = e.target.scrollTop;
      };
      leftEl.addEventListener('scroll', handleScroll, { passive: true });
      return () => leftEl.removeEventListener('scroll', handleScroll);
    }
  }, [activeDashboardTab, jobListings]);

  const allActiveEmployees = useMemo(() => employees.filter(e => e.isActive), [employees]);
  const uniqueDepts = useMemo(() => [...new Set(allActiveEmployees.map(emp => emp.dept))], [allActiveEmployees]);
  const uniqueStatuses = useMemo(() => [...new Set(allActiveEmployees.map(emp => emp.status))], [allActiveEmployees]);
  const uniqueEdus = useMemo(() => [...new Set(allActiveEmployees.map(emp => emp.edu))], [allActiveEmployees]);
  const uniqueReligions = useMemo(() => [...new Set(allActiveEmployees.map(emp => emp.religion))], [allActiveEmployees]);

  const getFilteredEmployees = (excludeFilter: string | null = null) => {
    return employees.filter(emp => {
      if (!emp.isActive) return false;
      const matchDept = excludeFilter === 'dept' ? true : (filterDept === 'All Departemen' || emp.dept === filterDept);
      const matchStatus = excludeFilter === 'status' ? true : (filterStatus === 'All Status' || emp.status === filterStatus);
      const matchEdu = excludeFilter === 'edu' ? true : (filterEdu === 'All Pendidikan' || emp.edu === filterEdu);
      const matchReligion = excludeFilter === 'religion' ? true : (filterReligion === 'All Agama' || emp.religion === filterReligion);
      const matchGender = excludeFilter === 'gender' ? true : (filterGender === 'All Gender' || emp.gender === filterGender);
      const matchEmployee = excludeFilter === 'employee' ? true : (!filterEmployeeId || emp.id === filterEmployeeId);
      const matchSearch = emp.name.toLowerCase().includes(deferredEmployeeSearchTerm.toLowerCase());
      return matchDept && matchStatus && matchEdu && matchReligion && matchGender && matchEmployee && matchSearch;
    });
  };

  const activeEmployees = useMemo(() => getFilteredEmployees(), [employees, filterDept, filterStatus, filterEdu, filterReligion, filterGender, filterEmployeeId, deferredEmployeeSearchTerm]);
  const totalKaryawanAktif = activeEmployees.length;
  
  const rataUsia = useMemo(() => {
    if (activeEmployees.length === 1) return activeEmployees[0].calculatedAge;
    if (activeEmployees.length > 0) {
      const sum = activeEmployees.reduce((acc, curr) => acc + (curr.calculatedAge || 0), 0);
      return (sum / activeEmployees.length).toFixed(2).replace('.', ',');
    }
    return "0,00";
  }, [activeEmployees]);
  
  const genderStatsEmployees = useMemo(() => getFilteredEmployees('gender'), [employees, filterDept, filterStatus, filterEdu, filterReligion, filterEmployeeId, deferredEmployeeSearchTerm]);
  const totalLaki = genderStatsEmployees.filter(e => e.gender === 'Laki-Laki').length;
  const totalPerempuan = genderStatsEmployees.filter(e => e.gender === 'Perempuan').length;

  const chartDeptEmployees = useMemo(() => getFilteredEmployees('dept'), [employees, filterStatus, filterEdu, filterReligion, filterGender, filterEmployeeId, deferredEmployeeSearchTerm]);
  const chartStatusEmployees = useMemo(() => getFilteredEmployees('status'), [employees, filterDept, filterEdu, filterReligion, filterGender, filterEmployeeId, deferredEmployeeSearchTerm]);
  const chartEduEmployees = useMemo(() => getFilteredEmployees('edu'), [employees, filterDept, filterStatus, filterReligion, filterGender, filterEmployeeId, deferredEmployeeSearchTerm]);
  const chartReligionEmployees = useMemo(() => getFilteredEmployees('religion'), [employees, filterDept, filterStatus, filterEdu, filterGender, filterEmployeeId, deferredEmployeeSearchTerm]);

  const departemenDist = useMemo(() => {
    const deptMap: Record<string, { label: string, counts: Record<string, number>, total: number }> = {};
    chartDeptEmployees.forEach(e => {
      if (!deptMap[e.dept]) deptMap[e.dept] = { label: e.dept, counts: {}, total: 0 };
      deptMap[e.dept].counts[e.status] = (deptMap[e.dept].counts[e.status] || 0) + 1;
      deptMap[e.dept].total++;
    });
    return Object.values(deptMap)
      .filter(d => d.total > 0)
      .sort((a,b) => b.total - a.total);
  }, [chartDeptEmployees]);

  const createDonutData = (key: keyof Employee | 'source', colorMap: Record<string, string>, dataSource: any[]) => {
    const counts: Record<string, number> = {};
    dataSource.forEach(e => {
      const val = e[key];
      if (val) counts[val] = (counts[val] || 0) + 1;
    });
    const total = dataSource.length;
    return Object.keys(counts).map(label => ({
      label,
      count: counts[label],
      percentage: total ? (counts[label] / total) * 100 : 0,
      color: colorMap[label] || '#94A3B8'
    })).sort((a, b) => b.percentage - a.percentage);
  };

  const statusData = useMemo(() => createDonutData('status', STATUS_COLORS_MAP, chartStatusEmployees), [chartStatusEmployees]);

  const eduData = useMemo(() => createDonutData('edu', {
    'S2': '#4F46E5', 'S1': '#60A5FA', 'D4': '#4FD1C5', 'D3': '#7EDAD2', 'D2': '#A5F3EB', 'D1': '#CCFBF1',
    'SMA': '#A78BFA', 'SMK': '#C4B5FD', 'STM': '#DDD6FE', 'SMP': '#F472B6', 'SD': '#FBCFE8',
    'PPDS': '#6366F1', 'Spesialis': '#818CF8'
  }, chartEduEmployees), [chartEduEmployees]);

  const religionData = useMemo(() => createDonutData('religion', {
    'Islam': '#14B8A6',     // Soft Teal
    'Budha': '#FBBF24',     // Soft Amber
    'Kristen': '#60A5FA',   // Soft Blue
    'Katolik': '#A78BFA',   // Soft Purple
    'Hindu': '#FB7185'      // Soft Rose
  }, chartReligionEmployees), [chartReligionEmployees]);

  const activeJobs = useMemo(() => jobListings.filter(j => j.isActiveJob), [jobListings]);

  const validCandidates = useMemo(() => {
    const activeJobIds = new Set(activeJobs.map(j => j.id));
    return candidates.filter(c => activeJobIds.has(c.jobId));
  }, [candidates, activeJobs]);

  const stageColors = ['#F97316', '#C084FC', '#FBBF24', '#3B82F6', '#2DD4BF', '#F472B6', '#10B981', '#94A3B8'];
  
  const [isOvertimeModalOpen, setIsOvertimeModalOpen] = useState(false);
  const [editingOvertimeId, setEditingOvertimeId] = useState<number | null>(null);
  const [deleteOvertimeConfirm, setDeleteOvertimeConfirm] = useState<{isOpen: boolean, id: number | null}>({isOpen: false, id: null});
  const [overtimeFilterDept, setOvertimeFilterDept] = useState<string>('Semua Divisi');
  const [overtimeFilterStatus, setOvertimeFilterStatus] = useState<string>('Semua Status');
  const [overtimeFilterName, setOvertimeFilterName] = useState<string | null>(null);
  const [overtimeSearchName, setOvertimeSearchName] = useState<string>('');
  const [overtimeStartDate, setOvertimeStartDate] = useState<string | null>(() => {
    const today = new Date();
    if (today.getDate() > 20) {
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-21`;
    } else {
      const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 21);
      return `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-21`;
    }
  });
  const [overtimeEndDate, setOvertimeEndDate] = useState<string | null>(() => {
    const today = new Date();
    if (today.getDate() > 20) {
      const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 20);
      return `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-20`;
    } else {
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-20`;
    }
  });
  
  const [overtimeForm, setOvertimeForm] = useState({
    date: '',
    name: '',
    dept: '',
    status: '',
    desc: '',
    startTime: '',
    endTime: '',
    duration: 0,
    attachment: null as File | string | null,
    attachmentName: ''
  });

  const [overtimeEntries, setOvertimeEntries] = useState<{name: string, dept: string, status: string, startTime: string, endTime: string, duration: number}[]>([]);

  const [overtimeRecordsReact, setOvertimeRecordsReact] = useState<{id: number, date: string, name: string, dept: string, status?: string, desc: string, startTime: string, endTime: string, duration: number, attachment?: any}[]>([]);

  useEffect(() => {
    let unsubscribeRecords: (() => void) | undefined;
    const q = doc(db, 'settings', 'overtimeRecords');
    unsubscribeRecords = onSnapshot(q, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.records) setOvertimeRecordsReact(data.records);
      }
    });
    return () => {
      if (unsubscribeRecords) unsubscribeRecords();
    };
  }, []);

  const overtimeRecords = overtimeRecordsReact;

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const uniqueOvertimeDepts = useMemo(() => Array.from(new Set([
    ...employees.map(e => e.dept),
    ...overtimeRecords.map(r => r.dept)
  ].filter(Boolean))), [employees, overtimeRecords]);

  const uniqueOvertimeStatuses = useMemo(() => Array.from(new Set([
    ...employees.map(e => e.status),
    ...overtimeRecords.map(r => r.status)
  ].filter(Boolean))), [employees, overtimeRecords]);

  const uniqueOvertimeNames = useMemo(() => Array.from(new Set([
    ...employees.map(e => e.name),
    ...overtimeRecords.map(r => r.name)
  ].filter(Boolean))), [employees, overtimeRecords]);

  const uniqueOvertimeDates = useMemo(() => Array.from(new Set(overtimeRecords.map(r => r.date))), [overtimeRecords]);

  const handleOpenOvertimeModal = (record?: any) => {
    if (record) {
      setEditingOvertimeId(record.id);
      setOvertimeForm({
        date: record.date,
        name: record.name,
        dept: record.dept,
        status: record.status || '',
        desc: record.desc,
        startTime: record.startTime,
        endTime: record.endTime,
        duration: record.duration,
        attachment: record.attachment || null,
        attachmentName: ''
      });
      setOvertimeEntries([{
        name: record.name,
        dept: record.dept,
        status: record.status || '',
        startTime: record.startTime,
        endTime: record.endTime,
        duration: record.duration
      }]);
    } else {
      setEditingOvertimeId(null);
      setOvertimeForm({
        date: '', name: '', dept: '', status: '', desc: '', startTime: '', endTime: '', duration: 0, attachment: null, attachmentName: ''
      });
      setOvertimeEntries([]);
    }
    setIsOvertimeModalOpen(true);
  };

  const handleSaveOvertime = async () => {
    if (!overtimeForm.date) {
      alert('Silakan pilih tanggal lembur');
      return;
    }

    try {
      setIsSaving(true);
      const attachmentUrl = overtimeForm.attachment && typeof overtimeForm.attachment === 'string' ? overtimeForm.attachment : null;
      const docRef = doc(db, 'settings', 'overtimeRecords');
      let updatedList = [];
      
      if (editingOvertimeId) {
        updatedList = overtimeRecords.map(r => r.id === editingOvertimeId ? { 
          ...r,
          date: overtimeForm.date,
          desc: overtimeForm.desc,
          attachment: attachmentUrl,
          ...(overtimeEntries[0] || { name: r.name, dept: r.dept, startTime: r.startTime, endTime: r.endTime, duration: r.duration })
        } : r);
      } else {
        let maxId = Math.max(0, ...overtimeRecords.map(r => r.id));
        const newRecords = overtimeEntries.map((e, idx) => ({
          id: maxId + 1 + idx,
          date: overtimeForm.date,
          desc: overtimeForm.desc,
          attachment: attachmentUrl,
          ...e
        }));
        updatedList = [...overtimeRecords, ...newRecords];
      }
      
      // Update UI immediately (optimistic)
      setOvertimeRecordsReact(updatedList);
      setIsOvertimeModalOpen(false);
      
      // Reset isSaving immediately after we close the modal and update local state
      // to prevent "stuck" UI if the background sync takes a moment.
      setIsSaving(false);

      // Save to Firestore without blocking the UI
      try {
        const docSnap = await getDoc(docRef);
        let latestRecords: any[] = [];
        if (docSnap.exists() && docSnap.data().records) {
          latestRecords = docSnap.data().records;
        }

        let updatedDbList = [];
        if (editingOvertimeId) {
          updatedDbList = latestRecords.map(r => r.id === editingOvertimeId ? { 
            ...r,
            date: overtimeForm.date,
            desc: overtimeForm.desc,
            attachment: attachmentUrl,
            ...(overtimeEntries[0] || { name: r.name, dept: r.dept, startTime: r.startTime, endTime: r.endTime, duration: r.duration })
          } : r);
        } else {
          let maxDbId = latestRecords.length > 0 ? Math.max(...latestRecords.map(r => r.id)) : 0;
          const newDbRecords = overtimeEntries.map((e, idx) => ({
            id: maxDbId + 1 + idx,
            date: overtimeForm.date,
            desc: overtimeForm.desc,
            attachment: attachmentUrl,
            ...e
          }));
          updatedDbList = [...latestRecords, ...newDbRecords];
        }

        const sanitized = removeUndefined(updatedDbList);
        await setDoc(docRef, { records: sanitized }, { merge: true });
        logActivity(editingOvertimeId ? 'Update Lembur' : 'Input Lembur', { date: overtimeForm.date });
      } catch (err) {
        console.error("Failed to sync with Firestore", err);
      }

    } catch (error) {
      console.error("Failed to save overtime record", error);
      alert('Gagal menyimpan data lembur: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsSaving(false);
      setIsUploading(false);
    }
  };

  const confirmDeleteOvertime = (id: number) => {
    setDeleteOvertimeConfirm({ isOpen: true, id });
  };

  const executeDeleteOvertime = async () => {
    if (deleteOvertimeConfirm.id !== null) {
      try {
        const idToDelete = deleteOvertimeConfirm.id;
        const updatedRecords = overtimeRecords.filter(r => r.id !== idToDelete);
        const docRef = doc(db, 'settings', 'overtimeRecords');
        
        // Update UI immediately
        setOvertimeRecordsReact(updatedRecords);
        setDeleteOvertimeConfirm({ isOpen: false, id: null });
        
        // Sync in background
        const docSnap = await getDoc(docRef);
        let latestRecords: any[] = [];
        if (docSnap.exists() && docSnap.data().records) {
          latestRecords = docSnap.data().records;
        }
        const updatedDbList = latestRecords.filter(r => r.id !== idToDelete);
        
        await setDoc(docRef, { records: removeUndefined(updatedDbList) }, { merge: true });
        logActivity('Hapus Lembur', { id: idToDelete });
      } catch (error) {
        console.error("Failed to delete overtime record", error);
        alert('Gagal menghapus data lembur');
      }
    }
  };

  const filteredOvertimeRecords = useMemo(() => {
    return overtimeRecords.filter(r => {
      const matchDept = overtimeFilterDept === 'Semua Divisi' || overtimeFilterDept === 'Divisi (Lembur)' || r.dept === overtimeFilterDept;
      const matchStatus = overtimeFilterStatus === 'Semua Status' || r.status === overtimeFilterStatus;
      
      let matchDate = true;
      if (overtimeStartDate && overtimeEndDate) {
        matchDate = r.date >= overtimeStartDate && r.date <= overtimeEndDate;
      } else if (overtimeStartDate) {
        matchDate = r.date >= overtimeStartDate;
      } else if (overtimeEndDate) {
        matchDate = r.date <= overtimeEndDate;
      }

      const matchName = !overtimeFilterName || r.name === overtimeFilterName;
      const matchSearchName = r.name.toLowerCase().includes(overtimeSearchName.toLowerCase());
      return matchDept && matchStatus && matchDate && matchName && matchSearchName;
    }).sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return (a.dept || '').localeCompare(b.dept || '');
    });
  }, [overtimeRecords, overtimeFilterDept, overtimeFilterStatus, overtimeStartDate, overtimeEndDate, overtimeFilterName, overtimeSearchName]);

  const dateFilteredOvertimeRecords = useMemo(() => {
    return overtimeRecords.filter(r => {
      let matchDate = true;
      if (overtimeStartDate && overtimeEndDate) {
        matchDate = r.date >= overtimeStartDate && r.date <= overtimeEndDate;
      } else if (overtimeStartDate) {
        matchDate = r.date >= overtimeStartDate;
      } else if (overtimeEndDate) {
        matchDate = r.date <= overtimeEndDate;
      }
      return matchDate;
    });
  }, [overtimeRecords, overtimeStartDate, overtimeEndDate]);

  const totalOvertimeEmployees = useMemo(() => new Set(filteredOvertimeRecords.map(r => r.name)).size, [filteredOvertimeRecords]);
  const totalOvertimeDuration = useMemo(() => filteredOvertimeRecords.reduce((acc, r) => acc + r.duration, 0), [filteredOvertimeRecords]);
  const avgOvertimeDuration = useMemo(() => (filteredOvertimeRecords.length > 0 ? (totalOvertimeDuration / totalOvertimeEmployees).toFixed(1).replace('.', ',') : "0,0"), [totalOvertimeDuration, totalOvertimeEmployees, filteredOvertimeRecords.length]);
  const overtimeDeptsCount = useMemo(() => new Set(filteredOvertimeRecords.map(r => r.dept)).size, [filteredOvertimeRecords]);

  const selectedDeptFromName = useMemo(() => {
    if (!overtimeFilterName) return null;
    return overtimeRecords.find(r => r.name === overtimeFilterName)?.dept || null;
  }, [overtimeFilterName, overtimeRecords]);

  const effectiveSelectedDept = overtimeFilterDept !== 'Semua Divisi' ? overtimeFilterDept : selectedDeptFromName;

  const overtimeDeptDist = useMemo(() => {
    const dist: Record<string, number> = {};
    filteredOvertimeRecords.forEach(r => {
      dist[r.dept] = (dist[r.dept] || 0) + r.duration;
    });
    return Object.entries(dist).map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  }, [filteredOvertimeRecords]);

  const overtimeSummaryByEmployee = useMemo(() => {
    const summary: Record<string, { name: string, dept: string, totalDuration: number }> = {};
    filteredOvertimeRecords.forEach(r => {
      if (!summary[r.name]) summary[r.name] = { name: r.name, dept: r.dept, totalDuration: 0 };
      summary[r.name].totalDuration += r.duration;
    });
    return Object.values(summary).sort((a,b) => b.totalDuration - a.totalDuration);
  }, [filteredOvertimeRecords]);

  // --- Analitik Kontrak ---
  const [kontrakFilterDept, setKontrakFilterDept] = useState<string>('All Departemen');
  const [kontrakFilterType, setKontrakFilterType] = useState<string>('All Jenis Kontrak');
  const [kontrakFilterStatus, setKontrakFilterStatus] = useState<string>('All Status');
  const [kontrakCrossFilter, setKontrakCrossFilter] = useState<'ACTIVE' | 'EXPIRED' | 'PROBATION' | 'CRITICAL' | null>(null);
  const [searchKontrak, setSearchKontrak] = useState<string>('');
  const [uploadingContracts, setUploadingContracts] = useState<Record<string, boolean>>({});
  const [selectedEmpIdForUpload, setSelectedEmpIdForUpload] = useState<string | null>(null);
  const contractFileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadContractFile = async (empId: string, file: File) => {
    setUploadingContracts(prev => ({ ...prev, [empId]: true }));
    try {
      const storageUrl = await uploadFileToFirestore(file);
      await updateDoc(doc(db, 'employees', empId), {
        contractFile: {
          name: file.name,
          url: storageUrl,
          uploadedAt: new Date().toISOString()
        }
      });
      await logActivity('Upload Contract File', {
        employeeId: empId,
        fileName: file.name,
        details: `Mengunggah file kontrak untuk karyawan ${empId}`
      });
    } catch (err: any) {
      console.error("Gagal mengunggah file kontrak:", err);
      alert(err.message || "Gagal mengunggah file kontrak.");
    } finally {
      setUploadingContracts(prev => ({ ...prev, [empId]: false }));
    }
  };

  const handleDeleteContractFile = async (empId: string) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus file kontrak ini?")) return;
    try {
      await updateDoc(doc(db, 'employees', empId), {
        contractFile: null
      });
      await logActivity('Delete Contract File', {
        employeeId: empId,
        details: `Menghapus file kontrak untuk karyawan ${empId}`
      });
    } catch (err: any) {
      console.error("Gagal menghapus file kontrak:", err);
      alert("Gagal menghapus file kontrak.");
    }
  };

  const handleContractFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedEmpIdForUpload) {
      handleUploadContractFile(selectedEmpIdForUpload, file);
    }
    setSelectedEmpIdForUpload(null);
    if (e.target) {
      e.target.value = '';
    }
  };
  const [isKontrakModalOpen, setIsKontrakModalOpen] = useState(false);
  const [isEditingKontrak, setIsEditingKontrak] = useState(false);
  const [contractOverridesReact, setContractOverridesReact] = useState<Record<string, any>>({});

  useEffect(() => {
    let unsubscribeContract: (() => void) | undefined;
    const q = doc(db, 'settings', 'contractOverrides');
    unsubscribeContract = onSnapshot(q, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.overrides) setContractOverridesReact(data.overrides);
      }
    });
    return () => {
      if (unsubscribeContract) unsubscribeContract();
    };
  }, []);

  const contractOverrides = contractOverridesReact;
  const setContractOverrides: React.Dispatch<React.SetStateAction<Record<string, any>>> = React.useCallback((valOrFn) => {
    setContractOverridesReact(prev => {
      const newVal = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      const sanitizedVal = removeUndefined(newVal);
      
      const docRef = doc(db, 'settings', 'contractOverrides');
      getDoc(docRef).then(docSnap => {
        let latest = {};
        if (docSnap.exists() && docSnap.data().overrides) {
          latest = docSnap.data().overrides;
        }
        // Instead of completely replacing, since valOrFn operates on `prev` locally, we should just merge the new changes
        // Since we don't know exactly what changed if it's deeply changed, merging at the top 'overrides' level is safest.
        // Actually since we only update one employee at a time in the UI, we can just mix `latest` and `newVal`.
        // The safest approach is:
        const combined = { ...latest, ...sanitizedVal };
        setDoc(docRef, { overrides: combined }, { merge: true }).catch(console.error);
      }).catch(console.error);
      
      return newVal;
    });
  }, []);
  const [kontrakForm, setKontrakForm] = useState({
    employeeId: '',
    contractType: 'Kontrak Lanjutan',
    contractStart: '',
    contractEnd: ''
  });

  const handleSaveKontrak = async () => {
    if (kontrakForm.employeeId && kontrakForm.contractStart && kontrakForm.contractEnd) {
      try {
        // Update direct employee document in Firestore to sync with employee menu (Karyawan)
        await updateDoc(doc(db, 'employees', kontrakForm.employeeId), {
          contractType: kontrakForm.contractType,
          contractStart: kontrakForm.contractStart,
          contractEnd: kontrakForm.contractEnd
        });

        setContractOverrides(prev => ({
          ...prev,
          [kontrakForm.employeeId]: {
            contractType: kontrakForm.contractType,
            contractStart: kontrakForm.contractStart,
            contractEnd: kontrakForm.contractEnd
          }
        }));

        await logActivity(isEditingKontrak ? 'Edit Data Kontrak' : 'Input Data Kontrak', {
          employeeId: kontrakForm.employeeId,
          contractType: kontrakForm.contractType,
          contractStart: kontrakForm.contractStart,
          contractEnd: kontrakForm.contractEnd
        });

        setIsKontrakModalOpen(false);
        setIsEditingKontrak(false);
        setKontrakForm({ employeeId: '', contractType: 'Kontrak Lanjutan', contractStart: '', contractEnd: '' });
      } catch (err) {
        console.error("Gagal menyimpan data kontrak:", err);
        alert("Gagal menyimpan data kontrak ke database.");
      }
    }
  };

  // --- Analitik Budget States ---
  const [budgetAllocations, setBudgetAllocations] = useState<BudgetAllocation[]>(() => {
    const saved = localStorage.getItem('hikemore_budget_allocations');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [
      { dept: 'HR & GA', allocated: 10000000 },
      { dept: 'Marketing', allocated: 8000000 },
      { dept: 'IT', allocated: 5000000 },
      { dept: 'Operational', allocated: 4004740 },
      { dept: 'Finance & Accounting', allocated: 3000000 }
    ];
  });

  const [budgetExpenses, setBudgetExpenses] = useState<BudgetExpense[]>(() => {
    const saved = localStorage.getItem('hikemore_budget_expenses_v4');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    const rawData = [
  {
    "id": "exp-sheet-1",
    "date": "2025-01-08",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 944610,
    "description": "Top Up saldo Shopee Pay untuk posting loker Sales Marketing - B2B at Jobstreet",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-2",
    "date": "2025-01-28",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 50500,
    "description": "Pembelian Kuota No HRD 0881010514952",
    "paymentMethod": "Transfer bank"
  },
  {
    "id": "exp-sheet-3",
    "date": "2025-02-28",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 944610,
    "description": "Top Up saldo Shopee Pay untuk posting loker Sales Marketing - B2B at Jobstreet",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-4",
    "date": "2025-03-01",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 50000,
    "description": "Cetak ID card an. Aza dan intern",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-5",
    "date": "2025-03-03",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 1154400,
    "description": "Top Up saldo Shopee Pay untuk posting loker Digital Marketing Coordinator at Jobstreet",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-6",
    "date": "2025-03-20",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 322160,
    "description": "Pemesanan ID card Karyawan Toko, HR, Marketing, Accounting dan gudang pusat 29 orang",
    "paymentMethod": "Transfer bank"
  },
  {
    "id": "exp-sheet-7",
    "date": "2025-04-13",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 19800,
    "description": "Pulsa 0881010514952 Nomor HRD",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-8",
    "date": "2025-04-13",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 67500,
    "description": "Kuota 0881010514952 Nomor HRD",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-9",
    "date": "2025-04-20",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 24000,
    "description": "Tambahan cetak 2 ID card untuk produksi",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-10",
    "date": "2025-05-02",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 233100,
    "description": "Perpanjang langganan Glints HRD",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-11",
    "date": "2025-06-12",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 30000,
    "description": "Reimburse pembelian kabel USB HRD",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-12",
    "date": "2025-06-24",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 1221000,
    "description": "Top Up saldo Shopee Pay untuk posting loker Merchandiser at Jobstreet",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-13",
    "date": "2025-07-03",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 350000,
    "description": "Biaya Service laptop untuk merchandiser",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-14",
    "date": "2025-07-13",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 41000,
    "description": "Pembelian lem aibon dan lakban hitam HRD",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-15",
    "date": "2025-07-25",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 1221000,
    "description": "Top Up saldo Shopee Pay untuk posting loker Head of Digital Marketing at Jobstreet",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-16",
    "date": "2025-08-06",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 166500,
    "description": "Update Glints VIP HRD untuk posting loker (PIC Deni)",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-17",
    "date": "2025-08-06",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 1243200,
    "description": "Top Up saldo Shopee Pay untuk posting loker Sales B2B at Jobstreet",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-18",
    "date": "2025-08-17",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 15000,
    "description": "Pembelian plastick bussiness file 1 pack untuk HRD",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-19",
    "date": "2025-09-05",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 125000,
    "description": "Pembayaran posting loker at IG: anakmagangid for internship batch 3",
    "paymentMethod": "Transfer bank"
  },
  {
    "id": "exp-sheet-20",
    "date": "2025-09-08",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 166500,
    "description": "Update Glints VIP HRD untuk posting loker (PIC Deni)",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-21",
    "date": "2025-09-19",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 1221000,
    "description": "Top Up saldo Shopee Pay untuk posting loker Merchandiser at Jobstreet",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-22",
    "date": "2025-09-29",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 70000,
    "description": "Biaya Cetak ID Card 2 pcs (Pak Guntur dan Dicky) PIC Pak Deni HRD",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-23",
    "date": "2025-10-01",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 3179010,
    "description": "Perpanjang akun Gajihub",
    "paymentMethod": "Transfer bank"
  },
  {
    "id": "exp-sheet-24",
    "date": "2025-10-15",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 1398600,
    "description": "Top Up saldo Shopee Pay untuk posting loker Ads Specialist at Jobstreet",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-25",
    "date": "2025-10-20",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 14000,
    "description": "ongkir sertifikat fisik anak magang an MUHAMMAD SALIM DAN BINTANG",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-26",
    "date": "2025-10-28",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 233100,
    "description": "Update Glints VIP HRD untuk posting loker",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-27",
    "date": "2025-11-05",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 50000,
    "description": "Biaya Cetak ID card 2 pcs",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-28",
    "date": "2025-11-13",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 23000,
    "description": "Pembelian colokan Letter T untuk di HRD",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-29",
    "date": "2025-11-25",
    "dept": "HR & GA",
    "category": "Biaya Lain-Lain",
    "amount": 40000,
    "description": "Beli air minum botol uk. 330ml 1 dus untuk di Gedung HRD",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-30",
    "date": "2025-12-06",
    "dept": "HR & GA",
    "category": "Biaya Lain-Lain",
    "amount": 88000,
    "description": "Reimburse biaya makan HRD dan tamu surabaya (Pak Dedy)",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-31",
    "date": "2025-12-08",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 166500,
    "description": "Reimburse biaya Glints VIP HR",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-32",
    "date": "2025-12-11",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 1487400,
    "description": "Top Up saldo Shopee Pay untuk posting loker Business Development at Jobstreet",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-33",
    "date": "2025-12-12",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 80000,
    "description": "Posting Loker Hikemore Surabaya di IG @surabayalowker",
    "paymentMethod": "Transfer bank"
  },
  {
    "id": "exp-sheet-34",
    "date": "2025-12-18",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 398000,
    "description": "Add-on Lokasi Kantor GajiHub",
    "paymentMethod": "Transfer bank"
  },
  {
    "id": "exp-sheet-35",
    "date": "2025-12-23",
    "dept": "HR & GA",
    "category": "Biaya Lain-Lain",
    "amount": 150000,
    "description": "Biaya perbaikan kunci pintu HRD",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-36",
    "date": "2025-12-29",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 1221000,
    "description": "Top Up saldo Shopee Pay untuk posting loker Accounting & Tax at Jobstreet",
    "paymentMethod": "Qris"
  },
  {
    "id": "exp-sheet-37",
    "date": "2026-01-07",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 85000,
    "description": "Service Printer Epson L3110 (Tinta Hitam Rusak)",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-38",
    "date": "2026-01-07",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 25000,
    "description": "Beli Kabel Printer",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-39",
    "date": "2026-01-07",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 20000,
    "description": "Beli Kertas Concorde 1 Bundle",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-40",
    "date": "2026-01-15",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 166500,
    "description": "Top Up 150 Glints Credits (Glints VIP (1 bulan))",
    "paymentMethod": "Transfer bank"
  },
  {
    "id": "exp-sheet-41",
    "date": "2026-01-17",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 100000,
    "description": "Cetak ID Card 4 Karyawan (Reza, Iqbal, Ajay, Riski)",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-42",
    "date": "2026-01-20",
    "dept": "HR & GA",
    "category": "Biaya Lain-Lain",
    "amount": 180000,
    "description": "Sewa lapangan badminton (2 lapangan & 2 jam = 180.000)",
    "paymentMethod": "Transfer bank"
  },
  {
    "id": "exp-sheet-43",
    "date": "2026-01-20",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 125000,
    "description": "Posting loker magang di @anakmagang.id",
    "paymentMethod": "Transfer bank"
  },
  {
    "id": "exp-sheet-44",
    "date": "2026-01-24",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 14400,
    "description": "Print Sertifikat Magang (Prabu & Fiqri)",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-45",
    "date": "2026-01-29",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 100000,
    "description": "Cetak ID Card 4 Karyawan (Narissa, Cindy, Santika, Evan)",
    "paymentMethod": "Tunai"
  },
  {
    "id": "exp-sheet-46",
    "date": "2026-02-10",
    "dept": "HR & GA",
    "category": "Operasional HR",
    "amount": 385494,
    "description": "Add on tambah 10 karyawan digajihub",
    "paymentMethod": "Transfer bank"
  },
  {
    "id": "exp-sheet-47",
    "date": "2026-03-30",
    "dept": "HR & GA",
    "category": "Rekrutmen",
    "amount": 233100,
    "description": "Glints VIP (1 bulan)",
    "paymentMethod": "Transfer bank"
  }];
    
    // Shift all initial sheet dates dynamically so the latest entry ('2026-03-30') falls exactly on 'today'
    const today = new Date();
    const maxSheetDate = new Date('2026-03-30');
    const diffTime = today.getTime() - maxSheetDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return rawData.map(item => {
      const itemDate = new Date(item.date);
      itemDate.setDate(itemDate.getDate() + diffDays);
      const year = itemDate.getFullYear();
      const month = String(itemDate.getMonth() + 1).padStart(2, '0');
      const day = String(itemDate.getDate()).padStart(2, '0');
      return {
        ...item,
        date: `${year}-${month}-${day}`
      };
    });
  });

  const [isBudgetExpenseModalOpen, setIsBudgetExpenseModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<BudgetExpense | null>(null);
  const [isBudgetAllocationModalOpen, setIsBudgetAllocationModalOpen] = useState(false);

  const [expenseFormData, setExpenseFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    dept: 'HR & GA',
    category: 'Operasional HR',
    amount: '',
    description: '',
    paymentMethod: 'Tunai'
  });

  const [allocationFormData, setAllocationFormData] = useState({
    dept: 'HR & GA',
    allocated: '' as string | number
  });

  const initialBudgetDates = useMemo(() => {
    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    return {
      start: formatDate(oneYearAgo),
      end: formatDate(today)
    };
  }, []);

  const [budgetFilterDept, setBudgetFilterDept] = useState('HR & GA');
  const [budgetFilterCategory, setBudgetFilterCategory] = useState('All Kategori');
  const [searchBudgetExpense, setSearchBudgetExpense] = useState('');
  const [budgetStartDate, setBudgetStartDate] = useState<string | null>(initialBudgetDates.start);
  const [budgetEndDate, setBudgetEndDate] = useState<string | null>(initialBudgetDates.end);
  const [budgetPage, setBudgetPage] = useState(1);

  // Cross-filtering states
  const [crossMonth, setCrossMonth] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const [crossPayment, setCrossPayment] = useState<string | null>(null);
  const [crossCategory, setCrossCategory] = useState<string | null>(null);
  const [crossExpenseId, setCrossExpenseId] = useState<string | null>(null);

  const selectedExpense = useMemo(() => {
    if (!crossExpenseId) return null;
    return budgetExpenses.find(e => e.id === crossExpenseId) || null;
  }, [crossExpenseId, budgetExpenses]);

  const activeCrossMonth = useMemo(() => {
    if (selectedExpense) {
      return getMonthLabel(selectedExpense.date);
    }
    return crossMonth;
  }, [selectedExpense, crossMonth]);

  const activeCrossPayment = useMemo(() => {
    if (selectedExpense) {
      return selectedExpense.paymentMethod || 'Tunai';
    }
    return crossPayment;
  }, [selectedExpense, crossPayment]);

  const activeCrossCategory = useMemo(() => {
    if (selectedExpense) {
      return selectedExpense.category;
    }
    return crossCategory;
  }, [selectedExpense, crossCategory]);

  useEffect(() => {
    localStorage.setItem('hikemore_budget_allocations', JSON.stringify(budgetAllocations));
  }, [budgetAllocations]);

  useEffect(() => {
    localStorage.setItem('hikemore_budget_expenses_v4', JSON.stringify(budgetExpenses));
  }, [budgetExpenses]);

  const activeDeptsList = useMemo(() => {
    const list = new Set([...uniqueDepts, 'Marketing', 'HR & GA', 'Finance & Accounting', 'Operational', 'IT', 'Production']);
    return Array.from(list).filter(Boolean);
  }, [uniqueDepts]);

  const departmentBudgetSummary = useMemo(() => {
    return activeDeptsList.map(dept => {
      const allocation = budgetAllocations.find(a => a.dept === dept)?.allocated || 0;
      const spent = budgetExpenses
        .filter(exp => exp.dept === dept)
        .reduce((sum, exp) => sum + exp.amount, 0);
      const remaining = allocation - spent;
      const progress = allocation ? Math.min(100, Math.round((spent / allocation) * 100)) : 0;
      return {
        dept,
        allocated: allocation,
        spent,
        remaining,
        progress
      };
    });
  }, [activeDeptsList, budgetAllocations, budgetExpenses]);

  const filteredBudgetExpensesByGlobal = useMemo(() => {
    return budgetExpenses.filter(exp => {
      const matchDept = budgetFilterDept === 'All Departemen' || exp.dept === budgetFilterDept;
      const matchCategory = budgetFilterCategory === 'All Kategori' || exp.category === budgetFilterCategory;
      
      let matchDate = true;
      if (budgetStartDate) {
        matchDate = matchDate && exp.date >= budgetStartDate;
      }
      if (budgetEndDate) {
        matchDate = matchDate && exp.date <= budgetEndDate;
      }
      
      return matchDept && matchCategory && matchDate;
    });
  }, [budgetExpenses, budgetFilterDept, budgetFilterCategory, budgetStartDate, budgetEndDate]);

  // FULLY FILTERED BUDGET EXPENSES (Table & metrics use this)
  const filteredBudgetExpenses = useMemo(() => {
    return filteredBudgetExpensesByGlobal.filter(exp => {
      // 1. Match Search Input
      const matchSearch = !searchBudgetExpense || 
                          exp.description.toLowerCase().includes(searchBudgetExpense.toLowerCase()) ||
                          exp.dept.toLowerCase().includes(searchBudgetExpense.toLowerCase());
      if (!matchSearch) return false;

      // 2. Cross filter Month
      if (crossMonth) {
        const parts = exp.date.split('-');
        if (parts.length >= 2) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const monthsMapping: Record<number, string> = {
            0: 'Jan', 1: 'Feb', 2: 'Mar', 3: 'Apr', 4: 'Mei', 5: 'Jun',
            6: 'Jul', 7: 'Agu', 8: 'Sep', 9: 'Okt', 10: 'Nov', 11: 'Des'
          };
          const label = `${monthsMapping[m]} ${y}`;
          if (label !== crossMonth) return false;
        }
      }

      // 3. Cross filter Payment Method
      if (crossPayment) {
        const method = exp.paymentMethod || 'Tunai';
        if (method !== crossPayment) return false;
      }

      // 4. Cross filter Category
      if (crossCategory) {
        if (exp.category !== crossCategory) return false;
      }

      // 5. Cross filter by clicked row ID
      if (crossExpenseId) {
        if (exp.id !== crossExpenseId) return false;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredBudgetExpensesByGlobal, searchBudgetExpense, crossMonth, crossPayment, crossCategory, crossExpenseId]);

  const totalAllocated = useMemo(() => {
    if (budgetFilterDept !== 'All Departemen') {
      const alloc = budgetAllocations.find(a => a.dept === budgetFilterDept)?.allocated || 0;
      return Number(alloc);
    }
    return departmentBudgetSummary.reduce((sum, item) => sum + item.allocated, 0);
  }, [departmentBudgetSummary, budgetFilterDept, budgetAllocations]);

  const totalSpent = useMemo(() => {
    return filteredBudgetExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [filteredBudgetExpenses]);

  const averageTransaction = useMemo(() => {
    return filteredBudgetExpenses.length > 0 
      ? Math.round(totalSpent / filteredBudgetExpenses.length) 
      : 0;
  }, [filteredBudgetExpenses, totalSpent]);

  const totalTransactionsCount = useMemo(() => {
    return filteredBudgetExpenses.length;
  }, [filteredBudgetExpenses]);

  const highestExpenseAmount = useMemo(() => {
    if (filteredBudgetExpenses.length === 0) return 0;
    return Math.max(...filteredBudgetExpenses.map(exp => exp.amount));
  }, [filteredBudgetExpenses]);

  const totalRemaining = totalAllocated - totalSpent;
  const spendRate = totalAllocated ? Math.round((totalSpent / totalAllocated) * 100) : 0;

  const categoryBudgetDistribution = useMemo(() => {
    const categories = [
      'Rekrutmen',
      'Operasional HR',
      'Pelatihan & Pengembangan',
      'Biaya Lain-Lain'
    ];
    return categories.map(cat => {
      const amount = budgetExpenses
        .filter(exp => exp.category === cat)
        .reduce((sum, exp) => sum + exp.amount, 0);
      return {
        name: cat,
        value: amount
      };
    }).filter(item => item.value > 0);
  }, [budgetExpenses]);

  const deptChartData = useMemo(() => {
    return departmentBudgetSummary.map(item => ({
      name: item.dept,
      'Alokasi Anggaran': item.allocated,
      'Realisasi Anggaran': item.spent
    }));
  }, [departmentBudgetSummary]);

  const BUDGET_CATEGORY_COLORS: Record<string, string> = useMemo(() => ({
    'Rekrutmen': '#8B5CF6',
    'Operasional HR': '#10B981',
    'Pelatihan & Pengembangan': '#F59E0B',
    'Biaya Lain-Lain': '#F43F5E'
  }), []);

  // 1. Payment Method Distribution (filtered by activeCrossMonth & activeCrossCategory, but not activeCrossPayment)
  const paymentMethodDistribution = useMemo(() => {
    const methods = ['Qris', 'Transfer bank', 'Tunai'];
    
    const list = filteredBudgetExpensesByGlobal.filter(exp => {
      if (activeCrossMonth) {
        const parts = exp.date.split('-');
        if (parts.length >= 2) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const monthsMapping: Record<number, string> = {
            0: 'Jan', 1: 'Feb', 2: 'Mar', 3: 'Apr', 4: 'Mei', 5: 'Jun',
            6: 'Jul', 7: 'Agu', 8: 'Sep', 9: 'Okt', 10: 'Nov', 11: 'Des'
          };
          const label = `${monthsMapping[m]} ${y}`;
          if (label !== activeCrossMonth) return false;
        }
      }
      if (activeCrossCategory && exp.category !== activeCrossCategory) return false;
      return true;
    });

    const total = list.reduce((sum, exp) => sum + exp.amount, 0);
    
    return methods.map(method => {
      const amount = list
        .filter(exp => (exp.paymentMethod || 'Tunai') === method)
        .reduce((sum, exp) => sum + exp.amount, 0);
      const percentage = total ? ((amount / total) * 100).toFixed(1) : '0.0';
      return {
        name: method,
        value: amount,
        percentage: parseFloat(percentage)
      };
    });
  }, [filteredBudgetExpensesByGlobal, activeCrossMonth, activeCrossCategory]);

  // 2. Category Progress Data (filtered by activeCrossMonth & activeCrossPayment, but not activeCrossCategory)
  const categoryProgressData = useMemo(() => {
    const categories = [
      { name: 'Rekrutmen', icon: 'search' as const, color: '#8B5CF6', bgColor: 'bg-violet-50 text-violet-600 border-violet-100', selectClass: 'bg-violet-50/40 border-violet-100 shadow-sm' },
      { name: 'Operasional HR', icon: 'briefcase' as const, color: '#10B981', bgColor: 'bg-emerald-50 text-emerald-600 border-emerald-100', selectClass: 'bg-emerald-50/40 border-emerald-100 shadow-sm' },
      { name: 'Pelatihan & Pengembangan', icon: 'graduation-cap' as const, color: '#F59E0B', bgColor: 'bg-amber-50 text-amber-600 border-amber-100', selectClass: 'bg-amber-50/40 border-amber-100 shadow-sm' },
      { name: 'Biaya Lain-Lain', icon: 'message-square' as const, color: '#F43F5E', bgColor: 'bg-rose-50 text-rose-600 border-rose-100', selectClass: 'bg-rose-50/40 border-rose-100 shadow-sm' }
    ];

    const list = filteredBudgetExpensesByGlobal.filter(exp => {
      if (activeCrossMonth) {
        const parts = exp.date.split('-');
        if (parts.length >= 2) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const monthsMapping: Record<number, string> = {
            0: 'Jan', 1: 'Feb', 2: 'Mar', 3: 'Apr', 4: 'Mei', 5: 'Jun',
            6: 'Jul', 7: 'Agu', 8: 'Sep', 9: 'Okt', 10: 'Nov', 11: 'Des'
          };
          const label = `${monthsMapping[m]} ${y}`;
          if (label !== activeCrossMonth) return false;
        }
      }
      if (activeCrossPayment && (exp.paymentMethod || 'Tunai') !== activeCrossPayment) return false;
      return true;
    });

    const total = list.reduce((sum, exp) => sum + exp.amount, 0);

    return categories.map(cat => {
      const spent = list
        .filter(exp => exp.category === cat.name)
        .reduce((sum, exp) => sum + exp.amount, 0);
      const percentage = total ? Math.round((spent / total) * 100) : 0;
      return {
        ...cat,
        spent,
        percentage
      };
    });
  }, [filteredBudgetExpensesByGlobal, activeCrossMonth, activeCrossPayment]);

  // 3. Line Chart Trend (filtered by activeCrossPayment & activeCrossCategory, but not activeCrossMonth)
  const monthlyChartData = useMemo(() => {
    const months = [
      { label: 'Jun 2025', year: 2025, month: 5 },
      { label: 'Jul 2025', year: 2025, month: 6 },
      { label: 'Agu 2025', year: 2025, month: 7 },
      { label: 'Sep 2025', year: 2025, month: 8 },
      { label: 'Okt 2025', year: 2025, month: 9 },
      { label: 'Nov 2025', year: 2025, month: 10 },
      { label: 'Des 2025', year: 2025, month: 11 },
      { label: 'Jan 2026', year: 2026, month: 0 },
      { label: 'Feb 2026', year: 2026, month: 1 },
      { label: 'Mar 2026', year: 2026, month: 2 },
      { label: 'Apr 2026', year: 2026, month: 3 },
      { label: 'Mei 2026', year: 2026, month: 4 },
      { label: 'Jun 2026', year: 2026, month: 5 }
    ];

    const list = filteredBudgetExpensesByGlobal.filter(exp => {
      if (crossExpenseId) {
        return exp.id === crossExpenseId;
      }
      if (activeCrossPayment && (exp.paymentMethod || 'Tunai') !== activeCrossPayment) return false;
      if (activeCrossCategory && exp.category !== activeCrossCategory) return false;
      return true;
    });

    return months.map(m => {
      const total = list
        .filter(exp => {
          const parts = exp.date.split('-');
          if (parts.length < 2) return false;
          const y = parseInt(parts[0], 10);
          const monthIdx = parseInt(parts[1], 10) - 1;
          return y === m.year && monthIdx === m.month;
        })
        .reduce((sum, exp) => sum + exp.amount, 0);

      return {
        name: m.label,
        'Pengeluaran': total
      };
    });
  }, [filteredBudgetExpensesByGlobal, activeCrossPayment, activeCrossCategory, crossExpenseId]);

  const selectedMonthValue = useMemo(() => {
    if (!activeCrossMonth) return 0;
    const found = monthlyChartData.find(d => d.name === activeCrossMonth);
    return found ? found['Pengeluaran'] : 0;
  }, [activeCrossMonth, monthlyChartData]);

  const hoveredMonthValue = useMemo(() => {
    if (!hoveredMonth) return 0;
    const found = monthlyChartData.find(d => d.name === hoveredMonth);
    return found ? found['Pengeluaran'] : 0;
  }, [hoveredMonth, monthlyChartData]);

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const contractRecords = useMemo(() => {
    return employees
      .filter(emp => emp.isActive)
      .map((emp, idx) => {
      let contractType = emp.contractType || '-';
      let contractStart = emp.contractStart || '-';
      let contractEnd = emp.contractEnd || '-';
      let remainingDays = 0;

      const today = new Date();
      today.setHours(0,0,0,0);
      
      const override = contractOverrides[emp.id];
      if (override) {
        contractType = override.contractType;
        contractStart = override.contractStart;
        contractEnd = override.contractEnd;
        const end = new Date(override.contractEnd);
        end.setHours(0,0,0,0);
        remainingDays = Math.round((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
      } else {
         if (emp.contractEnd && emp.contractEnd !== '-') {
           const end = new Date(emp.contractEnd);
           end.setHours(0,0,0,0);
           remainingDays = Math.round((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
         }
      }

      return {
        id: emp.id,
        name: emp.name,
        dept: emp.dept,
        pos: emp.pos,
        status: emp.status,
        contractType,
        contractStart,
        contractEnd,
        remainingDays,
        contractFile: emp.contractFile
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, contractOverrides]);

  const uniqueKontrakDepts = useMemo(() => Array.from(new Set(contractRecords.map(r => r.dept))), [contractRecords]);
  const uniqueKontrakTypes = useMemo(() => {
    const types = Array.from(new Set(contractRecords.filter(r => r.contractType !== '-').map(r => r.contractType)));
    return types.length ? types : ['Kontrak Lanjutan', 'Kontrak Probation', 'Kontrak Magang']; // fallback if no employees
  }, [contractRecords]);
  const uniqueKontrakStatus = useMemo(() => Array.from(new Set(contractRecords.map(r => r.status))), [contractRecords]);

  const filteredContracts = useMemo(() => {
    return contractRecords.filter(r => {
      const matchDept = kontrakFilterDept === 'All Departemen' || r.dept === kontrakFilterDept;
      const matchType = kontrakFilterType === 'All Jenis Kontrak' || r.contractType === kontrakFilterType;
      const matchStatus = kontrakFilterStatus === 'All Status' || r.status === kontrakFilterStatus;
      return matchDept && matchType && matchStatus;
    });
  }, [contractRecords, kontrakFilterDept, kontrakFilterType, kontrakFilterStatus]);

  const getExactDurationInfo = (startStr: string, endStr: string, remainingDaysPrecalc: number) => {
    if (startStr === '-' || endStr === '-') return <span className="text-slate-400">-</span>;
    const start = new Date(startStr);
    const end = new Date(endStr);
    
    // Total Duration
    let tMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    let tDays = end.getDate() - start.getDate();
    if (tDays < 0) {
      tMonths--;
      const tempDate = new Date(end.getFullYear(), end.getMonth(), 0);
      tDays += tempDate.getDate();
    }
    const monthDays = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    if (tDays >= monthDays - 1) { 
      tMonths++;
      tDays = 0;
    }
    
    let totalStr = '';
    if (tMonths > 0 && tDays > 0) totalStr = `${tMonths} Bln ${tDays} Hr`;
    else if (tMonths > 0) totalStr = `${tMonths} Bulan`;
    else totalStr = `${tDays} Hari`;

    if (remainingDaysPrecalc < 0) {
      return (
        <div className="flex flex-col justify-center">
          <span className="font-bold text-slate-700">{totalStr}</span>
          <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded w-max">Lewat {-remainingDaysPrecalc} Hari</span>
        </div>
      );
    }

    // Remaining Duration (approx using today)
    const today = new Date();
    today.setHours(0,0,0,0);
    let rMonths = (end.getFullYear() - today.getFullYear()) * 12 + (end.getMonth() - today.getMonth());
    let rDays = end.getDate() - today.getDate();
    if (rDays < 0) {
      rMonths--;
      const tempDate = new Date(end.getFullYear(), end.getMonth(), 0);
      rDays += tempDate.getDate();
    }
    
    let remStr = '';
    if (rMonths > 0 && rDays > 0) remStr = `${rMonths} Bln ${rDays} Hr`;
    else if (rMonths > 0) remStr = `${rMonths} Bulan`;
    else remStr = `${rDays} Hari`;

    let colorClass = "text-slate-500 bg-slate-50";
    if (remainingDaysPrecalc <= 3) {
      colorClass = "text-rose-600 bg-rose-50";
    } else if (remainingDaysPrecalc <= 7) {
      colorClass = "text-orange-600 bg-orange-50";
    } else if (remainingDaysPrecalc <= 30) {
      colorClass = "text-amber-600 bg-amber-50";
    }

    return (
      <div className="flex flex-col justify-center">
        <span className="font-bold text-slate-700">{totalStr}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-max ${colorClass}`}>Sisa: {remStr}</span>
      </div>
    );
  };

  const strToDateDisplay = (dStr: string) => {
    if (dStr === '-') return '-';
    const [y, m, d] = dStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const expiredContractsCount = useMemo(() => filteredContracts.filter(r => r.contractType !== '-' && r.contractEnd !== '-' && r.remainingDays < 0 && r.contractType.toLowerCase() !== 'permanent').length, [filteredContracts]);
  const probationContractsCount = useMemo(() => filteredContracts.filter(r => r.contractType === 'Kontrak Probation').length, [filteredContracts]);
  const criticalContractsCount = useMemo(() => filteredContracts.filter(r => r.contractType !== '-' && r.contractEnd !== '-' && r.remainingDays >= 0 && r.remainingDays < 30 && r.contractType.toLowerCase() !== 'permanent').length, [filteredContracts]);
  const activeContractsCount = useMemo(() => filteredContracts.filter(r => r.contractType !== '-' && ((r.contractEnd !== '-' && r.remainingDays >= 0) || r.contractType.toLowerCase() === 'permanent')).length, [filteredContracts]);

  const crossFilteredContracts = useMemo(() => {
    let result = filteredContracts;
    if (kontrakCrossFilter) {
      result = result.filter(r => {
        if (kontrakCrossFilter === 'EXPIRED') return r.contractType !== '-' && r.contractEnd !== '-' && r.remainingDays < 0 && r.contractType.toLowerCase() !== 'permanent';
        if (kontrakCrossFilter === 'PROBATION') return r.contractType === 'Kontrak Probation';
        if (kontrakCrossFilter === 'CRITICAL') return r.contractType !== '-' && r.contractEnd !== '-' && r.remainingDays >= 0 && r.remainingDays < 30 && r.contractType.toLowerCase() !== 'permanent';
        if (kontrakCrossFilter === 'ACTIVE') return r.contractType !== '-' && ((r.contractEnd !== '-' && r.remainingDays >= 0) || r.contractType.toLowerCase() === 'permanent');
        return true;
      });
    }
    if (searchKontrak.trim()) {
      const lowerSearch = searchKontrak.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(lowerSearch));
    }
    return result;
  }, [filteredContracts, kontrakCrossFilter, searchKontrak]);

  const overtimeDonutData = useMemo(() => {
    const dist: Record<string, { duration: number, names: Set<string> }> = {};
    let totalDateFilteredDuration = 0;
    filteredOvertimeRecords.forEach(r => {
      if (!dist[r.dept]) dist[r.dept] = { duration: 0, names: new Set() };
      dist[r.dept].duration += r.duration;
      dist[r.dept].names.add(r.name);
      totalDateFilteredDuration += r.duration;
    });
    const colors = ['#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'];
    return Object.entries(dist).map(([label, data], i) => ({
      label,
      count: data.duration,
      subText: `${data.names.size} Orang`,
      percentage: totalDateFilteredDuration ? (data.duration / totalDateFilteredDuration) * 100 : 0,
      color: colors[i % colors.length]
    })).sort((a,b) => b.count - a.count);
  }, [filteredOvertimeRecords]);

  // Pipeline drag effects
  useEffect(() => {
    if (!draggedPipelineJobId) {
      if (pipelineAutoScrollFrame.current) cancelAnimationFrame(pipelineAutoScrollFrame.current);
      return;
    }
    const handleDragOverGlobal = (e: DragEvent) => {
      pipelineMousePos.current = { x: e.clientX, y: e.clientY };
      if (customPipelineDragRef.current) {
        customPipelineDragRef.current.style.left = (e.clientX - dragPipelineOffset.current.x) + 'px';
        customPipelineDragRef.current.style.top = (e.clientY - dragPipelineOffset.current.y) + 'px';
      }
    };
    window.addEventListener('dragover', handleDragOverGlobal);
    const scrollStep = () => {
      if (leftScrollRef.current) {
        const container = leftScrollRef.current;
        const rect = container.getBoundingClientRect();
        const edgeThreshold = 50; 
        const speed = 8; 
        const { y } = pipelineMousePos.current;
        if (y >= 0 && y < rect.top + edgeThreshold) container.scrollTop -= speed;
        else if (y >= 0 && y > rect.bottom - edgeThreshold) container.scrollTop += speed;
      }
      pipelineAutoScrollFrame.current = requestAnimationFrame(scrollStep);
    };
    pipelineAutoScrollFrame.current = requestAnimationFrame(scrollStep);
    return () => {
      window.removeEventListener('dragover', handleDragOverGlobal);
      if (pipelineAutoScrollFrame.current) cancelAnimationFrame(pipelineAutoScrollFrame.current);
    };
  }, [draggedPipelineJobId]);

  // Sync scrolling between left and right pipeline containers
  useEffect(() => {
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;

    const handleScroll = () => {
      right.scrollTop = left.scrollTop;
    };

    left.addEventListener('scroll', handleScroll);
    return () => left.removeEventListener('scroll', handleScroll);
  }, []);

  const handlePipelineDragStart = (e: React.DragEvent, id: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragPipelineOffset.current = { 
      x: e.clientX - rect.left, 
      y: e.clientY - rect.top,
      width: rect.width 
    };
    setDragPipelinePos({ x: e.clientX - dragPipelineOffset.current.x, y: e.clientY - dragPipelineOffset.current.y });
    e.dataTransfer.effectAllowed = 'move';
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
    setTimeout(() => {
      setDraggedPipelineJobId(id);
      const idx = activeJobs.findIndex(j => j.id === id);
      setPipelineDropIndex(idx);
    }, 0);
  };

  const handlePipelineDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedPipelineJobId === null) return;
    
    const container = e.currentTarget as HTMLElement;
    // Ambil semua elemen baris yang asli (bukan placeholder atau hidden original)
    const rows = Array.from(container.querySelectorAll('.pipeline-row')).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.opacity !== '0';
    });
    
    const y = e.clientY;
    let insertIndex = activeJobs.length - 1; // Default ke akhir (untuk geser ke bawah)
    
    // Temukan index berdasarkan posisi kursor Relatif terhadap baris-baris yang ada
    let found = false;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      
      if (y < midpoint) {
        // Jika di atas titik tengah baris ini, insert di posisi i (geser ke atas)
        // Kita perlu memetakan kembali ke index asli di activeJobs
        // Karena kita memfilter baris yang sedang ditarik, i sudah mewakili posisi di array hasil filter
        insertIndex = i;
        found = true;
        break;
      }
    }
    
    if (!found) {
      insertIndex = rows.length;
    }

    setPipelineDropIndex(prev => prev === insertIndex ? prev : insertIndex);
  };

  const handlePipelineDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedPipelineJobId === null || pipelineDropIndex === null) return;
    setJobListings(prev => {
      const activeOnly = prev.filter(j => j.isActiveJob);
      const inactiveOnly = prev.filter(j => !j.isActiveJob);
      const draggedJobIdx = activeOnly.findIndex(j => j.id === draggedPipelineJobId);
      if (draggedJobIdx === -1) return prev;
      const [draggedJob] = activeOnly.splice(draggedJobIdx, 1);
      activeOnly.splice(pipelineDropIndex, 0, draggedJob);
      return [...activeOnly, ...inactiveOnly];
    });
    setDraggedPipelineJobId(null);
    setPipelineDropIndex(null);
  };

  const renderPipelineJobs = useMemo(() => {
    let result: (JobListing | { isPlaceholder: boolean; id: string } | { isHiddenOriginal: boolean; id: number })[] = [];
    let hiddenOriginalJob: JobListing | null = null;
    activeJobs.forEach(job => {
      if (job.id === draggedPipelineJobId) hiddenOriginalJob = job;
      else result.push(job);
    });
    if (draggedPipelineJobId !== null && pipelineDropIndex !== null) {
      result.splice(pipelineDropIndex, 0, { isPlaceholder: true, id: 'pipeline-placeholder' });
    }
    if (hiddenOriginalJob) {
      result.push({ ...hiddenOriginalJob, isHiddenOriginal: true });
    }
    return result;
  }, [activeJobs, draggedPipelineJobId, pipelineDropIndex]);

  const candidatesForDonut = useMemo(() => validCandidates.filter(c => {
    const matchJob = !recFilter.jobId || Number(c.jobId) === recFilter.jobId;
    const matchCandidate = !recFilter.candidateId || c.id === recFilter.candidateId;
    const matchStage = !recFilter.stageId || c.stage === recFilter.stageId;
    
    return matchJob && matchStage && matchCandidate;
  }), [validCandidates, recFilter]);

  const sourceData = useMemo(() => createDonutData('source', {
    'Glints': '#EF4444', 'Pintarnya': '#06B6D4', 'Indeed': '#3B82F6', 
    'Jobstreet': '#F59E0B', 'LinkedIn': '#6366F1', 'Internal': '#10B981', 'Lainnya': '#94A3B8'
  }, candidatesForDonut), [candidatesForDonut]);

  const crossFilteredCandidates = useMemo(() => validCandidates.filter(c => {
     const matchJob = !recFilter.jobId || Number(c.jobId) === recFilter.jobId;
     const matchSource = !recFilter.source || c.source === recFilter.source;
     const matchCandidate = !recFilter.candidateId || c.id === recFilter.candidateId;
     const matchStage = !recFilter.stageId || c.stage === recFilter.stageId;
     const matchName = c.name.toLowerCase().includes(searchRecruitmentName.toLowerCase());
     
     return matchJob && matchStage && matchSource && matchCandidate && matchName;
  }), [validCandidates, recFilter, searchRecruitmentName]);

  const recruitmentStats = useMemo(() => {
    const relevantCandidates = validCandidates;
    
    // Filter by selection if applicable
    const filteredForStats = relevantCandidates.filter(c => {
      const matchJob = !recFilter.jobId || Number(c.jobId) === recFilter.jobId;
      const matchStage = !recFilter.stageId || c.stage === recFilter.stageId;
      const matchSource = !recFilter.source || c.source === recFilter.source;
      
      return matchJob && matchStage && matchSource;
    });
    
    const hired = filteredForStats.filter(c => c.hiredDate && c.appliedDate);
    
    const avgVal = hired.length > 0 
      ? Math.round(hired.reduce((acc, c) => acc + Math.round((new Date(c.hiredDate!).getTime() - new Date(c.appliedDate).getTime()) / (24 * 3600 * 1000)), 0) / hired.length)
      : 14;

    const minVal = hired.length > 0 ? Math.min(...hired.map(c => Math.round((new Date(c.hiredDate!).getTime() - new Date(c.appliedDate).getTime()) / (24 * 3600 * 1000)))) : 12;
    const maxVal = hired.length > 0 ? Math.max(...hired.map(c => Math.round((new Date(c.hiredDate!).getTime() - new Date(c.appliedDate).getTime()) / (24 * 3600 * 1000)))) : 18;

    const joinedCount = filteredForStats.filter(c => c.stage === 'Kandidat Join' || c.tag === 'DITERIMA').length;
    const acceptRate = filteredForStats.length > 0 ? ((joinedCount / filteredForStats.length) * 100).toFixed(1) : "0";

    const totalQuota = filteredForStats.length > 0 
      ? activeJobs.filter(j => !recFilter.jobId || j.id === recFilter.jobId).reduce((acc, j) => acc + j.quota, 0)
      : activeJobs.reduce((acc, j) => acc + j.quota, 0);

    return {
      avg: avgVal,
      min: minVal,
      max: maxVal,
      totalPelamar: filteredForStats.length,
      acceptRate: acceptRate,
      totalQuota: totalQuota
    };
  }, [candidates, activeJobs, recFilter.jobId, recFilter.stageId]);

  const avgTime = recruitmentStats.avg;
  const totalPelamarAktif = recruitmentStats.totalPelamar;
  const acceptRateAktif = recruitmentStats.acceptRate;
  const totalQuotaAktif = recruitmentStats.totalQuota;

  const getJobTitle = (id: number) => jobListings.find(j => j.id === id)?.title || '-';

  const dashboardTabs = [
    { id: 'Karyawan', label: 'Analitik Karyawan', icon: 'users' },
    { id: 'Rekrutmen', label: 'Analitik Rekrutmen', icon: 'briefcase' },
    { id: 'Kehadiran', label: 'Analitik Lembur', icon: 'calendar-check' },
    { id: 'Kontrak', label: 'Analitik Kontrak', icon: 'file-text' },
    { id: 'Budget', label: 'Analitik Budget', icon: 'wallet' }
  ] as const;

  const isFilterActive = filterDept !== 'All Departemen' || filterStatus !== 'All Status' || filterEdu !== 'All Pendidikan' || filterReligion !== 'All Agama' || filterGender !== 'All Gender' || filterEmployeeId !== null;

  const renderWidget = (widget: DashboardWidget) => {
    switch(widget.type) {
      case 'summaryStats': 
        return (
          <Card className="h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <h3 className="font-extrabold text-xl text-slate-800">Ringkasan Karyawan (Exclude Subang)</h3>
              <div className="flex flex-wrap items-center gap-2.5">
                {isFilterActive && (
                  <button onClick={() => { setFilterDept('All Departemen'); setFilterStatus('All Status'); setFilterEdu('All Pendidikan'); setFilterReligion('All Agama'); setFilterGender('All Gender'); setFilterEmployeeId(null); }} className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5 mr-1">
                    <Icon name="x" size={12} /> Hapus Filter
                  </button>
                )}
                
                {/* Dept Select */}
                <div className="relative">
                  <select 
                    className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[150px]" 
                    value={filterDept} 
                    onChange={e => setFilterDept(e.target.value)}
                  >
                    <option value="All Departemen">Semua Departemen</option>
                    {uniqueDepts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                </div>

                {/* Status Select */}
                <div className="relative">
                  <select 
                    className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[140px]" 
                    value={filterStatus} 
                    onChange={e => setFilterStatus(e.target.value)}
                  >
                    <option value="All Status">Semua Status</option>
                    {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                </div>

                {/* Edu Select */}
                <div className="relative">
                  <select 
                    className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[150px]" 
                    value={filterEdu} 
                    onChange={e => setFilterEdu(e.target.value)}
                  >
                    <option value="All Pendidikan">Semua Pendidikan</option>
                    {uniqueEdus.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                </div>

                {/* Religion Select */}
                <div className="relative">
                  <select 
                    className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[130px]" 
                    value={filterReligion} 
                    onChange={e => setFilterReligion(e.target.value)}
                  >
                    <option value="All Agama">Semua Agama</option>
                    {uniqueReligions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-2">
              <div className="relative bg-blue-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-blue-100/50 group cursor-default">
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-blue-500 mb-1 uppercase tracking-widest">Total Karyawan</p>
                    <p className="text-[32px] leading-none font-black text-blue-950">{totalKaryawanAktif}</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-blue-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                    <Icon name="users" size={20} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-blue-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              <div className="relative bg-purple-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-purple-100/50 group cursor-default">
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-purple-500 mb-1 uppercase tracking-widest">
                      {totalKaryawanAktif === 1 ? 'Usia Karyawan' : 'Rata-Rata Usia'}
                    </p>
                    <p className="text-[32px] leading-none font-black text-purple-950">{rataUsia}</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-purple-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                    <Icon name="hourglass" size={20} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-purple-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              {/* Card 3 - Teal -> Emerald for consistent coloring */}
              <div 
                onClick={() => setFilterGender(prev => prev === 'Laki-Laki' ? 'All Gender' : 'Laki-Laki')} 
                className={`relative bg-emerald-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border group cursor-pointer ${filterGender === 'Laki-Laki' ? 'border-emerald-300 ring-1 ring-emerald-300' : 'border-emerald-100/50'}`}
              >
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-emerald-500 mb-1 uppercase tracking-widest">Laki-Laki</p>
                    <p className="text-[32px] leading-none font-black text-emerald-950">{totalLaki}</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-emerald-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                    <Icon name="users" size={20} />
                  </div>
                </div>
                <div className={`absolute bottom-0 right-0 w-10 h-10 bg-emerald-500 transition-transform origin-bottom-right ${filterGender === 'Laki-Laki' ? 'scale-110' : 'group-hover:scale-110'}`} style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              <div 
                onClick={() => setFilterGender(prev => prev === 'Perempuan' ? 'All Gender' : 'Perempuan')} 
                className={`relative bg-rose-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border group cursor-pointer ${filterGender === 'Perempuan' ? 'border-rose-300 ring-1 ring-rose-300' : 'border-rose-100/50'}`}
              >
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-rose-500 mb-1 uppercase tracking-widest">Perempuan</p>
                    <p className="text-[32px] leading-none font-black text-rose-950">{totalPerempuan}</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-rose-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                    <Icon name="users" size={20} />
                  </div>
                </div>
                <div className={`absolute bottom-0 right-0 w-10 h-10 bg-rose-500 transition-transform origin-bottom-right ${filterGender === 'Perempuan' ? 'scale-110' : 'group-hover:scale-110'}`} style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>
            </div>
          </Card>
        );

      case 'trenKaryawanChart':
        return <EmployeeTrendChart employees={employees} />;
        
      case 'distribusiChart': 
        const maxVal = Math.max(...departemenDist.map(b => b.total), 1);
        const ceilVal = maxVal; 
        const yAxisVals = Array.from(new Set([ceilVal, Math.floor(ceilVal * 0.75), Math.floor(ceilVal * 0.5), Math.floor(ceilVal * 0.25), 0])).sort((a,b) => b-a);
        
        // Use all statuses found in active records for the legend
        const legendStatuses = uniqueStatuses.filter(s => !!s).sort();

        return (
          <Card className="h-full flex flex-col p-6 min-h-[376px] overflow-hidden">
            <div className="flex justify-between items-start mb-6">
              <h3 className="font-bold text-lg text-slate-800">Distribusi Karyawan / Departemen</h3>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[10px] text-slate-600 mb-8 font-bold px-2">
              {legendStatuses.map(status => (
                <div key={status} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-5 h-2.5 rounded-[2px]" style={{ backgroundColor: STATUS_COLORS_MAP[status] || '#CBD5E1' }}></span> 
                  {status === 'Daily Worker' ? 'DW' : status}
                </div>
              ))}
            </div>
            <div className="flex-1 flex min-h-[280px] relative mt-2 pl-6 pb-2">
              <div className="absolute inset-0 flex flex-col justify-between pb-10 pr-4">
                {yAxisVals.map((val, i) => (
                  <div key={i} className="flex items-center gap-3 w-full">
                    <span className="text-[10px] text-slate-400 w-5 text-right font-bold">{val}</span>
                    <div className="h-px bg-slate-100 flex-1"></div>
                  </div>
                ))}
              </div>
              <div className="relative z-10 flex flex-1 items-end justify-between px-2 gap-4 h-full pb-10">
                {departemenDist.map((b, i) => {
                  const isFaded = filterDept !== 'All Departemen' && filterDept !== b.label;
                  const isHovered = barTooltip.show && barTooltip.data?.label === b.label;
                  
                  // Get only statuses with data for this department
                  const activeBarStatuses = Object.keys(b.counts)
                    .filter(status => b.counts[status] > 0)
                    .sort((a, b) => {
                      if (a === 'Karyawan') return 1;
                      if (b === 'Karyawan') return -1;
                      return a.localeCompare(b);
                    });

                  return (
                    <div 
                      key={i} 
                      className="relative w-full flex flex-col justify-end h-full group"
                    >
                      <div 
                        className="relative w-full flex flex-col justify-end cursor-pointer transition-all duration-300 transform origin-bottom hover:scale-x-[1.1] hover:z-10" 
                        style={{ opacity: isFaded ? 0.3 : 1, height: '100%' }} 
                        onMouseMove={(e) => setBarTooltip({ show: true, x: e.clientX, y: e.clientY, data: b })} 
                        onMouseLeave={() => setBarTooltip({ show: false, x: 0, y: 0, data: null })} 
                        onClick={() => setFilterDept(prev => prev === b.label ? 'All Departemen' : b.label)}
                      >
                        {isHovered && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)] z-20 pulse-animation"></div>
                        )}
                        
                        {/* Dynamic Stacked Bars with Correct Rounding */}
                        {activeBarStatuses.map((status, sIdx) => {
                          const count = b.counts[status];
                          const heightPct = (count / ceilVal) * 100;
                          const isTop = sIdx === 0;
                          const isBottom = sIdx === activeBarStatuses.length - 1;
                          
                          return (
                            <div 
                              key={status}
                              className="w-full transition-all" 
                              style={{
                                height: `${heightPct}%`, 
                                backgroundColor: STATUS_COLORS_MAP[status] || '#CBD5E1',
                                marginBottom: isBottom ? '0' : '-3px',
                                zIndex: activeBarStatuses.length - sIdx,
                                borderTopLeftRadius: isTop ? '0.6rem' : '0',
                                borderTopRightRadius: isTop ? '0.6rem' : '0',
                                borderBottomLeftRadius: isBottom ? '0.6rem' : '0',
                                borderBottomRightRadius: isBottom ? '0.6rem' : '0',
                              }}
                            />
                          );
                        })}
                      </div>

                      {/* Department labels removed to prevent overlapping */}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        );

      case 'statusPekerjaChart': 
        {
          return (
            <Card className="h-full flex flex-col p-6 min-h-[376px] overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-slate-800">Status Pekerja</h3>
                <button className="text-slate-300 hover:text-slate-500 transition-colors">
                  <Icon name="more-horizontal" size={20} />
                </button>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                <div className="relative mb-6">
                  <div className="h-16 w-full flex rounded-2xl shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] bg-slate-50 border border-slate-200/60 transition-all">
                    {statusData.map((s, idx) => {
                      if (s.count === 0) return null;
                      const isFaded = filterStatus !== 'All Status' && filterStatus !== s.label;
                      return (
                        <div 
                          key={s.label}
                          style={{ 
                            width: `${s.percentage}%`, 
                            backgroundColor: s.color,
                            opacity: isFaded ? 0.25 : 1,
                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255, 255, 255, 0.15) 10px, rgba(255, 255, 255, 0.15) 20px)'
                          }}
                          className={`h-full transition-all duration-300 cursor-pointer hover:brightness-110 hover:scale-y-[1.15] hover:z-10 hover:shadow-lg hover:rounded-md ${idx === 0 ? 'rounded-l-2xl' : ''} ${idx === statusData.length - 1 ? 'rounded-r-2xl' : ''} ${filterStatus === s.label ? 'ring-4 ring-primary/20 ring-inset brightness-110' : ''}`}
                          onClick={() => setFilterStatus(prev => prev === s.label ? 'All Status' : s.label)}
                          onMouseMove={(e) => setBarTooltip({ show: true, x: e.clientX, y: e.clientY, data: s })}
                          onMouseLeave={() => setBarTooltip({ show: false, x: 0, y: 0, data: null })}
                        />
                      );
                    })}
                  </div>
                  
                  <div className="flex w-full mt-3 justify-between px-1">
                    {statusData.map((s) => {
                      if (s.count === 0) return null;
                      const isFaded = filterStatus !== 'All Status' && filterStatus !== s.label;
                      return (
                        <span 
                          key={s.label} 
                          style={{ width: `${s.percentage}%`, opacity: isFaded ? 0.2 : 1 }} 
                          className="text-[11px] font-black text-slate-400 text-center whitespace-nowrap overflow-visible transition-opacity duration-300"
                        >
                          {Math.round(s.percentage)}%
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3.5 mt-2 transition-all">
                  {statusData.map((s) => {
                    if (s.count === 0) return null;
                    const isFaded = filterStatus !== 'All Status' && filterStatus !== s.label;
                    return (
                      <div 
                        key={s.label} 
                        className={`flex items-center gap-2.5 cursor-pointer transition-all hover:translate-x-1 ${isFaded ? 'opacity-25 grayscale-[0.5]' : 'opacity-100'}`}
                        onClick={() => setFilterStatus(prev => prev === s.label ? 'All Status' : s.label)}
                      >
                        <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: s.color }}></div>
                        <span className="text-[11px] font-extrabold text-slate-700 truncate">{s.label === 'Daily Worker' ? 'DW' : s.label} ({s.count})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        }
      case 'tingkatPendidikanChart': 
        return (
          <EduGaugeChart 
            title="Tingkat Pendidikan" 
            subtitle="Distribusi kualifikasi personel"
            data={eduData} 
            selectedValue={filterEdu !== 'All Pendidikan' ? filterEdu : null} 
            onItemClick={(label) => setFilterEdu(prev => prev === label ? 'All Pendidikan' : label)} 
          />
        );
      case 'statusAgamaChart': 
        return <CustomDonutChartWidget title="Status Agama" data={religionData} selectedValue={filterReligion !== 'All Agama' ? filterReligion : null} onItemClick={(label) => setFilterReligion(prev => prev === label ? 'All Agama' : label)} />;

      case 'dataKaryawanTable': 
        return (
          <Card className="flex flex-col h-full min-h-[376px] overflow-hidden !p-0">
            {/* Header / Toolbar */}
            <div className="flex flex-wrap items-center justify-between p-5 gap-3 bg-white border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-800 text-base">Data Karyawan Aktif</h3>
              <div className="flex items-center gap-2">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                    <Icon name="search" size={14} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Cari nama karyawan..." 
                    value={employeeSearchTerm}
                    onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all w-[180px] sm:w-[220px]"
                  />
                </div>
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-x-auto hover-scrollbar relative max-h-[340px]">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200">
                    <th className="pl-6 pr-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <div className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800 transition-colors">
                        Nama Karyawan
                        <div className="flex flex-col scale-75 opacity-50">
                          <Icon name="chevron-up" size={10} className="-mb-0.5" />
                          <Icon name="chevron-down" size={10} className="-mt-0.5" />
                        </div>
                      </div>
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Umur</th>
                    <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Lama Kerja</th>
                    <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pendidikan</th>
                    <th className="pr-6 px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Departemen</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {activeEmployees.map((emp, index) => (
                    <tr 
                      key={emp.id} 
                      className={`border-b border-slate-100/80 transition-all duration-300 hover:bg-slate-50 group ${filterEmployeeId === emp.id ? 'bg-blue-50/50' : ''}`}
                      onClick={() => setFilterEmployeeId(prev => prev === emp.id ? null : emp.id)}
                    >
                      <td className="pl-6 pr-4 py-4">
                        <div className="flex items-center gap-3 cursor-pointer">
                          <span className="text-slate-400 font-bold text-[11px] min-w-[20px]">{index + 1}.</span>
                          <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-primary font-bold text-sm shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                            {emp.name.trim().charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[13px] font-bold text-slate-800 group-hover:text-primary transition-colors leading-tight">
                            {emp.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-[12px] font-bold text-slate-600">{emp.calculatedAge}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[12px] font-medium text-slate-600">{emp.calculatedDuration}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[12px] font-bold text-slate-700 leading-tight">{emp.edu}</span>
                          <span className="text-[10px] text-slate-400 font-medium max-w-[120px] truncate">{emp.major}</span>
                        </div>
                      </td>
                      <td className="pr-6 px-4 py-4">
                        <span className="inline-flex items-center px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 shadow-sm group-hover:bg-white transition-colors">
                          {emp.dept}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Optional Empty State */}
              {activeEmployees.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <Icon name="users" size={48} className="opacity-20 mb-3" />
                  <p className="text-sm font-medium">No active employees found</p>
                </div>
              )}
            </div>
          </Card>
        );
      default: return null;
    }
  };

  return (
    <div className="h-full overflow-y-auto hover-scrollbar pr-2 pb-4 flex flex-col">
      <div className="flex justify-start md:justify-center mb-6 w-full overflow-x-auto hide-scrollbar pb-2 shrink-0">
        <div className="bg-white p-1.5 rounded-full shadow-sm border border-slate-100 flex items-center gap-1 w-max">
          {dashboardTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveDashboardTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                activeDashboardTab === tab.id
                  ? 'bg-primary text-white shadow-md shadow-primary/30'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Icon name={tab.icon as any} size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeDashboardTab === 'Karyawan' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-max flex-1">
          {layout.map(w => (
            <div key={w.id} className={`${spanClasses[w.span]} transition-all duration-300 ease-in-out`}>
              {renderWidget(w)}
            </div>
          ))}
        </div>
      )}

      {activeDashboardTab === 'Rekrutmen' && (
        <div className="flex-1 flex flex-col gap-6 animate-fadeIn">
          <Card className="flex flex-col p-6 overflow-hidden min-h-[auto]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <div>
                <h3 className="font-extrabold text-[15px] text-slate-800">Ringkasan Rekrutmen Karyawan</h3>
                <p className="text-xs font-medium text-slate-400 mt-1">Klik pada data visual untuk memfilter.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {(recFilter.jobId || recFilter.stageId || recFilter.source || recFilter.candidateId) && (
                  <button 
                    onClick={() => setRecFilter({ jobId: null, stageId: null, source: null, candidateId: null })}
                    className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5 mr-1"
                  >
                    <Icon name="x" size={12} /> Hapus Filter
                  </button>
                )}
                <div className="relative">
                  <select 
                    className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[160px]" 
                    value={recFilter.jobId || "All JobListings"} 
                    onChange={e => setRecFilter({...recFilter, jobId: e.target.value === "All JobListings" ? null : Number(e.target.value)})}
                  >
                    <option value="All JobListings">Semua Lowongan</option>
                    {activeJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                </div>
                <div className="relative">
                  <select 
                    className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[150px]" 
                    value={recFilter.stageId || "All Stages"} 
                    onChange={e => setRecFilter({...recFilter, stageId: e.target.value === "All Stages" ? null : e.target.value})}
                  >
                    <option value="All Stages">Semua Tahapan</option>
                    {Array.from(new Set(validCandidates.map(c => c.stage))).map(stage => <option key={stage} value={stage}>{stage}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                </div>
                <div className="relative">
                  <select 
                    className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[150px]" 
                    value={recFilter.source || "All Sources"} 
                    onChange={e => setRecFilter({...recFilter, source: e.target.value === "All Sources" ? null : e.target.value})}
                  >
                    <option value="All Sources">Semua Sumber</option>
                    {Array.from(new Set(validCandidates.map(c => c.source))).map(source => <option key={source} value={source}>{source}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                </div>
              </div>
            </div>

            {/* Top Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* Card 1 - Blue */}
              <div className="relative bg-blue-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-blue-100/50 group cursor-default">
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-blue-500 mb-1 uppercase tracking-widest">Lowongan Aktif</p>
                    <p className="text-[32px] leading-none font-black text-blue-950">{activeJobs.length}</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-blue-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                    <Icon name="briefcase" size={20} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-blue-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              {/* Card 2 - Purple */}
              <div className="relative bg-purple-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-purple-100/50 group cursor-default">
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-purple-500 mb-1 uppercase tracking-widest">Total Pelamar</p>
                    <p className="text-[32px] leading-none font-black text-purple-950">{totalPelamarAktif}</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-purple-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                    <Icon name="users" size={20} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-purple-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              {/* Card 3 - Emerald */}
              <div className="relative bg-emerald-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-emerald-100/50 group cursor-default">
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-emerald-500 mb-1 uppercase tracking-widest">Target Pemenuhan</p>
                    <p className="text-[32px] leading-none font-black text-emerald-950">
                      {totalQuotaAktif} <span className="text-[16px] text-emerald-500 font-bold">Orang</span>
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-emerald-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                    <Icon name="target" size={20} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-emerald-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              {/* Card 4 - Rose */}
              <div className="relative bg-rose-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-rose-100/50 group cursor-default">
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-rose-500 mb-1 uppercase tracking-widest">Tk. Penerimaan</p>
                    <p className="text-[32px] leading-none font-black text-rose-950">
                      {acceptRateAktif}<span className="text-[16px] text-rose-500 font-bold">%</span>
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-rose-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                    <Icon name="check-circle" size={20} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-rose-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-3">
              <Card className="flex flex-col p-0 overflow-hidden w-full h-full">
                 <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white z-10 shrink-0">
                <div>
                  <h3 className="font-extrabold text-xl text-slate-800">Hiring Pipeline</h3>
                  <p className="text-sm font-medium text-slate-400 mt-1">Klik pada lowongan atau tahapan untuk memfilter data di bawah.</p>
                </div>
                <div className="flex items-center gap-2">
                  {(recFilter.jobId || recFilter.stageId || recFilter.source || recFilter.candidateId) && (
                    <button onClick={() => setRecFilter({ jobId: null, stageId: null, source: null, candidateId: null })} className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5 mr-1">
                      <Icon name="x" size={12} /> Hapus Filter
                    </button>
                  )}
                  <button className="p-2 text-slate-300 hover:text-slate-600 transition-colors">
                    <Icon name="more-horizontal" size={20} />
                  </button>
                </div>
              </div>
              
              <div className="flex w-full bg-white rounded-b-3xl overflow-hidden">
                <div className="w-[190px] shrink-0 border-r border-slate-100 flex flex-col bg-white z-10">
                   <div className="h-14 px-6 py-3 bg-slate-50/50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center">POSISI</div>
                   <div ref={leftScrollRef} className="max-h-[296px] overflow-y-auto hover-scrollbar w-full pt-2 pb-2 relative">
                      <div className="flex flex-col pt-2" onDragOver={handlePipelineDragOver} onDrop={handlePipelineDrop}>
                         {renderPipelineJobs.map((job: any, index) => {
                            const targetCandidate = recFilter.candidateId ? validCandidates.find(c => c.id === recFilter.candidateId) : null;
                            const effectiveJobId = targetCandidate ? targetCandidate.jobId : recFilter.jobId;

                            return job.isPlaceholder ? <div key={job.id} className="h-14 bg-slate-100/60 mx-6 my-1 rounded-xl border-2 border-dashed border-slate-200 shadow-inner"></div> :
                            job.isHiddenOriginal ? <div key={`hidden-${job.id}`} className="h-14"></div> :
                            <div 
                              key={`left-${job.id}`} 
                              draggable 
                              className={`group pipeline-row px-4 py-2.5 flex items-center h-14 gap-2 cursor-pointer border-l-4 transition-all hover:bg-slate-50/80 ${effectiveJobId === job.id ? 'bg-blue-50/40 border-primary' : 'border-transparent'} ${draggedPipelineJobId === job.id ? 'opacity-0' : 'opacity-100'}`}
                              onClick={() => setRecFilter(p => ({...p, jobId: p.jobId === job.id ? null : job.id, stageId: null}))}
                              onDragStart={(e) => handlePipelineDragStart(e, job.id)}
                            >
                               <div className="flex items-center gap-2 shrink-0">
                                 <Icon name="grip-vertical" size={12} className="text-slate-300 group-hover:text-slate-400 cursor-grab active:cursor-grabbing" />
                                 <span className="text-[10px] font-bold text-slate-400 w-3.5">{index + 1}.</span>
                               </div>
                               <div className="flex flex-col min-w-0 flex-1">
                                 <span className={`text-[12px] truncate font-extrabold tracking-tight transition-colors ${effectiveJobId === job.id ? 'text-primary' : 'text-slate-800'}`}>{job.title}</span>
                                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{job.dept}</span>
                               </div>
                            </div>
                         })}
                      </div>
                   </div>
                </div>
                <div className="flex-1 overflow-x-auto hover-scrollbar flex flex-col bg-white">
                   <div className="min-w-[1000px] flex flex-col h-full">
                      <div className="h-14 flex items-center px-8 bg-slate-50/50 border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-widest">ALUR TAHAPAN SPESIFIK (PER POSISI PEKERJAAN)</div>
                      <div ref={rightScrollRef} className="max-h-[296px] overflow-y-hidden w-full relative">
                         <div className="flex flex-col pt-2 pb-2">
                            {renderPipelineJobs.map((job: any) => {
                               if (job.isPlaceholder) return <div key={job.id} className="h-14 bg-slate-100/60 my-1 rounded-xl mr-8 shadow-inner"></div>;
                               if (job.isHiddenOriginal) return <div key={job.id} className="h-14 my-1"></div>;
                               
                               const jobStages = jobStagesMap[job.id] || kanbanStages.map((s: any) => s.id);
                               
                               const targetCandidate = recFilter.candidateId ? validCandidates.find(c => c.id === recFilter.candidateId) : null;
                               const effectiveJobId = targetCandidate ? targetCandidate.jobId : recFilter.jobId;
                               const effectiveStageId = targetCandidate ? targetCandidate.stage : recFilter.stageId;

                               return (
                                 <div key={`right-${job.id}`} className={`flex px-8 py-2.5 h-14 gap-1.5 transition-all ${effectiveJobId && effectiveJobId !== job.id ? 'opacity-30 grayscale' : 'opacity-100'} ${draggedPipelineJobId === job.id ? 'opacity-0' : 'opacity-100'}`}>
                                    {jobStages.map((stageId: string, idx: number, arr: any[]) => {
                                       const stage = kanbanStages.find(s => s.id === stageId)!;
                                       
                                       const count = validCandidates.filter(c => 
                                         Number(c.jobId) === job.id && 
                                         c.stage === stageId && 
                                         (!recFilter.candidateId || c.id === recFilter.candidateId) &&
                                         (!recFilter.source || c.source === recFilter.source)
                                       ).length;
                                       const isActive = count > 0;
                                       const isJoinStage = stageId === 'Kandidat Join';
                                       const isFirst = idx === 0;
                                       const isLast = idx === arr.length - 1;
                                       
                                       // SVG-like standard chevron/arrow design
                                       const clipPath = isFirst 
                                         ? 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)' 
                                         : isLast 
                                         ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)' 
                                         : 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)';

                                       let bgColor = isActive ? stageColors[idx % stageColors.length] : '#F1F5F9';
                                       if (isActive && isJoinStage) bgColor = '#10B981'; // Green for join

                                       const isTargeted = effectiveJobId === job.id && effectiveStageId === stageId;

                                       return (
                                         <div 
                                           key={idx} 
                                           style={{ 
                                             clipPath, 
                                             marginLeft: isFirst ? 0 : -12,
                                             zIndex: isTargeted ? 50 : arr.length - idx, 
                                             backgroundColor: bgColor,
                                              filter: isTargeted ? 'brightness(1.1) saturate(1.1)' : (effectiveStageId && !isTargeted) ? 'grayscale(0.6) opacity(0.5)' : 'none',
                                           }} 
                                           className={`h-full flex-1 flex flex-col items-center justify-center transition-all cursor-pointer ${isActive ? 'text-white shadow-sm' : 'text-slate-300'} ${isTargeted ? 'scale-[1.02] shadow-md ring-1 ring-white/20' : 'hover:brightness-105'}`}
                                           onClick={() => setRecFilter(p => (p.jobId === job.id && p.stageId === stageId) ? ({...p, jobId: null, stageId: null}) : ({...p, jobId: job.id, stageId: stageId}))}
                                         >
                                           <span className={`text-[14px] font-black leading-none ${isActive ? 'drop-shadow-sm' : ''}`}>{isActive ? count : ''}</span>
                                           <span className="text-[7px] font-black truncate max-w-full uppercase mt-0.5 tracking-tighter px-2">{stage.label}</span>
                                         </div>
                                       );
                                    })}
                                 </div>
                               );
                            })}
                         </div>
                      </div>
                   </div>
                </div>
              </div>
              
              </Card>
            </div>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1">
            <div className="xl:col-span-1 min-h-[350px]">
              <Card className="h-full flex flex-col p-0 overflow-hidden bg-white">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                  <h3 className="font-bold text-[15px] text-slate-800">Sumber Lamaran</h3>
                  {(recFilter.jobId || recFilter.stageId || recFilter.source || recFilter.candidateId) && (
                    <button onClick={() => setRecFilter({ jobId: null, stageId: null, source: null, candidateId: null })} className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5 mr-1">
                      <Icon name="x" size={12} /> Hapus Filter
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto hover-scrollbar p-6 flex flex-col gap-6 pt-10 max-h-[350px]">
                  {sourceData.length > 0 ? sourceData.map((item, index) => (
                    <div 
                       key={index} 
                       className={`group relative cursor-pointer transition-all hover:opacity-80 ${recFilter.source === item.label ? 'opacity-100' : (recFilter.source ? 'opacity-40 grayscale' : 'opacity-100')}`}
                       onClick={() => setRecFilter(p => ({...p, source: p.source === item.label ? null : item.label}))}
                    >
                      <div className="flex justify-between items-end mb-2.5">
                        <span className="text-[13px] font-semibold text-slate-600">{item.label}</span>
                        <span className="text-[13px] font-bold text-slate-500">{Math.round(item.percentage)}%</span>
                      </div>
                      <div className="h-[8px] w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                           className="h-full rounded-full transition-all duration-1000 ease-out"
                           style={{ 
                             width: `${item.percentage}%`,
                             background: 'linear-gradient(90deg, #2563EB, #60A5FA)'
                           }}
                        />
                      </div>
                      
                      {/* Tooltip */}
                      <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 z-50 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-slate-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap translate-y-1 group-hover:translate-y-0">
                        {item.count} Pelamar dari {item.label}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                      </div>
                    </div>
                  )) : (
                    <div className="flex-1 flex items-center justify-center text-sm font-semibold text-slate-400">Tidak ada data</div>
                  )}
                </div>
              </Card>
            </div>
            <Card className="xl:col-span-2 overflow-hidden flex flex-col p-0">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                 <h3 className="font-bold text-[15px] text-slate-800">Detail Pelamar</h3>
                 <div className="flex items-center gap-3">
                   {(recFilter.jobId || recFilter.stageId || recFilter.source || recFilter.candidateId || searchRecruitmentName !== '') && (
                     <button onClick={() => { setRecFilter({ jobId: null, stageId: null, source: null, candidateId: null }); setSearchRecruitmentName(''); }} className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5 mr-1">
                       <Icon name="x" size={12} /> Hapus Filter
                     </button>
                   )}
                   <div className="relative">
                     <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                     <input 
                       type="text"
                       placeholder="Cari nama pelamar..."
                       value={searchRecruitmentName}
                       onChange={(e) => setSearchRecruitmentName(e.target.value)}
                       className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-slate-400 text-slate-700 w-[150px]"
                     />
                   </div>
                   <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{crossFilteredCandidates.length} Data</span>
                 </div>
              </div>
              <div className="flex-1 overflow-auto hover-scrollbar max-h-[320px]">
                <table className="w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-50 sticky top-0 z-20">
                    <tr className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                      <th className="px-6 py-3 sticky left-0 z-30 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">Nama Pelamar</th>
                      <th className="px-6 py-3">Posisi</th>
                      <th className="px-6 py-3">Tahapan</th>
                      <th className="px-6 py-3">Sumber</th>
                      <th className="px-6 py-3">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-slate-700 divide-y divide-slate-100 font-medium">
                      {crossFilteredCandidates.map((c, index) => {
                        const activeSchedule = schedules.find(s => s.candidateId === c.id && s.attendance !== 'Hadir');
                        return (
                          <tr key={c.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setRecFilter(p => ({...p, candidateId: p.candidateId === c.id ? null : c.id}))}>
                            <td className={`px-6 py-4 sticky left-0 z-10 transition-colors ${recFilter.candidateId === c.id ? 'bg-blue-50 text-primary font-bold' : 'bg-white'}`}>
                               <div className="flex items-center gap-3">
                                 <span className="text-xs text-slate-300 font-bold w-4">{index + 1}.</span>
                                 <span className="font-extrabold text-slate-900">{c.name}</span>
                               </div>
                            </td>
                            <td className="px-6 py-4 text-slate-500 font-bold">{getJobTitle(c.jobId)}</td>
                            <td className="px-6 py-4 text-slate-600 font-bold">{c.stage}</td>
                            <td className="px-6 py-4">
                              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md border uppercase tracking-wider ${getSourceBadgeClass(c.source)}`}>
                                {c.source}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {c.stage === 'Talent Pool' ? (
                                <span className="bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider">TALENT POOL</span>
                              ) : c.stage === 'Kandidat Join' || c.tag === 'DITERIMA' ? (
                                <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider">DITERIMA</span>
                              ) : c.tag === 'DITOLAK' ? (
                                <span className="bg-rose-50 text-rose-600 border border-rose-100 text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider">DITOLAK</span>
                              ) : c.tag === 'TIDAK HADIR' || activeSchedule?.attendance === 'Tidak Hadir' ? (
                                <span className="bg-amber-50 text-amber-600 border border-amber-100 text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider">TIDAK HADIR</span>
                              ) : c.tag === 'TIDAK RESPON' ? (
                                <span className="bg-orange-50 text-orange-600 border border-orange-100 text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider">TIDAK RESPON</span>
                              ) : activeSchedule ? (
                                <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider">
                                  SCHEDULE {activeSchedule.title.split(' - ')[0]?.toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-slate-300 italic font-bold">Proses</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeDashboardTab === 'Kehadiran' && (
        <div className="flex-1 flex flex-col gap-6 animate-fadeIn">
          {/* Top Summary Section Wrapper */}
          <Card className="flex flex-col p-6 gap-6 relative z-30">
            {/* Header & Filters */}
            <div className="relative z-[100] flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
              <div className="flex flex-col">
                <h2 className="text-[18px] font-extrabold text-slate-800 tracking-tight">Ringkasan Lembur Karyawan</h2>
                <p className="text-sm font-medium text-slate-400 mt-1">Klik pada data visual untuk memfilter.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const today = new Date();
                  let defaultStartStr = '';
                  let defaultEndStr = '';
                  if (today.getDate() > 20) {
                    defaultStartStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-21`;
                    const nextM = new Date(today.getFullYear(), today.getMonth() + 1, 20);
                    defaultEndStr = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}-20`;
                  } else {
                    const prevM = new Date(today.getFullYear(), today.getMonth() - 1, 21);
                    defaultStartStr = `${prevM.getFullYear()}-${String(prevM.getMonth() + 1).padStart(2, '0')}-21`;
                    defaultEndStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-20`;
                  }
                  
                  const defaultStart = defaultStartStr;
                  const defaultEnd = defaultEndStr;
                  const hasFilters = overtimeFilterDept !== 'Semua Divisi' || overtimeFilterStatus !== 'Semua Status' || overtimeStartDate !== defaultStart || overtimeEndDate !== defaultEnd || overtimeFilterName || overtimeSearchName !== '';
                  
                  return (
                    <>
                      {hasFilters && (
                        <button 
                          onClick={() => {
                            setOvertimeFilterDept('Semua Divisi');
                            setOvertimeFilterStatus('Semua Status');
                            setOvertimeStartDate(defaultStart);
                            setOvertimeEndDate(defaultEnd);
                            setOvertimeFilterName(null);
                            setOvertimeSearchName('');
                          }} 
                          className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5 mr-1"
                        >
                          <Icon name="x" size={12} /> Hapus Filter
                        </button>
                      )}
                    </>
                  );
                })()}
                <button
                  onClick={() => handleOpenOvertimeModal()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-[11px] font-bold shadow-sm hover:bg-blue-700 transition-colors"
                >
                  <Icon name="plus" size={14} />
                  Input Data
                </button>
                <DateRangePicker 
                  startDate={overtimeStartDate} 
                  endDate={overtimeEndDate} 
                  onRangeSelect={(start, end) => {
                    setOvertimeStartDate(start);
                    setOvertimeEndDate(end);
                  }} 
                />
                <div className="relative">
                  <select 
                    className="appearance-none bg-white border border-slate-200 text-slate-600 text-[11px] font-bold rounded-lg px-4 py-2 pr-8 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer shadow-sm min-w-[120px]"
                    value={overtimeFilterDept}
                    onChange={e => setOvertimeFilterDept(e.target.value)}
                  >
                    <option value="Semua Divisi">Divisi (Lembur)</option>
                    {uniqueOvertimeDepts.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <Icon name="chevron-down" size={14} />
                  </div>
                </div>

                <div className="relative isolate hidden md:block">
                  <select 
                    className="appearance-none bg-white border border-slate-200 text-slate-600 text-[11px] font-bold rounded-lg px-4 py-2 pr-8 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer shadow-sm min-w-[120px]"
                    value={overtimeFilterStatus}
                    onChange={e => setOvertimeFilterStatus(e.target.value)}
                  >
                    <option value="Semua Status">Semua Status</option>
                    {uniqueOvertimeStatuses.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <Icon name="chevron-down" size={14} />
                  </div>
                </div>
              </div>
            </div>

            {/* Top Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* Card 1 - Blue */}
              <div className="relative bg-blue-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-blue-100/50 group cursor-default">
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-blue-500 mb-1 uppercase tracking-widest">Total Karyawan</p>
                    <p className="text-[32px] leading-none font-black text-blue-950">{totalOvertimeEmployees}</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-blue-500 shadow-sm shrink-0">
                    <Icon name="users" size={20} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-blue-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              {/* Card 2 - Purple */}
              <div className="relative bg-purple-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-purple-100/50 group cursor-default">
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-purple-500 mb-1 uppercase tracking-widest">Rata-Rata Durasi</p>
                    <p className="text-[32px] leading-none font-black text-purple-950">{avgOvertimeDuration} <span className="text-[16px] text-purple-500 font-bold">Jam</span></p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-purple-500 shadow-sm shrink-0">
                    <Icon name="hourglass" size={20} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-purple-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              {/* Card 3 - Emerald/Teal */}
              <div className="relative bg-emerald-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-emerald-100/50 group cursor-default">
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-emerald-500 mb-1 uppercase tracking-widest">Jumlah Divisi</p>
                    <p className="text-[32px] leading-none font-black text-emerald-950">{overtimeDeptsCount}</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-emerald-500 shadow-sm shrink-0">
                    <Icon name="users" size={20} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-emerald-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              {/* Card 4 - Rose */}
              <div className="relative bg-rose-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-rose-100/50 group cursor-default">
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-black text-rose-500 mb-1 uppercase tracking-widest">Total Durasi</p>
                    <p className="text-[32px] leading-none font-black text-rose-950">{totalOvertimeDuration} <span className="text-[16px] text-rose-500 font-bold">Jam</span></p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-rose-500 shadow-sm shrink-0">
                    <Icon name="clock" size={20} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-rose-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="flex flex-col p-6 overflow-hidden min-h-[320px]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-extrabold text-[15px] text-slate-800">Durasi Lembur (Jam) Per Divisi</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-2.5 bg-blue-500 rounded-[2px]"></div>
                  <span className="text-[11px] font-bold text-slate-600">Durasi</span>
                </div>
              </div>
              
              <div className="flex-1 flex min-h-[220px] relative mt-2 pl-6 pb-2">
                {overtimeDeptDist.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                    <svg className="w-12 h-12 mb-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm font-semibold">Tidak ada data</span>
                  </div>
                ) : (
                  <>
                    {/* Guides and Y-Axis */}
                    <div className="absolute inset-0 flex flex-col justify-between pb-10 pr-4">
                      {(() => {
                        const maxDur = Math.max(...overtimeDeptDist.map(d => d.total), 5);
                        const ceilDur = Math.ceil(maxDur / 5) * 5;
                        const steps = [ceilDur, Math.floor(ceilDur * 0.75), Math.floor(ceilDur * 0.5), Math.floor(ceilDur * 0.25), 0];
                        return steps.map((val, i) => (
                          <div key={i} className="flex items-center gap-3 w-full">
                            <span className="text-[10px] text-slate-400 w-5 text-right font-bold">{val}</span>
                            <div className="h-px bg-slate-100 flex-1"></div>
                          </div>
                        ));
                      })()}
                    </div>
                    
                    {/* Bars */}
                    <div className="relative z-10 flex flex-1 items-end justify-around px-2 gap-8 h-full pb-10">
                      {(() => {
                        const maxDur = Math.max(...overtimeDeptDist.map(d => d.total), 5);
                        const ceilDur = Math.ceil(maxDur / 5) * 5;
                        return overtimeDeptDist.map((b, i) => {
                          const heightPct = (b.total / ceilDur) * 100;
                          const isHovered = barTooltip.show && barTooltip.data?.label === b.label && barTooltip.data?.isOvertime;
                          const isFaded = effectiveSelectedDept && effectiveSelectedDept !== b.label;
                          
                          return (
                            <div 
                              key={i} 
                              className="relative w-12 flex flex-col justify-end h-full group"
                              onMouseMove={(e) => setBarTooltip({ 
                                show: true, 
                                x: e.clientX, 
                                y: e.clientY, 
                                data: { ...b, isOvertime: true, color: '#3B82F6' } 
                              })} 
                              onMouseLeave={() => setBarTooltip({ show: false, x: 0, y: 0, data: null })}
                            >
                              <div 
                                className={`transition-all duration-300 rounded-t-lg rounded-b-md shadow-sm relative cursor-pointer ${isFaded ? 'bg-blue-200' : 'bg-blue-500 hover:bg-blue-600'}`}
                                style={{ height: `${heightPct}%` }}
                                onClick={() => setOvertimeFilterDept(prev => prev === b.label ? 'Semua Divisi' : b.label)}
                              >
                                {isHovered && (
                                   <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-blue-600 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] z-20"></div>
                                )}
                              </div>
                              <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[11px] font-bold text-slate-500 whitespace-nowrap">{b.label}</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Card className="flex flex-col min-h-[320px] p-6">
               <CustomDonutChartWidget 
                 title="Persentase Lembur Per Divisi"
                 data={overtimeDonutData}
                 onItemClick={(label) => setOvertimeFilterDept(prev => prev === label ? 'Semua Divisi' : label)}
                 selectedValue={effectiveSelectedDept || undefined}
                 unit="Jam"
               />
            </Card>

            <Card className="flex flex-col p-0 overflow-hidden min-h-[320px] h-full">
              <div className="p-5 border-b border-slate-100 bg-white shrink-0">
                <h3 className="font-extrabold text-[15px] text-slate-800">Ringkasan Total Karyawan Lembur</h3>
              </div>
              <div className="flex-1 overflow-auto max-h-[340px] hover-scrollbar">
                <table className="w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-50 sticky top-0 z-20">
                    <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                      <th className="px-5 py-3 whitespace-nowrap">Nama Karyawan</th>
                      <th className="px-5 py-3 whitespace-normal break-words">Divisi</th>
                      <th className="px-5 py-3 text-center whitespace-nowrap">Total Durasi</th>
                    </tr>
                  </thead>
                  <tbody className="text-[13px] text-slate-700 divide-y divide-slate-100 font-medium">
                    {overtimeSummaryByEmployee.map((row, i) => {
                      const isDeptFaded = overtimeFilterDept !== 'Semua Divisi' && overtimeFilterDept !== row.dept;
                      const isNameActive = overtimeFilterName === row.name;
                      const isNameFaded = overtimeFilterName && !isNameActive;
                      
                      return (
                      <tr 
                        key={i} 
                        className={`transition-colors cursor-pointer ${isDeptFaded || isNameFaded ? 'opacity-40 hover:opacity-100 hover:bg-slate-50' : isNameActive ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                        onClick={() => setOvertimeFilterName(prev => prev === row.name ? null : row.name)}
                      >
                        <td className="px-5 py-3.5 flex items-center gap-2">
                          <span className="text-[11px] font-extrabold text-slate-400 w-3">{i+1}.</span> 
                          <span className={`font-bold ${isNameActive ? 'text-blue-600' : 'text-slate-700'}`}>{row.name}</span>
                        </td>
                        <td className="px-5 py-3.5">{row.dept}</td>
                        <td className="px-5 py-3.5 text-center font-black text-blue-600">{row.totalDuration} Jam</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card className="flex flex-col p-0 overflow-hidden flex-1">
            <div className="p-4 sm:p-6 border-b border-slate-100 bg-white shrink-0 flex flex-col justify-between sm:flex-row sm:items-center gap-4">
              <h3 className="font-extrabold text-[15px] text-slate-800">Data Rincian Lembur Karyawan</h3>
              <div className="relative">
                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Cari nama karyawan..."
                  value={overtimeSearchName}
                  onChange={(e) => setOvertimeSearchName(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-slate-400 text-slate-700 w-full sm:w-[250px]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto hover-scrollbar max-h-[385px]">
              <table className="w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-50 sticky top-0 z-20">
                    <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                      <th className="px-6 py-4 flex items-center gap-1.5">Tanggal <Icon name="info" size={12} className="text-slate-400" /> <Icon name="chevron-up" size={12} className="text-slate-400" /></th>
                      <th className="px-6 py-4">Nama Karyawan <Icon name="chevron-up" size={12} className="text-slate-400 inline-block align-middle ml-1" /></th>
                      <th className="px-6 py-4">Divisi</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Keterangan Lembur</th>
                      <th className="px-6 py-4 text-center">Jam Lembur</th>
                      <th className="px-6 py-4 text-center">Form Lembur</th>
                      <th className="px-6 py-4 text-center">Durasi</th>
                      <th className="px-6 py-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="text-[13px] text-slate-700 divide-y divide-slate-100 font-medium">
                    {filteredOvertimeRecords.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 flex items-center gap-2"><span className="text-[11px] font-extrabold text-slate-400 w-3">{i+1}.</span> <span className="font-bold text-slate-500">{new Date(row.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span></td>
                        <td className="px-6 py-4 font-bold text-slate-800">{row.name}</td>
                        <td className="px-6 py-4">{row.dept}</td>
                        <td className="px-6 py-4 text-slate-500">{row.status}</td>
                        <td className="px-6 py-4 italic text-slate-500">{row.desc}</td>
                        <td className="px-6 py-4 text-center font-semibold">{row.startTime} - {row.endTime}</td>
                        <td className="px-6 py-4 text-center">
                          {row.attachment ? (
                            typeof row.attachment === 'string' && row.attachment.startsWith('DB_STORED:') ? (
                              <button
                                onClick={async () => {
                                  try {
                                    const w = window.open('about:blank', '_blank');
                                    const docId = row.attachment.split(':')[1];
                                    const { getFileFromFirestore } = await import('../firebase');
                                    const base64Str = await getFileFromFirestore(docId);
                                    
                                    if (base64Str) {
                                      if (w) w.document.write(`<iframe src="${base64Str}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                    } else {
                                      if (w) w.close();
                                      alert('File tidak ditemukan di database.');
                                    }
                                  } catch(e) {
                                    console.error('Error opening attachment', e);
                                    alert('Oops, terjadi kesalahan saat membuka file.');
                                  }
                                }}
                                className="text-blue-500 hover:text-blue-700 transition-colors p-1 bg-blue-50 hover:bg-blue-100 rounded-lg"
                                title="Lihat Form Lembur"
                              >
                                <Icon name="file-text" size={16} />
                              </button>
                            ) : (
                              <a
                                href={
                                  row.attachment instanceof File 
                                    ? URL.createObjectURL(row.attachment) 
                                    : typeof row.attachment === 'string' 
                                      ? row.attachment 
                                      : "#"
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-700 transition-colors p-1 bg-blue-50 hover:bg-blue-100 rounded-lg inline-block"
                                title="Lihat Form Lembur"
                              >
                                <Icon name="file-text" size={16} />
                              </a>
                            )
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-3 py-1 bg-green-50 text-green-600 rounded-full font-bold text-xs">{row.duration} Jam</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenOvertimeModal(row)}
                              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Icon name="edit" size={16} />
                            </button>
                            <button
                              onClick={() => confirmDeleteOvertime(row.id)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Icon name="trash-2" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeDashboardTab === 'Kontrak' && (
        <div className="flex-1 flex flex-col gap-6 animate-fadeIn">
          {/* Top Summary Section Wrapper */}
          <Card className="flex flex-col p-6 gap-6 relative z-30">
            {/* Header & Filters */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
              <div className="flex flex-col">
                <h2 className="text-[18px] font-extrabold text-slate-800 tracking-tight">Ringkasan Kontrak Karyawan</h2>
                <p className="text-sm font-medium text-slate-400 mt-1">Kelola dan pantau durasi kontrak karyawan.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  onClick={() => {
                    setKontrakForm({ employeeId: '', contractType: 'Kontrak Lanjutan', contractStart: '', contractEnd: '' });
                    setIsEditingKontrak(false);
                    setIsKontrakModalOpen(true);
                  }} 
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2 mr-2"
                >
                  <Icon name="plus" size={16} /> Input Data
                </button>
                {(kontrakFilterDept !== 'All Departemen' || kontrakFilterType !== 'All Jenis Kontrak' || kontrakFilterStatus !== 'All Status' || kontrakCrossFilter !== null) && (
                  <button onClick={() => { setKontrakFilterDept('All Departemen'); setKontrakFilterType('All Jenis Kontrak'); setKontrakFilterStatus('All Status'); setKontrakCrossFilter(null); }} className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5 mr-1">
                    <Icon name="x" size={12} /> Hapus Filter
                  </button>
                )}
                <div className="relative">
                  <select className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[160px]" value={kontrakFilterDept} onChange={e => setKontrakFilterDept(e.target.value)}>
                    <option value="All Departemen">Semua Departemen</option>
                    {uniqueKontrakDepts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                </div>
                <div className="relative">
                  <select className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[170px]" value={kontrakFilterType} onChange={e => setKontrakFilterType(e.target.value)}>
                    <option value="All Jenis Kontrak">Semua Jenis Kontrak</option>
                    {uniqueKontrakTypes.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                </div>
                <div className="relative">
                  <select className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[150px]" value={kontrakFilterStatus} onChange={e => setKontrakFilterStatus(e.target.value)}>
                    <option value="All Status">Semua Status</option>
                    {uniqueKontrakStatus.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Card 1 - Blue (Active) */}
            <div className="relative bg-blue-50 rounded-[20px] p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-blue-100/50 group cursor-default">
              <div className="relative z-10 flex justify-between items-center w-full">
                <div className="flex flex-col justify-center">
                  <p className="text-[10px] font-extrabold text-blue-500 mb-2 uppercase tracking-[0.1em]">Total Kontrak Aktif</p>
                  <p className="text-[36px] leading-[0.9] font-black text-blue-950">{activeContractsCount}</p>
                </div>
                <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-blue-500 shadow-sm border border-blue-50 shrink-0">
                  <Icon name="users" size={20} strokeWidth={2.5} />
                </div>
              </div>
              <div className="absolute bottom-0 right-0 w-12 h-12 bg-blue-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
            </div>

            {/* Card 2 - Purple (Habis) */}
            <div 
              className={`relative rounded-[20px] p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border group cursor-pointer ${kontrakCrossFilter === 'EXPIRED' ? 'bg-purple-100 border-purple-300 ring-2 ring-purple-100' : 'bg-purple-50 border-purple-100/50'}`}
              onClick={() => setKontrakCrossFilter(kontrakCrossFilter === 'EXPIRED' ? null : 'EXPIRED')}
            >
              <div className="relative z-10 flex justify-between items-center w-full">
                <div className="flex flex-col justify-center">
                  <p className="text-[10px] font-extrabold text-purple-500 mb-2 uppercase tracking-[0.1em]">Kontrak Habis</p>
                  <p className="text-[36px] leading-[0.9] font-black text-purple-950">{expiredContractsCount}</p>
                </div>
                <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-purple-500 shadow-sm border border-purple-50 shrink-0">
                  <Icon name="user-x" size={20} strokeWidth={2.5} />
                </div>
              </div>
              <div className="absolute bottom-0 right-0 w-12 h-12 bg-purple-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
            </div>

            {/* Card 3 - Emerald (Probation) */}
            <div 
              className={`relative rounded-[20px] p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border group cursor-pointer ${kontrakCrossFilter === 'PROBATION' ? 'bg-emerald-100 border-emerald-300 ring-2 ring-emerald-100' : 'bg-emerald-50 border-emerald-100/50'}`}
              onClick={() => setKontrakCrossFilter(kontrakCrossFilter === 'PROBATION' ? null : 'PROBATION')}
            >
              <div className="relative z-10 flex justify-between items-center w-full">
                <div className="flex flex-col justify-center">
                  <p className="text-[10px] font-extrabold text-emerald-500 mb-2 uppercase tracking-[0.1em]">Total Probation</p>
                  <p className="text-[36px] leading-[0.9] font-black text-emerald-950">{probationContractsCount}</p>
                </div>
                <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-emerald-500 shadow-sm border border-emerald-50 shrink-0">
                  <Icon name="user-check" size={20} strokeWidth={2.5} />
                </div>
              </div>
              <div className="absolute bottom-0 right-0 w-12 h-12 bg-emerald-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
            </div>

            {/* Card 4 - Rose (Critical) */}
            <div 
              className={`relative rounded-[20px] p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border group cursor-pointer ${kontrakCrossFilter === 'CRITICAL' ? 'bg-rose-100 border-rose-300 ring-2 ring-rose-100' : 'bg-rose-50 border-rose-100/50'}`}
              onClick={() => setKontrakCrossFilter(kontrakCrossFilter === 'CRITICAL' ? null : 'CRITICAL')}
            >
              <div className="relative z-10 flex justify-between items-center w-full">
                <div className="flex flex-col justify-center">
                  <p className="text-[10px] font-extrabold text-rose-500 mb-2 uppercase tracking-[0.1em]">Kritis (&lt;30 Hari)</p>
                  <p className="text-[36px] leading-[0.9] font-black text-rose-950">{criticalContractsCount}</p>
                </div>
                <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-rose-500 shadow-sm border border-rose-50 shrink-0">
                  <Icon name="clock" size={20} strokeWidth={2.5} />
                </div>
              </div>
              <div className="absolute bottom-0 right-0 w-12 h-12 bg-rose-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
            </div>
          </div>
          </Card>

          <Card className="flex flex-col">
            <div className="p-5 border-b border-slate-100 shrink-0 flex items-center justify-between gap-4">
              <h3 className="font-extrabold text-[15px] text-slate-800 tracking-tight">Detail Data Kontrak</h3>
              <div className="relative">
                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Cari nama karyawan..."
                  value={searchKontrak}
                  onChange={(e) => setSearchKontrak(e.target.value)}
                  className="w-full sm:w-64 pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-slate-400 text-slate-700"
                />
              </div>
            </div>
            
            {/* Hidden File Input for Contract Attachments */}
            <input 
              type="file"
              ref={contractFileInputRef}
              onChange={handleContractFileChange}
              className="hidden"
              accept=".pdf,.doc,.docx,image/*"
            />

            <div className="overflow-auto hover-scrollbar relative max-h-[530px]">
              <table className="w-full text-left whitespace-normal text-xs table-fixed">
                <thead className="bg-slate-50 sticky top-0 z-20">
                  <tr className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="px-2 py-2.5 text-center w-8">No.</th>
                    <th className="px-2.5 py-2.5 text-left w-36">Nama Karyawan</th>
                    <th className="px-2.5 py-2.5 text-left w-28">Departemen</th>
                    <th className="px-2 py-2.5 text-center w-[90px]">Status</th>
                    <th className="px-2.5 py-2.5 text-left w-28">Jenis Kontrak</th>
                    <th className="px-2 py-2.5 text-center w-[85px]">Kontrak Awal</th>
                    <th className="px-2 py-2.5 text-center w-[85px]">Kontrak Akhir</th>
                    <th className="px-2.5 py-2.5 text-left w-36">Total Durasi & Sisa</th>
                    <th className="px-2 py-2.5 text-center w-12">Edit</th>
                    <th className="px-2 py-2.5 text-center w-28">File Kontrak</th>
                  </tr>
                </thead>
                <tbody className="text-[11.5px] text-slate-700 divide-y divide-slate-100 font-medium">
                  {crossFilteredContracts.map((row, i) => (
                    <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-2 py-2.5 text-center text-slate-400 font-bold">{i + 1}.</td>
                      <td className="px-2.5 py-2.5 font-bold text-slate-800 break-words">{row.name}</td>
                      <td className="px-2.5 py-2.5 text-slate-500 break-words">{row.dept}</td>
                      <td className="px-2 py-2.5 text-center">
                        <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                          row.status === 'Karyawan' || row.status === 'Permanent' ? 'bg-blue-50 text-blue-600 border border-blue-200/50' :
                          row.status === 'Kontrak' ? 'bg-purple-50 text-purple-600 border border-purple-200/50' :
                          row.status === 'Outsource' ? 'bg-teal-50 text-teal-600 border border-teal-200/50' :
                          row.status === 'Magang' ? 'bg-pink-50 text-pink-600 border border-pink-200/50' :
                          row.status === 'Daily Worker' || row.status === 'DW' ? 'bg-amber-50 text-amber-600 border border-amber-200/50' :
                          row.status === 'Freelance' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50' :
                          'bg-slate-50 text-slate-600 border border-slate-200/50'
                        }`}>
                          {row.status === 'Daily Worker' ? 'DW' : row.status}
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5 text-slate-500 break-words">{row.contractType}</td>
                      <td className="px-2 py-2.5 text-center text-slate-600 font-semibold">{strToDateDisplay(row.contractStart)}</td>
                      <td className="px-2 py-2.5 text-center text-slate-600 font-semibold">{strToDateDisplay(row.contractEnd)}</td>
                      <td className="px-2.5 py-2 leading-tight">
                        {row.contractType === '-' ? '-' : getExactDurationInfo(row.contractStart, row.contractEnd, row.remainingDays)}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => {
                            setKontrakForm({
                              employeeId: row.id,
                              contractType: row.contractType === '-' ? 'Kontrak Lanjutan' : row.contractType,
                              contractStart: row.contractStart === '-' ? '' : row.contractStart,
                              contractEnd: row.contractEnd === '-' ? '' : row.contractEnd
                            });
                            setIsEditingKontrak(true);
                            setIsKontrakModalOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-lg transition-all inline-flex items-center justify-center border border-transparent hover:border-indigo-100/30 active:scale-95 cursor-pointer"
                          title="Edit Tanggal Kontrak"
                        >
                          <Icon name="edit" size={13} />
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          {uploadingContracts[row.id] ? (
                            <div className="flex items-center gap-1 text-[10px] text-indigo-500 font-bold animate-pulse">
                              <span className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></span>
                              <span>Unggah...</span>
                            </div>
                          ) : row.contractFile ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span 
                                className="text-[9px] font-semibold text-slate-400 truncate max-w-[100px]" 
                                title={row.contractFile.name}
                              >
                                {row.contractFile.name}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      const w = window.open('about:blank', '_blank');
                                      const docId = row.contractFile.url.split(':')[1];
                                      const base64Str = await getFileFromFirestore(docId);
                                      if (base64Str) {
                                        if (w) w.document.write(`<iframe src="${base64Str}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                      } else {
                                        if (w) w.close();
                                        alert('File tidak ditemukan di database.');
                                      }
                                    } catch (err) {
                                      console.error('Error opening file', err);
                                      alert('Gagal membuka file.');
                                    }
                                  }}
                                  className="p-1 text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
                                  title="Buka Dokumen"
                                >
                                  <Icon name="eye" size={12} />
                                </button>
                                
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      const docId = row.contractFile.url.split(':')[1];
                                      const docSnap = await getDoc(doc(db, 'fileContents', docId));
                                      const data = docSnap.data();
                                      if (docSnap.exists() && data?.base64) {
                                        const { downloadFile } = await import('../utils');
                                        await downloadFile(data.base64, row.contractFile.name);
                                      } else {
                                        alert('File tidak ditemukan.');
                                      }
                                    } catch (err) {
                                      console.error('Error downloading file', err);
                                      alert('Gagal mengunduh file.');
                                    }
                                  }}
                                  className="p-1 text-emerald-500 hover:bg-emerald-50 rounded-md transition-colors"
                                  title="Unduh Dokumen"
                                >
                                  <Icon name="download" size={12} />
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteContractFile(row.id);
                                  }}
                                  className="p-1 text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                                  title="Hapus Dokumen"
                                >
                                  <Icon name="trash-2" size={12} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEmpIdForUpload(row.id);
                                contractFileInputRef.current?.click();
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100/50 rounded-md font-bold text-[10px] transition-all cursor-pointer active:scale-95"
                              title="Pilih file untuk dilampirkan"
                            >
                              <Icon name="paperclip" size={10} strokeWidth={2.5} />
                              <span>Attach</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {crossFilteredContracts.length === 0 && (
                     <tr>
                        <td colSpan={10} className="px-5 py-10 text-center text-slate-400 text-xs font-medium">Tidak ada data kontrak yang cocok dengan filter</td>
                     </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeDashboardTab === 'Budget' && (
        <div className="flex-1 flex flex-col gap-6 animate-fadeIn">
          {/* Top Summary Header Section Wrapper */}
          <Card className="flex flex-col p-6 gap-6 relative z-30">
            {/* Header & Filters */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
              <div className="flex flex-col animate-slideDown">
                <h2 className="text-[18px] font-extrabold text-slate-800 tracking-tight">Analitik & Realisasi Pengeluaran HR</h2>
                <p className="text-sm font-medium text-slate-400 mt-1">Pantau serta lakukan pencatatan realisasi pengeluaran operasional divisi HR.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  onClick={() => setIsBudgetExpenseModalOpen(true)} 
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-full text-xs font-bold hover:bg-blue-700 transition shadow-md hover:shadow-lg active:scale-95 flex items-center gap-1.5 mr-2"
                >
                  <Icon name="plus" size={14} /> Catat Pengeluaran
                </button>

                {(() => {
                  const isDateFiltered = budgetStartDate !== initialBudgetDates.start || budgetEndDate !== initialBudgetDates.end;
                  if (budgetFilterCategory !== 'All Kategori' || isDateFiltered) {
                    return (
                      <button 
                        onClick={() => { 
                          setBudgetFilterDept('HR & GA'); 
                          setBudgetFilterCategory('All Kategori'); 
                          setBudgetStartDate(initialBudgetDates.start);
                          setBudgetEndDate(initialBudgetDates.end);
                          setBudgetPage(1); 
                        }} 
                        className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5 mr-1 animate-fadeIn"
                      >
                        <Icon name="x" size={12} /> Hapus Filter
                      </button>
                    );
                  }
                  return null;
                })()}

                <div className="relative">
                  <select 
                    className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[160px]" 
                    value={budgetFilterCategory} 
                    onChange={e => { setBudgetFilterCategory(e.target.value); setBudgetPage(1); }}
                  >
                    <option value="All Kategori">Semua Kategori</option>
                    <option value="Rekrutmen">Rekrutmen</option>
                    <option value="Operasional HR">Operasional HR</option>
                    <option value="Pelatihan & Pengembangan">Pelatihan & Pengembangan</option>
                    <option value="Biaya Lain-Lain">Biaya Lain-Lain</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                </div>

                <DateRangePicker 
                  startDate={budgetStartDate} 
                  endDate={budgetEndDate} 
                  onRangeSelect={(start, end) => {
                    setBudgetStartDate(start);
                    setBudgetEndDate(end);
                    setBudgetPage(1);
                  }} 
                />
              </div>
            </div>

            {/* Summary Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* Card 1 - Blue (Total Pengeluaran HR) */}
              <div className="relative bg-blue-50 rounded-[20px] p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-blue-100/50 group cursor-default animate-slideDown" style={{ animationDelay: '50ms' }}>
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-extrabold text-blue-500 mb-2 uppercase tracking-[0.1em]">TOTAL PENGELUARAN HR</p>
                    <p className="text-[22px] lg:text-[24px] font-black text-blue-950 tracking-tight leading-[0.9]">{formatRupiah(totalSpent)}</p>
                  </div>
                  <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-blue-500 shadow-sm border border-blue-50 shrink-0">
                    <Icon name="wallet" size={20} strokeWidth={2.5} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-12 h-12 bg-blue-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              {/* Card 2 - Purple (Total Transaksi) */}
              <div className="relative bg-purple-50 rounded-[20px] p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-purple-100/50 group cursor-default animate-slideDown" style={{ animationDelay: '100ms' }}>
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-extrabold text-purple-500 mb-2 uppercase tracking-[0.1em]">TOTAL TRANSAKSI</p>
                    <p className="text-[22px] lg:text-[24px] font-black text-purple-950 tracking-tight leading-[0.9]">{totalTransactionsCount} Transaksi</p>
                  </div>
                  <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-purple-500 shadow-sm border border-purple-50 shrink-0">
                    <Icon name="file-text" size={20} strokeWidth={2.5} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-12 h-12 bg-purple-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              {/* Card 3 - Emerald (Pengeluaran Tertinggi) */}
              <div className="relative bg-emerald-50 rounded-[20px] p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-emerald-100/50 group cursor-default animate-slideDown" style={{ animationDelay: '150ms' }}>
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-extrabold text-emerald-500 mb-2 uppercase tracking-[0.1em]">PENGELUARAN TERTINGGI</p>
                    <p className="text-[22px] lg:text-[24px] font-black text-emerald-950 tracking-tight leading-[0.9]">{formatRupiah(highestExpenseAmount)}</p>
                  </div>
                  <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-emerald-500 shadow-sm border border-emerald-50 shrink-0">
                    <Icon name="trending-up" size={20} strokeWidth={2.5} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-12 h-12 bg-emerald-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>

              {/* Card 4 - Rose (Rata-rata Transaksi) */}
              <div className="relative bg-rose-50 rounded-[20px] p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-rose-100/50 group cursor-default animate-slideDown" style={{ animationDelay: '200ms' }}>
                <div className="relative z-10 flex justify-between items-center w-full">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-extrabold text-rose-500 mb-2 uppercase tracking-[0.1em]">RATA-RATA TRANSAKSI</p>
                    <p className="text-[22px] lg:text-[24px] font-black text-rose-950 tracking-tight leading-[0.9]">{formatRupiah(averageTransaction)}</p>
                  </div>
                  <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-rose-500 shadow-sm border border-rose-50 shrink-0">
                    <Icon name="activity" size={20} strokeWidth={2.5} />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-12 h-12 bg-rose-500" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
              </div>
            </div>
          </Card>

          {/* Main Layout Area */}
          <div className="flex flex-col gap-6 z-20 relative">
            
            {/* Card 1: Total Pengeluaran Tahun Berjalan */}
            <Card className="p-6 flex flex-col">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                  <div>
                    <h3 className="font-extrabold text-[15px] text-slate-800 tracking-tight">Total Pengeluaran Tahun Berjalan</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="px-4 py-2 bg-blue-50/80 border border-blue-100 rounded-2xl flex items-center gap-2">
                        <Icon name="wallet" size={20} className="text-blue-600" />
                        <span className="text-[22px] font-black text-blue-600 tracking-tight font-sans">{formatRupiah(totalSpent)}</span>
                      </div>
                    </div>
                  </div>
                  {activeCrossMonth && (
                    <button 
                      onClick={() => {
                        setCrossMonth(null);
                        setCrossExpenseId(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100/80 border border-rose-100 rounded-xl transition-all shadow-sm shrink-0 self-end sm:self-center"
                    >
                      <Icon name="rotate-ccw" size={12} />
                      Reset Filter
                    </button>
                  )}
                </div>

                 {/* Area Chart expenditure trend */}
                <div className="h-[280px] w-full mt-2 cursor-pointer select-none">
                  <ReResponsiveContainer width="100%" height="100%">
                    <ReAreaChart 
                      data={monthlyChartData} 
                      margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
                      onMouseMove={(state) => {
                        if (state && state.activeLabel) {
                          setHoveredMonth(String(state.activeLabel));
                        } else {
                          setHoveredMonth(null);
                        }
                      }}
                      onMouseLeave={() => {
                        setHoveredMonth(null);
                      }}
                      onClick={(state) => {
                        if (state && state.activeLabel) {
                          const labelStr = String(state.activeLabel);
                          setCrossMonth(prev => prev === labelStr ? null : labelStr);
                          setCrossExpenseId(null); // clear row filter if clicking month
                        }
                      }}
                    >
                      <defs>
                        <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <ReCartesianGrid strokeDasharray="4 4" stroke="#F1F5F9" vertical={false} />
                      <ReXAxis 
                        dataKey="name" 
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} 
                      />
                      <ReYAxis 
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} 
                        tickFormatter={(val) => val === 0 ? '0' : `Rp ${(val / 1000000).toFixed(0)} jt`} 
                      />
                      <ReTooltip 
                        cursor={false}
                        formatter={(val: number) => [formatRupiah(val), 'Total Pengeluaran']}
                        contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 'bold' }} 
                      />
                      {hoveredMonth && hoveredMonth !== activeCrossMonth && (
                        <ReReferenceLine 
                          segment={[
                            { x: hoveredMonth, y: 0 },
                            { x: hoveredMonth, y: hoveredMonthValue }
                          ]}
                          stroke="#94A3B8" 
                          strokeWidth={1.5}
                        />
                      )}
                      {activeCrossMonth && (
                        <ReReferenceLine 
                          segment={[
                            { x: activeCrossMonth, y: 0 },
                            { x: activeCrossMonth, y: selectedMonthValue }
                          ]}
                          stroke="#2563EB" 
                          strokeWidth={2}
                          strokeDasharray="4 4" 
                        />
                      )}
                      <ReArea 
                        type="monotone" 
                        dataKey="Pengeluaran" 
                        stroke="#2563EB" 
                        strokeWidth={3} 
                        fillOpacity={1} 
                        fill="url(#colorUv)" 
                        activeDot={false}
                        dot={(props: any) => {
                          const { cx, cy, payload } = props;
                          if (payload && payload.name === activeCrossMonth) {
                            return (
                              <circle 
                                key={`dot-selected-${payload.name}`} 
                                cx={cx} 
                                cy={cy} 
                                r={6} 
                                fill="#2563EB" 
                                stroke="#ffffff" 
                                strokeWidth={2.5} 
                              />
                            );
                          }
                          return <g key={`dot-hidden-${props.index}`} />;
                        }}
                      />
                    </ReAreaChart>
                  </ReResponsiveContainer>
                </div>
              </Card>

              {/* Bottom Grid: Transaction Table (Left, 8 cols) & Payment/Category Charts (Right, 4 cols) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left Column (Data Transaksi Pengeluaran HR) */}
                <div className="lg:col-span-8">
                  {/* Card 2: Data Transaksi Pengeluaran HR */}
                  <Card className="p-6 flex flex-col h-full">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="font-extrabold text-[15px] text-slate-800 tracking-tight">Data Transaksi Pengeluaran HR</h3>
                    {(crossMonth || crossPayment || crossCategory || crossExpenseId) && (
                      <button 
                        onClick={() => {
                          setCrossMonth(null);
                          setCrossPayment(null);
                          setCrossCategory(null);
                          setCrossExpenseId(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-extrabold text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100/80 border border-rose-100 rounded-lg transition-all shadow-sm"
                        title="Reset semua filter silang"
                      >
                        <Icon name="rotate-ccw" size={10} />
                        Reset Filter
                      </button>
                    )}
                  </div>

                  {/* Table Controls */}
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-initial">
                      <input 
                        type="text" 
                        placeholder="Cari keterangan..." 
                        value={searchBudgetExpense} 
                        onChange={e => { setSearchBudgetExpense(e.target.value); setBudgetPage(1); }} 
                        className="w-full md:w-[220px] placeholder:text-slate-400 pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 outline-none rounded-xl text-xs font-bold focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all text-slate-800"
                      />
                      <Icon name="search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Main Transaction List Table */}
                <div className="overflow-x-auto max-h-[660px] overflow-y-auto pr-1 select-none scrollbar-thin scrollbar-thumb-slate-200">
                  <table className="w-full text-left font-sans text-xs border-collapse">
                    <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_rgba(241,245,249,1)]">
                      <tr className="text-[10px] font-black text-slate-400 tracking-wider uppercase bg-white">
                        <th className="pb-3 text-center w-[35px] pt-1">No.</th>
                        <th className="pb-3 pl-2 w-[85px] pt-1 whitespace-nowrap">Tanggal</th>
                        <th className="pb-3 pl-2 pr-3 pt-1 whitespace-nowrap">Penggunaan Budget</th>
                        <th className="pb-3 pl-2 w-[110px] pt-1 whitespace-nowrap">Jenis pembayaran</th>
                        <th className="pb-3 pl-2 w-[120px] pt-1 whitespace-nowrap">Kategori pengeluaran</th>
                        <th className="pb-3 text-right pr-4 w-[95px] pt-1 whitespace-nowrap">Jumlah</th>
                        <th className="pb-3 text-center w-[40px] pt-1">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBudgetExpenses.map((exp, index) => {
                        const rowNum = index + 1;
                        
                        // Convert dates like 2025-07-03 to 3 Jul 2025
                        const formatDateDisplay = (dateStr: string) => {
                           const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                           const parts = dateStr.split('-');
                           if (parts.length !== 3) return dateStr;
                           const year = parts[0];
                           const month = months[parseInt(parts[1], 10) - 1] || parts[1];
                           const day = parseInt(parts[2], 10);
                           return `${day} ${month} ${year}`;
                        };

                        const isSelected = crossExpenseId === exp.id;

                        return (
                          <tr 
                            key={exp.id} 
                            onClick={() => {
                              if (isSelected) {
                                setCrossExpenseId(null);
                              } else {
                                setCrossExpenseId(exp.id);
                              }
                            }}
                            className={`border-b border-slate-100/50 cursor-pointer select-none transition-all duration-150 text-xs text-slate-700 font-semibold ${
                              isSelected 
                                ? 'bg-blue-50/90 hover:bg-blue-100/60 border-l-4 border-l-blue-500 pl-1' 
                                : 'hover:bg-slate-50/50 active:bg-slate-100/50'
                            }`}
                          >
                            <td className="py-2.5 text-center font-bold text-slate-400 w-[35px]">{rowNum}.</td>
                            <td className="py-2.5 pl-2 whitespace-nowrap font-medium text-slate-500 w-[85px]">{formatDateDisplay(exp.date)}</td>
                            <td className="py-2.5 pl-2 pr-3 max-w-[120px] sm:max-w-[160px] md:max-w-[180px] lg:max-w-[150px] xl:max-w-[200px] truncate font-semibold text-slate-800" title={exp.description}>
                              {exp.description}
                            </td>
                            <td className="py-2.5 pl-2 w-[110px]">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold whitespace-nowrap inline-block ${
                                exp.paymentMethod === 'Qris' 
                                  ? 'bg-violet-50 text-violet-700 border border-violet-100' 
                                  : exp.paymentMethod === 'Transfer bank' 
                                    ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              }`}>
                                {exp.paymentMethod || 'Tunai'}
                              </span>
                            </td>
                            <td className="py-2.5 pl-2 w-[120px]">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold whitespace-nowrap inline-block ${
                                exp.category === 'Rekrutmen' 
                                  ? 'bg-violet-50 text-violet-700 border border-violet-100' 
                                  : exp.category === 'Operasional HR' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                    : exp.category === 'Pelatihan & Pengembangan'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                      : 'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}>
                                {exp.category}
                              </span>
                            </td>
                            <td className="py-2.5 text-right pr-4 font-black text-slate-900 font-sans w-[95px] whitespace-nowrap">
                              {formatRupiah(exp.amount)}
                            </td>
                            <td className="py-2.5 text-center w-[40px]">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpenseToDelete(exp);
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Hapus"
                              >
                                <Icon name="trash-2" size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredBudgetExpenses.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400 text-xs font-semibold select-none bg-slate-50/30">
                            <Icon name="file-text" size={32} className="mx-auto text-slate-300 stroke-[1.5] mb-2" />
                            Tidak ada data transaksi budget yang cocok
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Right Column (Donut Chart & Category Progress Cards) */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              
              {/* Card 3: Jenis Pembayaran (Donut Pie) */}
              <Card className="p-6 flex flex-col">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="font-extrabold text-[15px] text-slate-800 tracking-tight">Jenis Pembayaran</h3>
                    <p className="text-xs font-semibold text-slate-400 mt-1">Persentase penyerapan berdasarkan jalur bayar.</p>
                  </div>
                  {activeCrossPayment && (
                    <button 
                      onClick={() => {
                        setCrossPayment(null);
                        setCrossExpenseId(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100/80 border border-rose-100 rounded-xl transition-all shadow-sm shrink-0"
                    >
                      <Icon name="rotate-ccw" size={12} />
                      Reset Filter
                    </button>
                  )}
                </div>
                
                <div className="h-[230px] w-full flex items-center justify-center relative mt-2 select-none">
                  {filteredBudgetExpenses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-slate-400 text-xs font-semibold">
                      <Icon name="box" size={40} className="stroke-[1.5] mb-2 text-slate-300" />
                      Belum ada pengeluaran
                    </div>
                  ) : (
                    <ReResponsiveContainer width="100%" height="100%">
                      <RePieChart>
                        <RePie
                           data={paymentMethodDistribution}
                           cx="50%"
                           cy="50%"
                           innerRadius={55}
                           outerRadius={85}
                           paddingAngle={3}
                           dataKey="value"
                           label={(props: any) => props.percentage > 0 ? `${props.percentage}%` : ''}
                           labelLine={false}
                           onClick={(data) => {
                             if (data && data.name) {
                               setCrossPayment(prev => prev === data.name ? null : data.name);
                               setCrossExpenseId(null); // clear row filter
                             }
                           }}
                        >
                          {paymentMethodDistribution.map((entry, index) => {
                            const colorsMap: Record<string, string> = {
                              'Qris': '#8B5CF6',
                              'Transfer bank': '#3B82F6',
                              'Tunai': '#10B981'
                            };
                            const isSelected = !activeCrossPayment || activeCrossPayment === entry.name;
                            return (
                              <ReCell 
                                key={`cell-${index}`} 
                                fill={colorsMap[entry.name] || '#64748B'} 
                                opacity={isSelected ? 1 : 0.25}
                                className="cursor-pointer transition-opacity duration-300"
                              />
                            );
                          })}
                        </RePie>
                        <ReTooltip formatter={(val: number) => [formatRupiah(val), 'Jumlah']} contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 'bold' }} />
                      </RePieChart>
                    </ReResponsiveContainer>
                  )}
                </div>

                {/* Donut Legend */}
                {filteredBudgetExpenses.length > 0 && (
                  <div className="flex justify-center items-center gap-2 flex-wrap mt-2 pt-2 border-t border-slate-50">
                    <button 
                      onClick={() => {
                        setCrossPayment(prev => prev === 'Tunai' ? null : 'Tunai');
                        setCrossExpenseId(null);
                      }}
                      className={`flex items-center gap-1.5 text-[10px] font-extrabold px-2.5 py-1 rounded-lg border transition-all ${
                        activeCrossPayment === 'Tunai' 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                          : activeCrossPayment 
                            ? 'bg-white border-transparent text-slate-300 opacity-60' 
                            : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-[#10B981] inline-block shrink-0"></span>
                      Tunai
                    </button>
                    <button 
                      onClick={() => {
                        setCrossPayment(prev => prev === 'Qris' ? null : 'Qris');
                        setCrossExpenseId(null);
                      }}
                      className={`flex items-center gap-1.5 text-[10px] font-extrabold px-2.5 py-1 rounded-lg border transition-all ${
                        activeCrossPayment === 'Qris' 
                          ? 'bg-violet-50 border-violet-200 text-violet-700' 
                          : activeCrossPayment 
                            ? 'bg-white border-transparent text-slate-300 opacity-60' 
                            : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-[#8B5CF6] inline-block shrink-0"></span>
                      Qris
                    </button>
                    <button 
                      onClick={() => {
                        setCrossPayment(prev => prev === 'Transfer bank' ? null : 'Transfer bank');
                        setCrossExpenseId(null);
                      }}
                      className={`flex items-center gap-1.5 text-[10px] font-extrabold px-2.5 py-1 rounded-lg border transition-all ${
                        activeCrossPayment === 'Transfer bank' 
                          ? 'bg-blue-50 border-blue-200 text-blue-700' 
                          : activeCrossPayment 
                            ? 'bg-white border-transparent text-slate-300 opacity-60' 
                            : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-[#3B82F6] inline-block shrink-0"></span>
                      Transfer bank
                    </button>
                  </div>
                )}
              </Card>

              {/* Card 4: Kategori Pengeluaran */}
              <Card className="p-6 flex flex-col gap-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="font-extrabold text-[15px] text-slate-800 tracking-tight">Kategori Pengeluaran</h3>
                    <p className="text-xs font-semibold text-slate-400 mt-1">Alokasi sebaran total anggaran belanja HR.</p>
                  </div>
                  {activeCrossCategory && (
                    <button 
                      onClick={() => {
                        setCrossCategory(null);
                        setCrossExpenseId(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100/80 border border-rose-100 rounded-xl transition-all shadow-sm shrink-0"
                    >
                      <Icon name="rotate-ccw" size={12} />
                      Reset Filter
                    </button>
                  )}
                </div>

                {/* Category Progress Item Rows */}
                <div className="flex flex-col gap-3">
                  {categoryProgressData.map((cat, idx) => {
                    const isSelected = !activeCrossCategory || activeCrossCategory === cat.name;
                    return (
                      <div 
                        key={idx} 
                        onClick={() => {
                          setCrossCategory(prev => prev === cat.name ? null : cat.name);
                          setCrossExpenseId(null); // clear row filter
                        }}
                        className={`flex flex-col gap-1.5 cursor-pointer p-2.5 rounded-xl border transition-all ${
                          activeCrossCategory === cat.name
                            ? cat.selectClass
                            : activeCrossCategory
                              ? 'opacity-40 border-transparent hover:opacity-75'
                              : 'border-transparent hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cat.bgColor} border border-slate-100/50 shadow-sm`}>
                              <Icon name={cat.icon} size={16} />
                            </div>
                            <span className="text-[12.5px] font-black text-slate-700">{cat.name}</span>
                          </div>
                          <div className="text-right flex flex-col">
                            <span className="text-[13px] font-black text-slate-800 font-sans">{formatRupiah(cat.spent)}</span>
                          </div>
                        </div>
                        
                        {/* Custom styled category progress bar */}
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1 relative">
                          <div 
                            className="h-full rounded-full transition-all duration-500 bg-blue-600" 
                            style={{ 
                              width: `${cat.percentage}%`,
                              backgroundColor: cat.color
                            }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
        </div>

          {/* Budget Expense Modal (Portaled) */}
          {isBudgetExpenseModalOpen && createPortal(
            <div className="fixed inset-0 z-[9999] p-4 flex items-center justify-center animate-fadeIn font-sans">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsBudgetExpenseModalOpen(false)}></div>
              <Card className="relative w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-full">
                <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                      <Icon name="plus" size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-extrabold text-slate-800">Catat Pengeluaran Baru</h3>
                      <p className="text-[13px] text-slate-500 font-semibold mt-0.5">Masukkan detail pengeluaran & operasional HR.</p>
                    </div>
                  </div>
                  <button onClick={() => setIsBudgetExpenseModalOpen(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors">
                    <Icon name="x" size={20} />
                  </button>
                </div>
                
                <form onSubmit={e => {
                  e.preventDefault();
                  if (!expenseFormData.amount || !expenseFormData.description || !expenseFormData.date) {
                    alert("Mohon lengkapi seluruh isian data.");
                    return;
                  }
                  const newExpense: BudgetExpense = {
                    id: `exp-${Date.now()}`,
                    date: expenseFormData.date,
                    dept: 'HR & GA',
                    category: expenseFormData.category || 'Operasional HR',
                    amount: Number(expenseFormData.amount),
                    description: expenseFormData.description,
                    paymentMethod: expenseFormData.paymentMethod || 'Tunai'
                  };
                  setBudgetExpenses(prev => [newExpense, ...prev]);
                  logActivity('Tambah Pengeluaran Budget', { deskripsi: newExpense.description, jumlah: formatRupiah(newExpense.amount) });
                  setIsBudgetExpenseModalOpen(false);
                  setExpenseFormData({
                    date: new Date().toISOString().split('T')[0],
                    dept: 'HR & GA',
                    category: 'Operasional HR',
                    amount: '',
                    description: '',
                    paymentMethod: 'Tunai'
                  });
                }} className="p-6 overflow-auto scrollbar-thin flex-1 flex flex-col gap-4 text-left font-sans">
                  <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                    <label className="text-[13px] font-black font-sans">Tanggal Transaksi</label>
                    <input 
                      type="date" 
                      value={expenseFormData.date} 
                      onChange={e => setExpenseFormData({...expenseFormData, date: e.target.value})}
                      required 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all text-slate-800" 
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700 font-sans">
                    <label className="text-[13px] font-black">Kategori Pengeluaran</label>
                    <div className="relative">
                      <select 
                        value={expenseFormData.category} 
                        onChange={e => setExpenseFormData({...expenseFormData, category: e.target.value})}
                        required 
                        className="w-full appearance-none px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all text-slate-800"
                      >
                        <option value="Rekrutmen">Rekrutmen</option>
                        <option value="Operasional HR">Operasional HR</option>
                        <option value="Pelatihan & Pengembangan">Pelatihan & Pengembangan</option>
                        <option value="Biaya Lain-Lain">Biaya Lain-Lain</option>
                      </select>
                      <Icon name="chevron-down" size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700 font-sans">
                    <label className="text-[13px] font-black">Jenis Pembayaran</label>
                    <div className="relative">
                      <select 
                        value={expenseFormData.paymentMethod} 
                        onChange={e => setExpenseFormData({...expenseFormData, paymentMethod: e.target.value})}
                        required 
                        className="w-full appearance-none px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all text-slate-800"
                      >
                        <option value="Tunai">Tunai</option>
                        <option value="Qris">Qris</option>
                        <option value="Transfer bank">Transfer bank</option>
                      </select>
                      <Icon name="chevron-down" size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700 font-sans">
                    <label className="text-[13px] font-black">Jumlah Pengeluaran (Nominal Rupiah)</label>
                    <input 
                      type="number" 
                      placeholder="Contoh: 15000000"
                      value={expenseFormData.amount} 
                      onChange={e => setExpenseFormData({...expenseFormData, amount: e.target.value})}
                      required 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all text-slate-800" 
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700 font-sans">
                    <label className="text-[13px] font-black">Keterangan / Deskripsi</label>
                    <textarea 
                      rows={2} 
                      placeholder="Masukkan deskripsi penggunaan dana..."
                      value={expenseFormData.description} 
                      onChange={e => setExpenseFormData({...expenseFormData, description: e.target.value})}
                      required 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none resize-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all text-slate-800" 
                    />
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 mt-4 rounded-b-2xl -mx-6 -mb-6">
                    <button type="button" onClick={() => setIsBudgetExpenseModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-[13px] text-slate-600 hover:bg-slate-200 transition-colors">
                      Batal
                    </button>
                    <button 
                      type="submit"
                      className="px-5 py-2.5 rounded-xl font-bold text-[13px] bg-blue-600 text-white hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-1.5 shadow-sm font-sans"
                    >
                      <Icon name="check" size={14} /> Simpan Pengeluaran
                    </button>
                  </div>
                </form>
              </Card>
            </div>,
            document.body
          )}
        </div>
      )}

      {draggedPipelineJobId !== null && createPortal(
        <div 
          ref={customPipelineDragRef}
          className="fixed z-[10000] pointer-events-none bg-white shadow-2xl rounded-2xl border border-slate-200 px-6 py-4 flex items-center gap-4 transition-transform duration-75"
          style={{ width: dragPipelineOffset.current.width, opacity: 0.95 }}
        >
           <div className="flex items-center gap-3 shrink-0">
             <Icon name="grip-vertical" size={16} className="text-slate-400" />
             <span className="text-sm font-bold text-slate-400 w-5">-</span>
           </div>
           <div className="flex flex-col min-w-0 flex-1">
             <span className="text-[15px] truncate font-extrabold text-primary">
               {activeJobs.find(j => j.id === draggedPipelineJobId)?.title}
             </span>
             <span className="text-[11px] font-bold text-slate-400 mt-0.5">
               {(() => {
                const job = activeJobs.find(j => j.id === draggedPipelineJobId);
                return job ? `${job.status === 'Daily Worker' ? 'DW' : job.status} • ${job.dept}` : '';
              })()}
             </span>
           </div>
        </div>,
        document.body
      )}

      {isOvertimeModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] p-4 flex items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsOvertimeModalOpen(false)}></div>
          <Card className="relative w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-full">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Icon name="clock" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-800">{editingOvertimeId ? 'Edit Data Lembur' : 'Input Data Lembur'}</h3>
                  <p className="text-[13px] text-slate-500 font-medium">Lengkapi form berikut untuk data lembur karyawan.</p>
                </div>
              </div>
              <button onClick={() => setIsOvertimeModalOpen(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors">
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="p-6 overflow-auto scrollbar-thin flex-1 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                <label className="text-[13px] font-bold">Tanggal</label>
                <input type="date" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all text-slate-800" value={overtimeForm.date} onChange={e => setOvertimeForm({...overtimeForm, date: e.target.value})} />
              </div>
              
              <div className="flex justify-between items-end border-b border-slate-100 pb-2 -mb-2 mt-2">
                <span className="text-[13px] font-bold text-slate-800">Daftar Karyawan Lembur</span>
                <button
                  onClick={() => setOvertimeEntries([...overtimeEntries, { name: '', dept: '', status: '', startTime: '', endTime: '', duration: 0 }])}
                  className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1 hover:bg-blue-100 transition-colors"
                >
                  <Icon name="plus" size={14} /> Tambah
                </button>
              </div>

              {overtimeEntries.length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <p className="text-[13px] font-bold text-slate-500 text-center">Belum ada karyawan ditambahkan</p>
                  <p className="text-[11.5px] text-slate-400 mt-1 text-center">Klik tombol tambah untuk memasukkan data karyawan lembur.</p>
                </div>
              )}
              {overtimeEntries.map((entry, index) => (
                <div key={index} className="flex flex-col gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50 relative group">
                  <button
                    onClick={() => setOvertimeEntries(overtimeEntries.filter((_, i) => i !== index))}
                    className="absolute top-3 right-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors p-1.5 rounded-lg z-10"
                    title="Hapus Data"
                  >
                    <Icon name="x" size={16} />
                  </button>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                      <SearchableSelect 
                        label="Nama Karyawan"
                        placeholder="Pilih Karyawan"
                        value={entry.name}
                        options={uniqueOvertimeNames.map(name => ({ value: name, label: name }))}
                        allowCustom={true}
                        onChange={(selectedName) => {
                          const relatedEmp = employees.find(emp => emp.name === selectedName);
                          const relatedOvertime = overtimeRecords.find(r => r.name === selectedName);
                          const newEntries = [...overtimeEntries];
                          newEntries[index].name = selectedName;
                          if (relatedEmp) {
                            newEntries[index].dept = relatedEmp.dept;
                            newEntries[index].status = relatedEmp.status;
                          } else if (relatedOvertime) {
                            newEntries[index].dept = relatedOvertime.dept;
                            newEntries[index].status = relatedOvertime.status || '';
                          }
                          setOvertimeEntries(newEntries);
                        }}
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                      <SearchableSelect
                        label="Divisi"
                        placeholder="Pilih Divisi"
                        value={entry.dept}
                        options={uniqueOvertimeDepts.map(dept => ({ value: dept, label: dept }))}
                        allowCustom={true}
                        onChange={(selectedDept) => {
                          const newEntries = [...overtimeEntries];
                          newEntries[index].dept = selectedDept;
                          setOvertimeEntries(newEntries);
                        }}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                      <SearchableSelect
                        label="Status"
                        placeholder="Pilih Status"
                        value={entry.status}
                        options={uniqueOvertimeStatuses.map(status => ({ value: status, label: status }))}
                        allowCustom={true}
                        onChange={(selectedStatus) => {
                          const newEntries = [...overtimeEntries];
                          newEntries[index].status = selectedStatus;
                          setOvertimeEntries(newEntries);
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                      <label className="text-[13px] font-bold">Mulai</label>
                      <TimePicker 
                        value={entry.startTime}
                        placeholder="00.00"
                        onChange={val => {
                          const newEntries = [...overtimeEntries];
                          const dur = calculateTimeDuration(val, entry.endTime);
                          newEntries[index].startTime = val;
                          newEntries[index].duration = dur > 0 ? dur : entry.duration;
                          setOvertimeEntries(newEntries);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                      <label className="text-[13px] font-bold">Selesai</label>
                      <TimePicker 
                        value={entry.endTime}
                        placeholder="00.00"
                        onChange={val => {
                          const newEntries = [...overtimeEntries];
                          const dur = calculateTimeDuration(entry.startTime, val);
                          newEntries[index].endTime = val;
                          newEntries[index].duration = dur > 0 ? dur : entry.duration;
                          setOvertimeEntries(newEntries);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 text-slate-500 md:col-span-1 col-span-2">
                      <label className="text-[13px] font-bold truncate">Durasi (Jam)</label>
                      <input type="number" readOnly placeholder="0" className="w-full px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-[13px] font-semibold outline-none text-slate-600 cursor-not-allowed" value={entry.duration || ''} />
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                <label className="text-[13px] font-bold">Keterangan Lembur</label>
                <textarea rows={2} placeholder="Penjelasan pekerjaan lembur..." className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none resize-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all text-slate-800" value={overtimeForm.desc} onChange={e => setOvertimeForm({...overtimeForm, desc: e.target.value})} />
              </div>

              <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                 <label className="text-[13px] font-bold">Attachment (Form Lembur)</label>
                 <div className="border border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center justify-center gap-2 bg-slate-50 hover:bg-white transition-colors hover:border-blue-400 group relative">
                    <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={async (e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const file = e.target.files[0];
                        if (file.size > 50 * 1024 * 1024) {
                           alert("File terlalu besar. Maksimal ukuran file adalah 50MB.");
                           e.target.value = '';
                           return;
                        }
                        setIsUploading(true);
                        try {
                          const { uploadFileToFirestore } = await import('../firebase');
                          const url = await uploadFileToFirestore(file);
                          setOvertimeForm(prev => ({...prev, attachment: url, attachmentName: file.name}));
                        } catch (error) {
                          console.error("Upload error", error);
                          alert(error instanceof Error ? error.message : "Gagal mengunggah file.");
                        } finally {
                          setIsUploading(false);
                          e.target.value = '';
                        }
                      }
                    }} />
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Icon name="upload-cloud" size={20} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-blue-600">
                        {overtimeForm.attachment 
                          ? ((overtimeForm as any).attachmentName || 'File Terlampir') 
                          : 'Upload File'}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500 mt-0.5 max-w-[200px] truncate">
                        {overtimeForm.attachment 
                          ? 'File berhasil diunggah' 
                          : 'Maks. 50MB'}
                      </p>
                    </div>
                 </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0 rounded-b-2xl">
              <button onClick={() => setIsOvertimeModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-[13px] text-slate-600 hover:bg-slate-200 transition-colors">
                Batal
              </button>
              <button 
                onClick={handleSaveOvertime} 
                disabled={isSaving || isUploading}
                className={`px-5 py-2.5 rounded-xl font-bold text-[13px] bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center gap-2`}
              >
                {(isSaving || isUploading) && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {isUploading ? 'Mengunggah...' : (isSaving ? 'Menyimpan...' : 'Simpan Data')}
              </button>
            </div>
          </Card>
        </div>,
        document.body
      )}

      {isKontrakModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] p-4 flex items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsKontrakModalOpen(false)}></div>
          <Card className="relative w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-full">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Icon name="file-text" size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-slate-800">
                    {isEditingKontrak ? 'Edit Data Kontrak' : 'Input Data Kontrak'}
                  </h3>
                  <p className="text-sm font-medium text-slate-500">
                    {isEditingKontrak ? 'Perbarui data kontrak untuk karyawan ini.' : 'Lengkapi form berikut untuk data kontrak karyawan.'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsKontrakModalOpen(false)}
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
              >
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="p-6 overflow-auto scrollbar-thin flex-1 flex flex-col gap-4">
              {isEditingKontrak ? (
                <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                  <label className="text-[13px] font-bold text-slate-700">Nama Karyawan</label>
                  <input
                    type="text"
                    disabled
                    className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-[13px] font-semibold outline-none text-slate-500 cursor-not-allowed"
                    value={employees.find(e => e.id === kontrakForm.employeeId)?.name || ''}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                  <SearchableSelect 
                    label="Nama Karyawan"
                    placeholder="Pilih Karyawan"
                    value={kontrakForm.employeeId}
                    options={employees.map(emp => ({ value: emp.id, label: emp.name }))}
                    onChange={val => setKontrakForm({...kontrakForm, employeeId: val})}
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                <label className="text-[13px] font-bold">Jenis Kontrak</label>
                <div className="relative">
                  <select 
                    className="appearance-none w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all text-slate-800" 
                    value={kontrakForm.contractType} 
                    onChange={e => setKontrakForm({...kontrakForm, contractType: e.target.value})}
                  >
                    <option value="Kontrak Probation">Kontrak Probation</option>
                    <option value="Kontrak Lanjutan">Kontrak Lanjutan</option>
                    <option value="Kontrak Magang">Kontrak Magang</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <Icon name="chevron-down" size={16} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                  <label className="text-[13px] font-bold">Tanggal Mulai</label>
                  <input type="date" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all text-slate-800" value={kontrakForm.contractStart} onChange={e => setKontrakForm({...kontrakForm, contractStart: e.target.value})} />
                </div>
                <div className="flex flex-col gap-1.5 focus-within:text-blue-600 text-slate-700">
                  <label className="text-[13px] font-bold">Tanggal Berakhir</label>
                  <input type="date" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all text-slate-800" value={kontrakForm.contractEnd} onChange={e => setKontrakForm({...kontrakForm, contractEnd: e.target.value})} />
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end gap-3 rounded-b-2xl">
              <button 
                onClick={() => setIsKontrakModalOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition-all"
              >
                Batal
              </button>
              <button 
                onClick={handleSaveKontrak}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95"
              >
                Simpan Data
              </button>
            </div>
          </Card>
        </div>,
        document.body
      )}

      {expenseToDelete && createPortal(
        <div className="fixed inset-0 z-[10000] p-4 flex items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setExpenseToDelete(null)}></div>
          <Card className="relative w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-2xl p-6 text-center flex flex-col items-center gap-4 animate-scaleUp">
            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 mb-2">
              <Icon name="alert-triangle" size={32} />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-800 mb-2">Hapus Catatan Pengeluaran?</h3>
              <p className="text-sm text-slate-500 font-medium">Apakah Anda yakin ingin menghapus pengeluaran <span className="font-bold text-slate-700">"{expenseToDelete.description}"</span> senilai <span className="font-bold text-slate-700">{formatRupiah(expenseToDelete.amount)}</span> secara permanen?</p>
            </div>
            <div className="flex gap-3 w-full mt-2">
              <button onClick={() => setExpenseToDelete(null)} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Batal
              </button>
              <button 
                onClick={() => {
                  setBudgetExpenses(prev => prev.filter(e => e.id !== expenseToDelete.id));
                  logActivity('Hapus Pengeluaran Budget', { deskripsi: expenseToDelete.description, jumlah: formatRupiah(expenseToDelete.amount) });
                  setExpenseToDelete(null);
                }} 
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-sm shadow-rose-500/20 active:scale-95"
              >
                Hapus
              </button>
            </div>
          </Card>
        </div>,
        document.body
      )}

      {deleteOvertimeConfirm.isOpen && createPortal(
        <div className="fixed inset-0 z-[10000] p-4 flex items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDeleteOvertimeConfirm({ isOpen: false, id: null })}></div>
          <Card className="relative w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-2xl p-6 text-center flex flex-col items-center gap-4 animate-scaleUp">
            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 mb-2">
              <Icon name="alert-triangle" size={32} />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-800 mb-2">Hapus Data?</h3>
              <p className="text-sm text-slate-500 font-medium">Data lembur ini akan dihapus secara permanen. Apakah Anda yakin?</p>
            </div>
            <div className="flex gap-3 w-full mt-2">
              <button onClick={() => setDeleteOvertimeConfirm({ isOpen: false, id: null })} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Batal
              </button>
              <button onClick={executeDeleteOvertime} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-sm shadow-rose-500/20 active:scale-95">
                Hapus
              </button>
            </div>
          </Card>
        </div>,
        document.body
      )}

      {barTooltip.show && barTooltip.data && createPortal(
        <div className="fixed z-[9999] bg-slate-900 text-white p-3 rounded-xl shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full flex flex-col min-w-[150px] border border-slate-700 transition-opacity duration-150 ease-out" style={{ left: barTooltip.x, top: barTooltip.y - 15 }}>
          <div className="font-bold text-xs mb-2 pb-2 border-b border-slate-700 text-slate-200">{barTooltip.data.label}</div>
          <div className="flex flex-col gap-2 mb-2">
            {barTooltip.data.isOvertime ? (
              <div className="flex justify-between items-center text-[11px]">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: barTooltip.data.color }}></span> 
                  Total Durasi
                </div>
                <span className="font-bold text-white">{barTooltip.data.total} Jam</span>
              </div>
            ) : barTooltip.data.count !== undefined ? (
              // Status Pekerja specific tooltip (donut/horizontal bar)
              <>
                <div className="flex justify-between items-center text-[11px]">
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: barTooltip.data.color }}></span> 
                    Jumlah
                  </div>
                  <span className="font-bold text-white">{barTooltip.data.count} Orang</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="w-2.5 h-2.5 opacity-0"></span> 
                    Persentase
                  </div>
                  <span className="font-bold text-white">{Math.round(barTooltip.data.percentage)}%</span>
                </div>
              </>
            ) : (
              // Departemen specific tooltip (stacked bar)
              <>
                {Object.entries(barTooltip.data.counts)
                  .filter(([_, val]) => (val as number) > 0)
                  .sort(([sA], [sB]) => {
                    if (sA === 'Karyawan') return -1;
                    if (sB === 'Karyawan') return 1;
                    return sA.localeCompare(sB);
                  })
                  .map(([status, val]) => (
                    <div key={status} className="flex justify-between items-center text-[11px]">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: STATUS_COLORS_MAP[status] || '#CBD5E1' }}></span> 
                        {status === 'Daily Worker' ? 'DW' : status}
                      </div>
                      <span className="font-bold text-white">{val as number} Orang</span>
                    </div>
                  ))}
                  <div className="mt-1 pt-2 border-t border-slate-700 flex justify-between items-center text-[11px]">
                    <div className="flex items-center gap-2 text-slate-300 font-bold">
                       Total
                    </div>
                    <span className="font-bold text-white">{barTooltip.data.total} Orang</span>
                  </div>
              </>
            )}
          </div>
          <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45 border-r border-b border-slate-700"></div>
        </div>,
        document.body
      )}
    </div>
  );
};
