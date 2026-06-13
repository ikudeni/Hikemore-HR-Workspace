import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { Schedule, Candidate, Employee, JobListing } from '../types';
import { logActivity } from '../firebase';
import { DateRange } from 'react-date-range';
import { id as idLocale } from 'date-fns/locale';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { format, startOfMonth, endOfMonth, parseISO, startOfWeek, addDays, getISODay } from 'date-fns';

interface ScheduleWidgetProps {
  schedules: Schedule[];
  setSchedules: React.Dispatch<React.SetStateAction<Schedule[]>>;
  candidates?: Candidate[];
  employees?: Employee[];
  jobListings?: JobListing[];
}

type FilterTab = 'All' | 'Scheduled' | 'Completed' | 'Overdue';

export const ScheduleWidget = ({ schedules, setSchedules, candidates = [], employees = [], jobListings = [] }: ScheduleWidgetProps) => {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [filter, setFilter] = useState<FilterTab>('All');
  const [dayOffset, setDayOffset] = useState(0);
  const [dateRange, setDateRange] = useState([
    {
      startDate: startOfMonth(new Date()),
      endDate: endOfMonth(new Date()),
      key: 'selection'
    }
  ]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const baseDate = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const start = dateRange[0]?.startDate ? new Date(dateRange[0].startDate) : today;
    start.setHours(0,0,0,0);
    const end = dateRange[0]?.endDate ? new Date(dateRange[0].endDate) : today;
    end.setHours(23,59,59,999);
    
    if (today >= start && today <= end) {
      return today;
    }
    return start;
  }, [dateRange]);

  const weekStart = useMemo(() => {
    const today = new Date(now);
    today.setHours(0,0,0,0);
    return addDays(today, dayOffset - 10);
  }, [now, dayOffset]);

  const weekDays = useMemo(() => {
    return Array.from({length: 21}).map((_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const weekDaysStrs = useMemo(() => {
    return weekDays.map(d => format(d, 'yyyy-MM-dd'));
  }, [weekDays]);

  const hours = Array.from({length: 11}).map((_, i) => i + 8); // 8 AM to 6 PM

  // Reset day offset when selected date range changes
  useEffect(() => {
    setDayOffset(0);
  }, [dateRange]);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const hasCentredRef = useRef(false);

  useEffect(() => {
    if (viewMode === 'list') {
      hasCentredRef.current = false;
    }
  }, [viewMode]);

  const [isMouseDown, setIsMouseDown] = useState(false);
  const dragStartRef = useRef({ startX: 0, scrollLeft: 0 });

  const setScrollContainerRef = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    if (node && !hasCentredRef.current) {
      const todayStr = format(now, 'yyyy-MM-dd');
      const todayIndex = weekDaysStrs.indexOf(todayStr);
      if (todayIndex !== -1) {
        const totalWidth = 3634;
        const cornerHeaderWidth = 64;
        const columnWidth = (totalWidth - cornerHeaderWidth) / 21;
        const columnCenter = cornerHeaderWidth + (todayIndex * columnWidth) + (columnWidth / 2);
        
        const containerWidth = node.clientWidth || 900;
        const targetScrollLeft = columnCenter - (containerWidth / 2);
        node.scrollLeft = Math.max(0, targetScrollLeft);
        
        hasCentredRef.current = true;
        
        setTimeout(() => {
          const preciseContainerWidth = node.clientWidth;
          const preciseTargetScrollLeft = columnCenter - (preciseContainerWidth / 2);
          node.scrollTo({
            left: Math.max(0, preciseTargetScrollLeft),
            behavior: 'smooth'
          });
        }, 100);
      }
    }
  }, [weekDaysStrs]);

  const scrollToToday = useCallback((smooth = true) => {
    const node = scrollContainerRef.current;
    if (!node) return;
    const todayStr = format(now, 'yyyy-MM-dd');
    const todayIndex = weekDaysStrs.indexOf(todayStr);
    if (todayIndex !== -1) {
      const totalWidth = 3634;
      const cornerHeaderWidth = 64;
      const columnWidth = (totalWidth - cornerHeaderWidth) / 21;
      const columnCenter = cornerHeaderWidth + (todayIndex * columnWidth) + (columnWidth / 2);
      
      const containerWidth = node.clientWidth || 900;
      const targetScrollLeft = columnCenter - (containerWidth / 2);
      
      if (smooth) {
        node.scrollTo({
          left: Math.max(0, targetScrollLeft),
          behavior: 'smooth'
        });
      } else {
        node.scrollLeft = Math.max(0, targetScrollLeft);
      }
    }
  }, [now, weekDaysStrs]);

  const handleGoToToday = useCallback(() => {
    if (dayOffset === 0) {
      scrollToToday(true);
    } else {
      hasCentredRef.current = false;
      setDayOffset(0);
    }
  }, [dayOffset, scrollToToday]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const node = e.currentTarget;
    const containerWidth = node.clientWidth;
    const scrollLeft = node.scrollLeft;
    const maxScrollLeft = node.scrollWidth - containerWidth;
    
    const numDays = 21;
    const totalWidth = 3634;
    const cornerHeaderWidth = 64;
    const columnWidth = (totalWidth - cornerHeaderWidth) / numDays; // should be 170
    const shiftDays = 7;
    const shiftDistance = shiftDays * columnWidth; // 7 * 170 = 1190 px
    
    if (maxScrollLeft < shiftDistance) return;
    
    const threshold = 350; // threshold from edge to shift weeks
    
    if (scrollLeft < threshold) {
      setDayOffset(prev => prev - shiftDays);
      const newScrollLeft = scrollLeft + shiftDistance;
      node.scrollLeft = newScrollLeft;
      if (isMouseDown) {
        dragStartRef.current.scrollLeft += shiftDistance;
      }
    } else if (scrollLeft > maxScrollLeft - threshold) {
      setDayOffset(prev => prev + shiftDays);
      const newScrollLeft = scrollLeft - shiftDistance;
      node.scrollLeft = newScrollLeft;
      if (isMouseDown) {
        dragStartRef.current.scrollLeft -= shiftDistance;
      }
    }
  }, [isMouseDown]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    if (e.button !== 0) return; // Only left-click
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('select')) {
      return;
    }
    setIsMouseDown(true);
    dragStartRef.current = {
      startX: e.pageX - scrollContainerRef.current.offsetLeft,
      scrollLeft: scrollContainerRef.current.scrollLeft
    };
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsMouseDown(false);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsMouseDown(false);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isMouseDown || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - dragStartRef.current.startX) * 1.5;
    scrollContainerRef.current.scrollLeft = dragStartRef.current.scrollLeft - walk;
  }, [isMouseDown]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setIsDatePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [selectedDetailSchedule, setSelectedDetailSchedule] = useState<Schedule | null>(null);

  // Drag and drop state for Schedule cards
  const [draggedScheduleId, setDraggedScheduleId] = useState<number | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const [dropTargetScheduleId, setDropTargetScheduleId] = useState<number | null>(null);

  const [formData, setFormData] = useState<Partial<Schedule>>({
    title: '',
    type: 'Meeting',
    customType: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '09:00',
    method: '',
    location: '',
    link: '',
    interviewer: '',
    description: '',
    participants: [],
  });

  const getStatus = (s: Schedule) => {
    if (s.attendance === 'Hadir' || s.attendance === 'Tidak Hadir' || s.attendance === 'Selesai') return 'Completed';
    
    // Compare dates and times
    const now = new Date();
    // Parse the schedule end time or start time
    const scheduleTimeStr = s.endTime || s.startTime || '23:59';
    const scheduleDateTime = new Date(`${s.date}T${scheduleTimeStr}:00`);
    
    // If the combined date & time is in the past, it's overdue
    if (!isNaN(scheduleDateTime.getTime()) && scheduleDateTime < now) {
      return 'Overdue';
    }
    
    // Fallback if Date parsing fails somehow, just check date
    const todayStr = now.toISOString().split('T')[0];
    if (s.date < todayStr) {
      return 'Overdue';
    }
    
    return 'Scheduled';
  };

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      const status = getStatus(s);
      
      let isDateMatch = true;
      if (s.date && dateRange[0].startDate && dateRange[0].endDate) {
        const sDate = parseISO(s.date);
        sDate.setHours(0,0,0,0);
        const start = new Date(dateRange[0].startDate);
        start.setHours(0,0,0,0);
        const end = new Date(dateRange[0].endDate);
        end.setHours(23,59,59,999);
        
        isDateMatch = sDate >= start && sDate <= end;
      }
      
      if (!isDateMatch) return false;
      if (filter === 'All') return true;
      return status === filter;
    });
  }, [schedules, filter, dateRange]);

  const stats = useMemo(() => {
    let baseSchedules = schedules;
    if (dateRange[0].startDate && dateRange[0].endDate) {
        const start = new Date(dateRange[0].startDate);
        start.setHours(0,0,0,0);
        const end = new Date(dateRange[0].endDate);
        end.setHours(23,59,59,999);
        baseSchedules = schedules.filter(s => {
            const sDate = parseISO(s.date);
            sDate.setHours(0,0,0,0);
            return sDate >= start && sDate <= end;
        });
    }

    return {
      All: baseSchedules.length,
      Scheduled: baseSchedules.filter(s => getStatus(s) === 'Scheduled').length,
      Completed: baseSchedules.filter(s => getStatus(s) === 'Completed').length,
      Overdue: baseSchedules.filter(s => getStatus(s) === 'Overdue').length,
    }
  }, [schedules, dateRange]);

  const groupedSchedules = useMemo(() => {
    const groups: Record<string, Schedule[]> = {};
    const sorted = [...filteredSchedules].sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      const hasOrderA = a.listOrder !== undefined;
      const hasOrderB = b.listOrder !== undefined;
      if (hasOrderA && hasOrderB) {
        return (a.listOrder as number) - (b.listOrder as number);
      }
      const timeA = a.startTime || '00:00';
      const timeB = b.startTime || '00:00';
      return timeA.localeCompare(timeB);
    });

    sorted.forEach((s) => {
      if (!groups[s.date]) groups[s.date] = [];
      groups[s.date].push(s);
    });

    return groups;
  }, [filteredSchedules]);

  const openAddModal = () => {
    setEditingScheduleId(null);
    setFormData({
      title: '',
      type: 'Meeting',
      customType: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '08:00',
      endTime: '09:00',
      method: '',
      location: '',
      link: '',
      interviewer: '',
      description: '',
      participants: [],
      candidateName: '',
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (schedule: Schedule) => {
    setEditingScheduleId(schedule.id);
    setFormData(schedule);
    setIsAddModalOpen(true);
  };

  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingScheduleId !== null) {
      setSchedules(prev => prev.map(s => s.id === editingScheduleId ? { ...formData as Schedule, id: editingScheduleId } : s));
      logActivity('Jadwal Diupdate', { judul: formData.title });
    } else {
      const newSchedule: Schedule = {
        ...formData as Schedule,
        id: Date.now(),
      };
      setSchedules(prev => [...prev, newSchedule]);
      logActivity('Jadwal Dibuat', { judul: formData.title });
    }
    setIsAddModalOpen(false);
    setFormData({
      title: '',
      type: 'Meeting',
      customType: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '08:00',
      endTime: '09:00',
      method: '',
      location: '',
      link: '',
      interviewer: '',
      description: '',
      participants: [],
    });
  };

  const handleDelete = (id: number) => {
    const isConfirmed = window.confirm('Apakah Anda yakin ingin menghapus jadwal ini?');
    if (isConfirmed) {
      setSchedules(prev => prev.filter(s => s.id !== id));
      const s = schedules.find(x => x.id === id);
      if (s) logActivity('Jadwal Dihapus', { judul: s.title });
    }
  };

  const handleDropOnSchedule = (target: Schedule) => {
    if (!draggedScheduleId || draggedScheduleId === target.id) return;
    
    setSchedules(prev => {
      const draggedIndex = prev.findIndex(s => s.id === draggedScheduleId);
      const targetIndex = prev.findIndex(s => s.id === target.id);
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      
      const draggedSch = prev[draggedIndex];
      const targetSch = prev[targetIndex];
      const targetDate = targetSch.date;
      
      // Get all schedules on target day
      const daySchedules = prev.filter(s => s.date === targetDate);
      
      // Sort daySchedules by listOrder (or by startTime if no listOrder)
      const sortedDaySchedules = [...daySchedules].sort((a, b) => {
        const orderA = a.listOrder !== undefined ? a.listOrder : 0;
        const orderB = b.listOrder !== undefined ? b.listOrder : 0;
        if (a.listOrder !== undefined && b.listOrder !== undefined) {
          return orderA - orderB;
        }
        const timeA = a.startTime || '00:00';
        const timeB = b.startTime || '00:00';
        return timeA.localeCompare(timeB);
      });
      
      let updatedDaySchedules = [...sortedDaySchedules];
      const dIdx = updatedDaySchedules.findIndex(s => s.id === draggedScheduleId);
      
      if (dIdx !== -1) {
        // Dragged is on the same day. Remove from old index and insert at new index
        const [removed] = updatedDaySchedules.splice(dIdx, 1);
        const tIdx = updatedDaySchedules.findIndex(s => s.id === target.id);
        updatedDaySchedules.splice(tIdx, 0, removed);
      } else {
        // Dragged is from a DIFFERENT day. Change date and insert at target position
        logActivity('Jadwal Dipindahkan Tanggal', { 
          judul: draggedSch.title, 
          tanggal: targetDate 
        });
        
        const movedSch = { ...draggedSch, date: targetDate };
        const tIdx = updatedDaySchedules.findIndex(s => s.id === target.id);
        updatedDaySchedules.splice(tIdx, 0, movedSch);
      }
      
      // Assign sequential listOrders to target day
      updatedDaySchedules = updatedDaySchedules.map((s, idx) => ({
        ...s,
        listOrder: idx
      }));
      
      // Now map back to main state
      const finalSchedules = prev.map(s => {
        if (s.id === draggedScheduleId) {
          const updatedItem = updatedDaySchedules.find(x => x.id === draggedScheduleId);
          return updatedItem || { ...s, date: targetDate, listOrder: 999 };
        }
        
        const targetDayUpdatedItem = updatedDaySchedules.find(x => x.id === s.id);
        if (targetDayUpdatedItem) {
          return targetDayUpdatedItem;
        }
        
        return s;
      });
      
      logActivity('Jadwal Diatur Ulang', { 
        detail: `Posisi ${draggedSch.title} dipindahkan` 
      });
      
      return finalSchedules;
    });
    
    setDraggedScheduleId(null);
    setDropTargetScheduleId(null);
    setDropTargetDate(null);
  };

  const handleDropOnDate = (targetDate: string) => {
    if (!draggedScheduleId) return;
    
    setSchedules(prev => {
      const draggedSch = prev.find(s => s.id === draggedScheduleId);
      if (!draggedSch) return prev;
      
      if (draggedSch.date === targetDate) return prev;
      
      logActivity('Jadwal Dipindahkan Tanggal', { 
        judul: draggedSch.title, 
        tanggal: targetDate 
      });
      
      const targetDaySchedules = prev.filter(s => s.date === targetDate).sort((a, b) => {
        const orderA = a.listOrder !== undefined ? a.listOrder : 0;
        const orderB = b.listOrder !== undefined ? b.listOrder : 0;
        if (a.listOrder !== undefined && b.listOrder !== undefined) {
          return orderA - orderB;
        }
        const timeA = a.startTime || '00:00';
        const timeB = b.startTime || '00:00';
        return timeA.localeCompare(timeB);
      });
      
      const movedSch = { ...draggedSch, date: targetDate, listOrder: targetDaySchedules.length };
      
      return prev.map(s => {
        if (s.id === draggedScheduleId) {
          return movedSch;
        }
        return s;
      });
    });
    
    setDraggedScheduleId(null);
    setDropTargetScheduleId(null);
    setDropTargetDate(null);
  };

  const formatTime24 = (time: any) => {
    if (!time || typeof time !== 'string') return '00.00';
    try {
      const parts = time.split(':');
      const h = parts[0] || '00';
      const m = parts[1] || '00';
      // Clean up non-digits from minutes (e.g. if it contains AM/PM)
      const cleanM = m.replace(/\D/g, '');
      return `${h.padStart(2, '0')}.${(cleanM || '00').padStart(2, '0')}`;
    } catch (e) {
      return '00.00';
    }
  };

  const formatTime12 = (timeStr: any) => {
    if (!timeStr || typeof timeStr !== 'string') return '12:00 AM';
    try {
      const parts = timeStr.split(':');
      const h = parts[0] || '12';
      const m = parts[1] || '00';
      const cleanM = m.replace(/\D/g, '');
      let hour = parseInt(h, 10);
      if (isNaN(hour)) hour = 12;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      hour = hour ? hour : 12;
      if (cleanM === '00' || !cleanM) return `${hour} ${ampm}`;
      return `${hour}:${cleanM.padStart(2, '0')} ${ampm}`;
    } catch (e) {
      return '12:00 AM';
    }
  };

  const getScheduleColorTheme = (s: Schedule) => {
    const status = getStatus(s);
    if (status === 'Completed' || status === 'Overdue') {
      return {
        card: 'bg-slate-50 border-slate-200/80 text-slate-400 hover:bg-slate-100/70 opacity-75 transition-all',
        pill: 'bg-slate-200/60 text-slate-500 font-extrabold',
        title: 'text-slate-500 font-bold',
        subtitle: 'text-slate-400',
        avatarBorder: 'border-slate-50',
      };
    }

    // Stable index based on schedule info
    const str = s.title + (s.candidateName || '') + (s.id || '');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % 5;

    switch (index) {
      case 0: // Purple / Lavender
        return {
          card: 'bg-[#f4f2ff] border-[#e1d5fe] text-[#5b21b6] hover:bg-[#ebdffd]',
          pill: 'bg-[#ebdffd] text-[#6d28d9]',
          title: 'text-[#31106e]',
          subtitle: 'text-[#6d28d9]/80',
          avatarBorder: 'border-[#f4f2ff]',
        };
      case 1: // Green
        return {
          card: 'bg-[#ebfbf3] border-[#beecd0] text-[#065f46] hover:bg-[#dbf7e6]',
          pill: 'bg-[#dbf7e6] text-[#047857]',
          title: 'text-[#022c22]',
          subtitle: 'text-[#047857]/80',
          avatarBorder: 'border-[#ebfbf3]',
        };
      case 2: // Amber / Gold / Yellow
        return {
          card: 'bg-[#fef9eb] border-[#fde5a7] text-[#92400e] hover:bg-[#fdefcb]',
          pill: 'bg-[#fef2cd] text-[#b45309]',
          title: 'text-[#451a03]',
          subtitle: 'text-[#b45309]/80',
          avatarBorder: 'border-[#fef9eb]',
        };
      case 3: // Sky Blue
        return {
          card: 'bg-[#f0f9ff] border-[#bae6fd] text-[#075985] hover:bg-[#e0f2fe]',
          pill: 'bg-[#e0f2fe] text-[#0369a1]',
          title: 'text-[#0c4a6e]',
          subtitle: 'text-[#0369a1]/80',
          avatarBorder: 'border-[#f0f9ff]',
        };
      case 4: // Soft Pink / Rose
      default:
        return {
          card: 'bg-[#fff1f2] border-[#fecdd3] text-[#9f1239] hover:bg-[#ffe4e6]',
          pill: 'bg-[#ffe4e6] text-[#be123c]',
          title: 'text-[#4c0519]',
          subtitle: 'text-[#be123c]/80',
          avatarBorder: 'border-[#fff1f2]',
        };
    }
  };

  const getBorderColor = (s: Schedule, status: string) => {
    if (status === 'Overdue') return 'border-l-rose-500';
    if (status === 'Completed') return 'border-l-emerald-500';
    
    const colors = [
      'border-l-indigo-500',
      'border-l-blue-500',
      'border-l-emerald-500',
      'border-l-amber-500',
      'border-l-rose-500',
      'border-l-purple-500',
      'border-l-pink-500',
      'border-l-cyan-500',
      'border-l-orange-500',
      'border-l-teal-500'
    ];

    // Try to base color on Job ID if it's a candidate interview
    if (s.candidateId) {
      const candidate = candidates.find(c => c.id === s.candidateId);
      if (candidate) {
        return colors[candidate.jobId % colors.length];
      }
    }
    
    // Otherwise base it on the schedule title
    let hash = 0;
    const key = (s.title || '') + (s.type || '');
    for (let i = 0; i < key.length; i++) {
       hash = key.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const tabs: FilterTab[] = ['All', 'Scheduled', 'Completed', 'Overdue'];

  const calendarSchedules = schedules.filter(s => {
      const status = getStatus(s);
      if (filter !== 'All' && status !== filter) {
         // For week view calendar, we don't hide overdue or completed schedules when the tab is 'Scheduled' 
         // so they remain visible as beautiful grayed-out cards.
         if (filter === 'Scheduled' && (status === 'Completed' || status === 'Overdue')) {
           // Allow through
         } else {
           return false;
         }
      }
      try {
        const sDate = parseISO(s.date);
        return weekDaysStrs.includes(format(sDate, 'yyyy-MM-dd'));
      } catch (e) {
        return false;
      }
  });


  return (
    <div className="w-full flex flex-col pt-2">
      <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-4">
        <h3 className="text-xl font-black text-slate-800">Schedule</h3>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl">
             <button 
               onClick={() => setViewMode('list')} 
               className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
             >
               List
             </button>
             <button 
               onClick={() => setViewMode('calendar')} 
               className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'calendar' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
             >
               Week
             </button>
          </div>
          <button 
            onClick={openAddModal}
            className="flex items-center justify-center w-9 h-9 bg-[#314BF5] text-white hover:bg-blue-600 transition-all rounded-full shadow-sm"
          >
            <Icon name={"plus" as any} size={16} />
          </button>
        </div>
      </div>

      {/* Header and Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex flex-wrap gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                filter === tab 
                  ? 'bg-white text-slate-800 shadow-sm border border-slate-200' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                filter === tab 
                  ? (tab === 'Overdue' ? 'bg-rose-500 text-white' : tab === 'Scheduled' ? 'bg-indigo-500 text-white' : tab === 'Completed' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white')
                  : 'bg-slate-200 text-slate-500'
              }`}>
                {stats[tab]}
              </span>
            </button>
          ))}
        </div>
        {viewMode === 'calendar' && (
          <button 
            onClick={handleGoToToday}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl border border-indigo-200 text-indigo-600 bg-white hover:bg-slate-50 hover:border-indigo-300 hover:scale-[1.02] active:scale-95 cursor-pointer shadow-sm shadow-indigo-100/30 font-extrabold text-sm transition-all"
            title="Kembali ke Hari Ini (Center)"
          >
            <Icon name="calendar" size={14} />
            Hari Ini
          </button>
        )}
        {viewMode !== 'calendar' && (
          <div className="relative" ref={datePickerRef}>
            <div 
              className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm hover:border-blue-500 hover:ring-1 hover:ring-blue-500 cursor-pointer transition-all"
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
            >
              <Icon name="calendar" size={16} className="text-slate-400" />
              <span className="text-sm font-bold text-slate-700">
                {format(dateRange[0].startDate, 'd MMM yyyy', { locale: idLocale })} - {format(dateRange[0].endDate, 'd MMM yyyy', { locale: idLocale })}
              </span>
              <Icon name="chevron-down" size={16} className="text-slate-400 ml-1" />
            </div>

            {isDatePickerOpen && (
              <div className="absolute right-0 sm:right-auto sm:left-auto xl:right-0 top-full mt-2 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-slate-200 overflow-hidden z-50 animate-fadeIn" style={{ width: 'max-content' }}>
                <DateRange
                  ranges={dateRange}
                  onChange={item => setDateRange([item.selection as any])}
                  months={window.innerWidth > 640 ? 2 : 1}
                  direction="horizontal"
                  locale={idLocale}
                  rangeColors={['#3b82f6']}
                  showDateDisplay={false}
                />
                <div className="flex justify-end p-3 border-t border-slate-100 bg-slate-50 gap-2">
                  <button 
                    onClick={() => setIsDatePickerOpen(false)}
                    className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm shadow-blue-600/20"
                  >
                    Terapkan
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timeline List / Calendar View */}
      {viewMode === 'list' ? (
        <div className="flex flex-col max-h-[600px] overflow-y-auto hover-scrollbar pr-4 pb-12 animate-fadeIn">
          {Object.keys(groupedSchedules).sort().map((dateStr, index) => {
            const dateObj = new Date(dateStr);
            const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'short' });
            const dayDate = dateObj.getDate();
            const items = groupedSchedules[dateStr];

            return (
              <div key={dateStr} className="flex gap-6 relative group z-0">
                {/* Date left block */}
                <div className="w-[60px] shrink-0 flex flex-col items-center pt-2 relative z-10">
                  <div className="bg-slate-200/50 backdrop-blur-sm shadow-[inset_0_1px_rgba(255,255,255,0.8)] border border-slate-300 w-full aspect-square rounded-2xl flex flex-col justify-center items-center">
                    <span className="text-[11px] font-black uppercase text-slate-600 mb-[-2px]">{dayName}</span>
                    <span className="text-xl font-black text-slate-900 leading-none">{dayDate}</span>
                  </div>
                  {/* Connecting thin line between dates */}
                  {index !== Object.keys(groupedSchedules).length - 1 && (
                    <div className="w-px bg-slate-200 flex-1 my-2 min-h-[50px] group-last:hidden"></div>
                  )}
                </div>

                {/* Cards block for that day */}
                <div 
                  className={`flex-1 space-y-3 pb-8 rounded-2xl transition-all duration-200 ${
                    dropTargetDate === dateStr && !dropTargetScheduleId ? 'bg-indigo-50/10' : ''
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedScheduleId) {
                      setDropTargetDate(dateStr);
                    }
                  }}
                  onDragLeave={() => {
                    if (dropTargetDate === dateStr) {
                      setDropTargetDate(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnDate(dateStr);
                  }}
                >
                  {items.map(s => {
                    const status = getStatus(s);
                    const displayType = s.type === 'Lainnya' ? (s.customType || 'Lainnya') : s.type;
                    
                    let jobTitle = '';
                    if (s.candidateId) {
                      const candidate = candidates.find(c => c.id === s.candidateId);
                      if (candidate) {
                        const job = jobListings.find(j => j.id === candidate.jobId);
                        if (job) {
                          jobTitle = job.title;
                        }
                      }
                    }

                    return (
                      <div 
                        key={s.id} 
                        draggable
                        onDragStart={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('button, a, input, select')) {
                            e.preventDefault();
                            return;
                          }
                          setDraggedScheduleId(s.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', s.id.toString());
                        }}
                        onDragEnd={() => {
                          setDraggedScheduleId(null);
                          setDropTargetScheduleId(null);
                          setDropTargetDate(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (draggedScheduleId && draggedScheduleId !== s.id) {
                            setDropTargetScheduleId(s.id);
                            setDropTargetDate(s.date);
                          }
                        }}
                        onDragLeave={() => {
                          if (dropTargetScheduleId === s.id) {
                            setDropTargetScheduleId(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDropOnSchedule(s);
                        }}
                        className={`relative bg-white border border-slate-200 rounded-2xl p-5 flex flex-col xl:flex-row justify-between xl:items-center gap-4 transition-all hover:border-indigo-200 cursor-pointer hover:shadow-md border-l-4 ${getBorderColor(s, status)} ${
                          draggedScheduleId === s.id ? 'opacity-40 scale-[0.98] bg-slate-50/30' : ''
                        } ${
                          dropTargetScheduleId === s.id ? 'border-indigo-400 bg-indigo-50/10 scale-[1.01]' : ''
                        } select-none`}
                        onClick={(e) => { if ((e.target as HTMLElement).closest('button, a')) return; setSelectedDetailSchedule(s); }}
                      >
                        <div className="absolute top-3 right-3 flex flex-col gap-0.5 items-center z-10">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(s.id); }}
                            className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors"
                            title="Hapus Jadwal"
                          >
                            <Icon name="x" size={16} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); openEditModal(s); }}
                            className="text-slate-300 hover:text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg transition-colors"
                            title="Edit Jadwal"
                          >
                            <Icon name="edit" size={14} />
                          </button>
                        </div>

                        <div className="flex-1">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                            <h4 className="text-[17px] font-black text-slate-900 tracking-tight">
                              {formatTime24(s.startTime)} - {formatTime24(s.endTime)}
                            </h4>
                            <div className="flex gap-2 items-center">
                              {status === 'Scheduled' && <span className="bg-indigo-100 border border-indigo-200/60 text-indigo-700 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Scheduled</span>}
                              {status === 'Completed' && <span className="bg-emerald-100 border border-emerald-200/60 text-emerald-700 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Completed</span>}
                              {status === 'Overdue' && <span className="bg-rose-100 border border-rose-200/60 text-rose-700 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Overdue</span>}
                              
                              <span className="bg-blue-50 border border-blue-100/60 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1.5 capitalize">{displayType}</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1 mt-3">
                            <div className="flex items-center gap-3">
                              <div className="w-5 h-5 rounded-full bg-slate-900 border-2 border-white flex items-center justify-center text-[9px] font-black text-white shrink-0">HR</div>
                              <p className="text-[13px] font-bold text-slate-600">PIC: <strong className="text-slate-900">{employees?.find(e => e.id === s.interviewer)?.name || s.interviewer || 'N/A'}</strong></p>
                            </div>
                            
                            {s.candidateName && (
                              <div className="flex flex-col gap-0.5 pl-8 mt-1">
                                <span className="text-[11px] font-bold text-slate-500 truncate max-w-full">{s.title}</span>
                                {jobTitle && <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 w-fit px-1.5 py-0.5 rounded-md mt-0.5">Loker: {jobTitle}</span>}
                              </div>
                            )}
                          </div>
                          {s.type === 'Interview Online' && s.link && (
                            <div className="mt-3 flex items-center gap-2">
                               <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0"><Icon name="video" size={12} /></div>
                               <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[200px] xl:max-w-xs">{s.link}</a>
                            </div>
                          )}
                          {s.description && (
                            <div className="mt-3 bg-slate-50 border border-slate-100 p-3 rounded-xl">
                              <p className="text-[12px] font-medium text-slate-600 leading-relaxed italic">{s.description}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center xl:w-[40%] xl:justify-end pr-6 mt-4 xl:mt-0">
                           {s.candidateName ? (
                             <div className="flex gap-4 items-center">
                               <div className="w-10 h-10 bg-slate-200 rounded-full overflow-hidden shrink-0 shadow-sm border border-slate-100"><img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(s.candidateName)}&background=f8f9fa&color=0f172a&bold=true`} alt={s.candidateName} className="w-full h-full object-cover" /></div>
                               <div className="flex flex-col justify-center xl:items-end xl:text-right">
                                 <p className="text-[13px] font-extrabold text-slate-900 leading-tight">{s.candidateName}</p>
                                 {s.type !== 'Interview Online' && s.location && (
                                    <div className="flex items-start xl:justify-end gap-1.5 mt-2 text-slate-500">
                                      <Icon name="map-pin" size={12} className="mt-[1px] shrink-0 text-slate-400" />
                                      <span className="text-[11px] font-bold leading-snug">{s.location}</span>
                                    </div>
                                 )}
                                   <div className="flex gap-2 mt-3 xl:justify-end w-full">
                                     {s.attendance === 'Hadir' || s.attendance === 'Selesai' ? (
                                       <button onClick={(e) => { e.stopPropagation(); setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: null } : sch)); logActivity('Batal Kehadiran/Tugas Jadwal', { judul: s.title }); }} className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded-md flex items-center gap-1 hover:bg-emerald-200 transition-colors" title="Batal">
                                         <Icon name="check-circle" size={12} /> {s.type === 'Task' ? 'Selesai' : 'Hadir'}
                                       </button>
                                     ) : s.attendance === 'Tidak Hadir' ? (
                                       <button onClick={(e) => { e.stopPropagation(); setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: null } : sch)); logActivity('Batal Kehadiran/Tugas Jadwal', { judul: s.title }); }} className="text-[10px] bg-rose-100 text-rose-700 font-bold px-2 py-1 rounded-md flex items-center gap-1 hover:bg-rose-200 transition-colors" title="Batal">
                                         <Icon name="x-circle" size={12} /> Tidak Hadir
                                       </button>
                                     ) : (
                                       <>
                                         <button onClick={(e) => { e.stopPropagation(); setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: s.type === 'Task' ? 'Selesai' : 'Hadir' } : sch)); logActivity(s.type === 'Task' ? 'Tugas Selesai' : 'Jadwal Dihadiri', { judul: s.title }); }} className="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold px-2 py-1 rounded-md flex items-center gap-1 transition-colors border border-emerald-200" title={s.type === 'Task' ? 'Tandai Selesai' : 'Tandai Hadir'}>
                                           <Icon name="check" size={12} /> {s.type === 'Task' ? 'Selesai' : 'Hadir'}
                                         </button>
                                         {s.type !== 'Task' && (
                                           <button onClick={(e) => { e.stopPropagation(); setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: 'Tidak Hadir' } : sch)); logActivity('Jadwal Tidak Dihadiri', { judul: s.title }); }} className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-2 py-1 rounded-md flex items-center gap-1 transition-colors border border-rose-200" title="Tandai Tidak Hadir">
                                             <Icon name="x" size={12} /> Tidak Hadir
                                           </button>
                                         )}
                                       </>
                                     )}
                                   </div>
                               </div>
                             </div>
                           ) : (
                             <div className="flex flex-col w-full xl:items-end xl:text-right">
                               <p className="text-sm font-extrabold text-slate-800 mb-0.5">{s.title}</p>
                               {s.type !== 'Interview Online' && s.location && (
                                  <div className="flex items-start xl:justify-end gap-1.5 mt-1 text-slate-500">
                                    <Icon name="map-pin" size={12} className="mt-[1px] shrink-0 text-slate-400" />
                                    <span className="text-[11px] font-bold leading-snug">{s.location}</span>
                                  </div>
                               )}
                               <div className="flex gap-2 mt-3 xl:justify-end w-full">
                                 {s.attendance === 'Hadir' || s.attendance === 'Selesai' ? (
                                   <button onClick={() => { setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: null } : sch)); logActivity('Batal Kehadiran/Tugas Jadwal', { judul: s.title }); }} className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded-md flex items-center gap-1 hover:bg-emerald-200 transition-colors" title="Batal">
                                     <Icon name="check-circle" size={12} /> {s.type === 'Task' ? 'Selesai' : 'Hadir'}
                                   </button>
                                 ) : s.attendance === 'Tidak Hadir' ? (
                                   <button onClick={() => { setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: null } : sch)); logActivity('Batal Kehadiran/Tugas Jadwal', { judul: s.title }); }} className="text-[10px] bg-rose-100 text-rose-700 font-bold px-2 py-1 rounded-md flex items-center gap-1 hover:bg-rose-200 transition-colors" title="Batal">
                                     <Icon name="x-circle" size={12} /> Tidak Hadir
                                   </button>
                                 ) : (
                                   <>
                                     <button onClick={() => { setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: s.type === 'Task' ? 'Selesai' : 'Hadir' } : sch)); logActivity(s.type === 'Task' ? 'Tugas Selesai' : 'Jadwal Dihadiri', { judul: s.title }); }} className="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold px-2 py-1 rounded-md flex items-center gap-1 transition-colors border border-emerald-200" title={s.type === 'Task' ? 'Tandai Selesai' : 'Tandai Hadir'}>
                                       <Icon name="check" size={12} /> {s.type === 'Task' ? 'Selesai' : 'Hadir'}
                                     </button>
                                     {s.type !== 'Task' && (
                                       <button onClick={() => { setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: 'Tidak Hadir' } : sch)); logActivity('Jadwal Tidak Dihadiri', { judul: s.title }); }} className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-2 py-1 rounded-md flex items-center gap-1 transition-colors border border-rose-200" title="Tandai Tidak Hadir">
                                         <Icon name="x" size={12} /> Tidak Hadir
                                       </button>
                                     )}
                                   </>
                                 )}
                               </div>
                             </div>
                           )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filteredSchedules.length === 0 && (
            <div className="py-20 text-center font-bold text-slate-400">
              No schedules found for this category.
            </div>
          )}
        </div>
      ) : (
        <div className="relative group/calendar">
          {/* Always Visible Floating Left Navigation Button */}
          <button 
            onClick={() => setDayOffset(d => d - 1)} 
            className="absolute left-[76px] top-[11px] z-40 w-8 h-8 flex items-center justify-center rounded-full text-indigo-600 bg-white border border-indigo-100 shadow-md hover:bg-indigo-50 hover:scale-105 active:scale-95 transition-all duration-200 flex-shrink-0 cursor-pointer"
            title="Kembali 1 Hari"
          >
            <Icon name="chevron-left" size={16} strokeWidth={3} />
          </button>

          {/* Always Visible Floating Right Navigation Button */}
          <button 
            onClick={() => setDayOffset(d => d + 1)} 
            className="absolute right-3 top-[11px] z-40 w-8 h-8 flex items-center justify-center rounded-full text-indigo-600 bg-white border border-indigo-100 shadow-md hover:bg-indigo-50 hover:scale-105 active:scale-95 transition-all duration-200 flex-shrink-0 cursor-pointer"
            title="Maju 1 Hari"
          >
            <Icon name="chevron-right" size={16} strokeWidth={3} />
          </button>

          <div 
            ref={setScrollContainerRef} 
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onScroll={handleScroll}
            className={`relative border border-slate-200 mt-2 rounded-2xl overflow-x-auto bg-white mb-8 shadow-sm animate-fadeIn ${
              isMouseDown ? 'cursor-grabbing select-none' : 'cursor-grab'
            }`}
          >
            <div className="min-w-[3634px]">
             {/* Header */}
              <div className="flex w-full border-b border-slate-200 bg-slate-50 sticky top-0 z-30">
                <div className="w-16 border-r border-slate-200 shrink-0 flex items-center justify-center py-4 bg-slate-50 sticky left-0 z-40">
                   <span className="text-[9px] font-black tracking-widest text-[#6366f1] uppercase">GMT+7</span>
                </div>
                {weekDays.map((day, idx) => {
                   const isToday = format(now, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
                   return (
                      <div 
                        key={day.toISOString()} 
                        className={`flex-1 border-r border-slate-200 last:border-r-0 py-2.5 text-center relative group transition-colors flex flex-col justify-center ${
                          isToday ? 'bg-[#f4f2ff] border-t-4 border-t-[#6366f1]' : 'bg-slate-50'
                        }`}
                      >
                          <div className="flex items-center justify-center px-3 w-full">
                              <div className="flex flex-col items-center">
                                <span className={`text-[12px] font-black uppercase tracking-wider leading-none ${isToday ? 'text-[#6366f1]' : 'text-slate-800'}`}>
                                    {format(day, 'dd', { locale: idLocale })} {format(day, 'EEE', { locale: idLocale })}
                                </span>
                                <span className={`text-[9px] font-bold uppercase tracking-widest mt-1.5 leading-none ${isToday ? 'text-indigo-500/80' : 'text-slate-400'}`}>
                                    {format(day, 'MMMM', { locale: idLocale })}
                                </span>
                              </div>
                          </div>
                      </div>
                   )
                })}
             </div>
             
             {/* Body */}
             <div className="flex w-full relative">
                {/* Time labels */}
                <div className="w-16 shrink-0 border-r border-slate-200 bg-slate-50 sticky left-0 z-20">
                   {hours.map(hour => (
                      <div key={hour} className="h-28 border-b border-slate-200 flex justify-center py-3">
                          <span className="text-[10px] font-bold text-slate-400">
                            {String(hour).padStart(2, '0')}.00
                          </span>
                      </div>
                   ))}
                </div>
                {/* Day columns */}
                <div className="flex-1 flex relative bg-[#fafafa]">
                   
                   {/* Current time horizontal indicator line spanning across the columns layout */}
                   {(() => {
                      const currentHour = now.getHours();
                      const currentMinute = now.getMinutes();
                      if (currentHour >= 8 && currentHour < 19) {
                         const topRem = ((currentHour - 8) + (currentMinute / 60)) * 7;
                         return (
                            <div 
                               className="absolute left-0 right-0 h-0.5 bg-[#6366f1] pointer-events-none z-20 transition-all duration-500"
                               style={{ top: `${topRem}rem` }}
                            >
                               {/* Circle indicator on the dividing line */}
                               <div className="absolute left-0 -top-1 w-2.5 h-2.5 rounded-full bg-[#6366f1] ring-2 ring-white"></div>
                               {/* Floating precise current time label right in the GMT+7 first vertical labels column */}
                               <div 
                                  className="absolute -top-[9px] bg-[#6366f1] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-md z-30 transition-all"
                                  style={{ left: '-4.4rem' }}
                               >
                                  {format(now, 'HH:mm')}
                               </div>
                            </div>
                         );
                      }
                      return null;
                   })()}

                   {weekDays.map(day => {
                      const isToday = format(now, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');

                      const daySchedules = calendarSchedules.filter(s => {
                         try {
                           const sDate = parseISO(s.date);
                           return format(sDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
                         } catch { return false; }
                      });

                      // Union-find/merging for disjoint components (clusters) of overlapping events on this day
                      let components = daySchedules.map(s => [s]);
                      let changed = true;
                      while (changed) {
                         changed = false;
                         for (let i = 0; i < components.length; i++) {
                            for (let j = i + 1; j < components.length; j++) {
                               const overlap = components[i].some(s1 => 
                                  components[j].some(s2 => {
                                     const startA = s1.startTime || '08:00';
                                     const endA = s1.endTime || '09:00';
                                     const startB = s2.startTime || '08:00';
                                     const endB = s2.endTime || '09:00';
                                     return startA < endB && endA > startB;
                                  })
                               );
                               if (overlap) {
                                  components[i] = [...components[i], ...components[j]];
                                  components.splice(j, 1);
                                  changed = true;
                                  break;
                               }
                            }
                            if (changed) break;
                         }
                      }

                      // Setup layout configuration map for this day
                      const layoutMap = new Map<string | number, { colIndex: number; colCount: number }>();
                      components.forEach(comp => {
                         const sortedComp = [...comp].sort((a, b) => {
                            const startA = a.startTime || '08:00';
                            const startB = b.startTime || '08:00';
                            if (startA !== startB) return startA.localeCompare(startB);
                            const endA = a.endTime || '09:00';
                            const endB = b.endTime || '09:00';
                            return endA.localeCompare(endB);
                         });

                         const localColumns: Schedule[][] = [];
                         sortedComp.forEach(s => {
                            let placed = false;
                            for (let c = 0; c < localColumns.length; c++) {
                               const lastInCol = localColumns[c][localColumns[c].length - 1];
                               const overlap = (
                                  (s.startTime || '08:00') < (lastInCol.endTime || '09:00') &&
                                  (s.endTime || '09:00') > (lastInCol.startTime || '08:00')
                               );
                               if (!overlap) {
                                  localColumns[c].push(s);
                                  placed = true;
                                  break;
                               }
                            }
                            if (!placed) {
                               localColumns.push([s]);
                            }
                         });

                         sortedComp.forEach(s => {
                            let colIndex = 0;
                            for (let c = 0; c < localColumns.length; c++) {
                               if (localColumns[c].includes(s)) {
                                  colIndex = c;
                                  break;
                               }
                            }
                            layoutMap.set(s.id, {
                               colIndex,
                               colCount: localColumns.length
                            });
                         });
                      });
                      return (
                         <div 
                            key={day.toISOString()} 
                            className={`flex-1 border-r border-slate-200/60 last:border-r-0 h-[calc(11*7rem)] relative transition-colors ${
                              isToday ? 'bg-indigo-50/15' : 'bg-white'
                            }`}
                         >
                             {/* Hourly grid lines */}
                             {hours.map(hour => (
                                 <div key={hour} className="absolute w-full h-px bg-slate-200/60" style={{top: `${(hour - 8) * 7}rem`}}></div>
                             ))}
                             
                              {/* Schedules for this day */}
                             {daySchedules.map(s => {
                                 const [startH, startM] = (s.startTime || '08:00').split(':').map(Number);
                                 const [endH, endM] = (s.endTime || '09:00').split(':').map(Number);
                                 
                                 const effectiveStartH = Math.max(8, startH);
                                 const effectiveEndH = Math.min(19, endH);
                                 
                                 const topPx = ((effectiveStartH - 8) + (startM / 60)) * 7; // in rem
                                 const durationHrs = (effectiveEndH + endM/60) - (effectiveStartH + startM/60);
                                 const heightPx = Math.max(0.6, durationHrs) * 7; 
    
                                 const status = getStatus(s);
                                 const theme = getScheduleColorTheme(s);
                                 
                                 // Setup avatars stack
                                 const avatarsList: string[] = [];
                                 if (s.candidateName) {
                                   avatarsList.push(`https://ui-avatars.com/api/?name=${encodeURIComponent(s.candidateName)}&background=f1f5f9&color=334155&bold=true`);
                                 }
                                 if (s.interviewer) {
                                   avatarsList.push(`https://ui-avatars.com/api/?name=${encodeURIComponent(s.interviewer)}&background=ffedd5&color=c2410c&bold=true`);
                                 }
                                 
                                 const layout = layoutMap.get(s.id) || { colIndex: 0, colCount: 1 };
                                 const { colIndex, colCount } = layout;
                                 
                                 return (
                                     <div 
                                       key={s.id} 
                                       className={`absolute rounded-xl p-2.5 border cursor-pointer shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden flex flex-col justify-between group hover:-translate-y-0.5 hover:scale-[1.01] hover:z-40 ${theme.card}`}
                                       style={{
                                          top: `${topPx}rem`,
                                          height: `calc(${heightPx}rem - 6px)`,
                                          left: colCount > 1 ? `calc(${colIndex * (25 / (colCount - 1))}% + 6px)` : '6px',
                                          right: colCount > 1 ? `calc(${(colCount - 1 - colIndex) * (25 / (colCount - 1))}% + 6px)` : '6px',
                                          zIndex: 10 + colIndex
                                       }}
                                       onClick={() => setSelectedDetailSchedule(s)}
                                     >
                                        <div className="flex flex-col gap-1 w-full text-left">
                                           {/* Time Pill */}
                                           <div className={`inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full text-[9px] font-bold ${theme.pill} tracking-tight select-none`}>
                                              <Icon name="clock" size={9} strokeWidth={2.5} className="shrink-0" />
                                              <span>{formatTime24(s.startTime)} - {formatTime24(s.endTime)}</span>
                                           </div>
                                           
                                           <h4 className={`text-[12px] font-black leading-snug mt-1 truncate ${theme.title}`}>{s.title}</h4>
                                        </div>
                                        
                                        {/* Avatars and Subtitle on the bottom */}
                                        <div className="flex items-center justify-between gap-1 mt-auto pt-1 w-full text-left">
                                           <p className={`text-[10px] font-bold truncate max-w-[70%] ${theme.subtitle}`}>{s.type}{s.location ? ` - ${s.location}` : ''}</p>
                                           <div className="flex -space-x-1.5 shrink-0 overflow-hidden">
                                              {avatarsList.map((avatarUrl, aIdx) => (
                                                 <img 
                                                    key={aIdx} 
                                                    src={avatarUrl} 
                                                    alt="Participant" 
                                                    className="w-5 h-5 rounded-full ring-2 ring-white object-cover shadow-sm"
                                                    referrerPolicy="no-referrer"
                                                 />
                                              ))}
                                           </div>
                                        </div>
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
    )}

      {isAddModalOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 animate-fadeIn" onClick={() => setIsAddModalOpen(false)}></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-lg bg-white rounded-3xl shadow-2xl p-6 lg:p-8 z-50 animate-slideUp overflow-y-auto max-h-[90vh] hover-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-extrabold text-xl text-slate-900">{editingScheduleId ? 'Edit Schedule Target' : 'Add Schedule Target'}</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-xl transition-colors">
                <Icon name={"x" as any} size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Judul Schedule</label>
                <input 
                  type="text" required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                  value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                  placeholder="Misal: Psikotes Calon Designer"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Tanggal</label>
                  <input 
                    type="date" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Tipe</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})}
                  >
                    <option value="Meeting">Meeting</option>
                    <option value="Interview Online">Interview Online</option>
                    <option value="Interview Offline">Interview Offline</option>
                    <option value="Event">Event</option>
                    <option value="Tugas">Tugas</option>
                    <option value="Lainnya">Lainnya...</option>
                  </select>
                </div>
              </div>

              {formData.type === 'Lainnya' && (
                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Tipe Custom</label>
                  <input 
                    type="text" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.customType} onChange={e => setFormData({...formData, customType: e.target.value})}
                    placeholder="Masukkan tipe kegiatan"
                  />
                </div>
              )}

              {formData.type === 'Interview Online' && (
                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Link Interview Online</label>
                  <input 
                    type="url" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.link || ''} onChange={e => setFormData({...formData, link: e.target.value})}
                    placeholder="Contoh: https://meet.google.com/..."
                  />
                </div>
              )}

              {formData.type !== 'Interview Online' && (
                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Lokasi / Ruangan</label>
                  <input 
                    type="text" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})}
                    placeholder="Contoh: Gedung A, Ruang Meeting 3"
                  />
                </div>
              )}

              {formData.type?.includes('Interview') && (
                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Interviewer / PIC</label>
                  <input 
                    type="text" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.interviewer} onChange={e => setFormData({...formData, interviewer: e.target.value})}
                    placeholder="Siapa yang akan meng-interview?"
                  />
                </div>
              )}

              {!formData.type?.includes('Interview') && (
                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Penanggung Jawab (PIC)</label>
                  <input 
                    type="text"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.interviewer} onChange={e => setFormData({...formData, interviewer: e.target.value})}
                    placeholder="Nama penanggung jawab"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Waktu Mulai</label>
                  <input 
                    type="time" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Waktu Selesai</label>
                  <input 
                    type="time" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Keterangan / Deskripsi</label>
                <textarea 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:border-indigo-500 outline-none transition-all resize-y min-h-[80px]"
                  value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Tambahkan detail jadwal (opsional)"
                ></textarea>
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full bg-[#314BF5] text-white font-extrabold py-3.5 rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2">
                  <Icon name={"check" as any} size={18} /> Simpan Jadwal
                </button>
              </div>
            </form>
          </div>
        </>
      )}
      {selectedDetailSchedule && (() => {
        const s = selectedDetailSchedule;
        const status = getStatus(s);
        const displayType = s.type === 'Lainnya' ? (s.customType || 'Lainnya') : s.type;

        let jobTitle = '';
        if (s.candidateId) {
          const candidate = candidates?.find(c => c.id === s.candidateId);
          if (candidate) {
            const job = jobListings?.find(j => j.id === candidate.jobId);
            if (job) {
              jobTitle = job.title;
            }
          }
        }

        const dateObj = new Date(s.date);
        const dateFormatted = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        return (
          <>
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 animate-fadeIn" onClick={() => setSelectedDetailSchedule(null)}></div>
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95%] max-w-md bg-white rounded-3xl shadow-2xl p-6 z-50 animate-slideUp overflow-y-auto max-h-[90vh]">
              {/* Header */}
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                <div className="flex gap-2 items-center">
                  <span className="bg-indigo-50 border border-indigo-100/60 text-indigo-600 text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 capitalize tracking-wide select-none">
                    {displayType}
                  </span>
                  
                  {status === 'Scheduled' && (
                    <span className="bg-blue-50 border border-blue-100/60 text-blue-700 text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 tracking-wide uppercase select-none">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Scheduled
                    </span>
                  )}
                  {status === 'Completed' && (
                    <span className="bg-emerald-50 border border-emerald-100/60 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 tracking-wide uppercase select-none">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Completed
                    </span>
                  )}
                  {status === 'Overdue' && (
                    <span className="bg-rose-50 border border-rose-100/60 text-rose-700 text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 tracking-wide uppercase select-none">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-bounce" /> Overdue
                    </span>
                  )}
                </div>
                <button onClick={() => setSelectedDetailSchedule(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-xl transition-colors">
                  <Icon name="x" size={18} />
                </button>
              </div>

              {/* Title & Waktu */}
              <div className="mb-5">
                <h3 className="text-xl font-black text-slate-900 leading-tight tracking-tight mb-3">
                  {s.title}
                </h3>
                <div className="flex items-center gap-3 text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                    <Icon name="calendar" size={15} />
                  </div>
                  <div className="flex flex-col">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Waktu Kegiatan</p>
                    <p className="text-[13px] font-extrabold text-slate-800 leading-none">{dateFormatted}</p>
                    <p className="text-[11px] font-bold text-indigo-600 mt-1">{formatTime24(s.startTime)} - {formatTime24(s.endTime)} WIB</p>
                  </div>
                </div>
              </div>

              {/* Detail fields */}
              <div className="space-y-3.5 mb-6">
                {/* PIC */}
                <div className="flex items-start gap-3">
                  <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                    <Icon name="user" size={14} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Penanggung Jawab (PIC)</p>
                    <p className="text-[13px] font-black text-slate-800">{employees?.find(e => e.id === s.interviewer)?.name || s.interviewer || 'Belum Ditentukan'}</p>
                  </div>
                </div>

                {/* Kandidat */}
                {s.candidateName && (
                  <div className="p-3 bg-indigo-50/40 border border-indigo-100/50 rounded-xl flex gap-3 items-center">
                    <div className="w-9 h-9 bg-slate-200 rounded-full overflow-hidden shrink-0 border border-white shadow-sm">
                      <img 
                        src={`https://ui-avatars.com/api/?name=${encodeURIComponent(s.candidateName)}&background=6366f1&color=ffffff&bold=true`} 
                        alt={s.candidateName} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">Kandidat</p>
                      <p className="text-[13px] font-black text-slate-800 leading-none truncate">{s.candidateName}</p>
                      {jobTitle && (
                        <p className="text-[10px] font-bold text-indigo-700 bg-indigo-100/80 w-fit px-1.5 py-0.5 rounded-md mt-1 truncate">
                          Loker: {jobTitle}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Lokasi / Link */}
                {s.type === 'Interview Online' && s.link ? (
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                      <Icon name="video" size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Link Video Meeting</p>
                      <a 
                        href={s.link} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="inline-flex items-center gap-1.5 text-[12px] font-black text-blue-600 hover:text-blue-800 hover:underline max-w-full italic"
                      >
                        <span className="truncate">{s.link}</span>
                        <Icon name="external-link" size={11} />
                      </a>
                    </div>
                  </div>
                ) : (
                  s.location && (
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg shrink-0">
                        <Icon name="map-pin" size={14} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lokasi / Ruangan</p>
                        <p className="text-[12px] font-black text-slate-800 leading-snug">{s.location}</p>
                      </div>
                    </div>
                  )
                )}

                {/* Deskripsi */}
                {s.description && (
                  <div className="flex items-start gap-3 border-t border-slate-100 pt-3">
                    <div className="p-1.5 bg-slate-100 text-slate-500 rounded-lg shrink-0">
                      <Icon name="file-text" size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Catatan Tambahan</p>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-[12px] text-slate-600 leading-relaxed font-medium italic">
                        {s.description}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Footer Actions */}
              <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
                {/* Status Marking Row */}
                <div className="flex gap-2">
                  {s.type !== 'Task' ? (
                    <>
                      <button 
                        onClick={() => {
                          const newAttendance = s.attendance === 'Tidak Hadir' ? null : 'Tidak Hadir';
                          setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: newAttendance } : sch));
                          logActivity(newAttendance ? 'Jadwal Tidak Dihadiri' : 'Batal Kehadiran/Tugas Jadwal', { judul: s.title });
                        }} 
                        className={`flex-1 py-2 px-3 font-extrabold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 border select-none ${
                          s.attendance === 'Tidak Hadir'
                            ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/10'
                            : s.attendance === 'Hadir'
                              ? 'bg-slate-100 text-slate-400 border-slate-200/60 opacity-60 hover:bg-slate-200/80'
                              : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-100'
                        }`}
                      >
                        <Icon name="x-circle" size={13} /> Tidak Hadir
                      </button>

                      <button 
                        onClick={() => {
                          const newAttendance = s.attendance === 'Hadir' ? null : 'Hadir';
                          setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: newAttendance } : sch));
                          logActivity(newAttendance ? 'Jadwal Dihadiri' : 'Batal Kehadiran/Tugas Jadwal', { judul: s.title });
                        }} 
                        className={`flex-1 py-2 px-3 font-extrabold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 border select-none ${
                          s.attendance === 'Hadir'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10'
                            : s.attendance === 'Tidak Hadir'
                              ? 'bg-slate-100 text-slate-400 border-slate-200/60 opacity-60 hover:bg-slate-200/80'
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100'
                        }`}
                      >
                        <Icon name="check-circle" size={13} /> Hadir
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => {
                        const newAttendance = s.attendance === 'Selesai' ? null : 'Selesai';
                        setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: newAttendance } : sch));
                        logActivity(newAttendance ? 'Tugas Selesai' : 'Batal Kehadiran/Tugas Jadwal', { judul: s.title });
                      }} 
                      className={`flex-1 py-2 px-3 font-extrabold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 border select-none ${
                        s.attendance === 'Selesai'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10'
                          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100'
                      }`}
                    >
                      <Icon name="check-circle" size={13} /> Selesai
                    </button>
                  )}
                </div>

                {/* Form Actions & Dismiss Row */}
                <div className="flex gap-2 items-center justify-between">
                  <div className="flex gap-1.5">
                    <button 
                      onClick={() => {
                        const isConfirmed = window.confirm('Apakah Anda yakin ingin menghapus jadwal ini?');
                        if (isConfirmed) {
                          setSchedules(prev => prev.filter(sch => sch.id !== s.id));
                          logActivity('Jadwal Dihapus', { judul: s.title });
                          setSelectedDetailSchedule(null);
                        }
                      }} 
                      className="px-2.5 py-1.5 bg-rose-50 text-rose-600 font-extrabold text-[11px] rounded-xl hover:bg-rose-100 transition-colors flex items-center gap-1 border border-rose-100"
                      title="Hapus Jadwal"
                    >
                      <Icon name="trash-2" size={12} /> Hapus
                    </button>
                    
                    <button 
                      onClick={() => {
                        openEditModal(s);
                        setSelectedDetailSchedule(null);
                      }} 
                      className="px-2.5 py-1.5 bg-slate-50 text-slate-700 font-extrabold text-[11px] rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-1 border border-slate-100"
                    >
                      <Icon name="edit" size={12} /> Edit
                    </button>
                  </div>

                  <button 
                    onClick={() => setSelectedDetailSchedule(null)} 
                    className="px-4 py-1.5 bg-slate-900 text-white hover:bg-slate-800 font-extrabold text-[11px] rounded-xl transition-all"
                  >
                    Tutup
                  </button>
                </div>
              </div>

            </div>
          </>
        );
      })()}
      {deleteConfirmId !== null && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] animate-fadeIn" onClick={() => setDeleteConfirmId(null)}></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white rounded-3xl shadow-2xl p-6 z-[60] animate-slideUp">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-5 mt-2">
                <Icon name="alert-triangle" size={28} />
              </div>
              <h3 className="font-extrabold text-[19px] text-slate-900 mb-2">Hapus Jadwal?</h3>
              <p className="text-sm rounded-xl text-slate-500 mb-8 font-medium">Apakah Anda yakin ingin menghapus jadwal ini? Data yang terhapus tidak dapat dikembalikan.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Batal</button>
                <button 
                  onClick={() => { 
                    setSchedules(prev => prev.filter(s => s.id !== deleteConfirmId)); 
                    const s = schedules.find(x => x.id === deleteConfirmId);
                    if (s) logActivity('Jadwal Dihapus', { judul: s.title });
                    setDeleteConfirmId(null); 
                  }} 
                  className="flex-1 px-4 py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-colors"
                >
                  Hapus Jadwal
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
