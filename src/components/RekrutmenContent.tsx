/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { FormSelect, CompactFormSelect } from './ui/FormSelect';
import { getSourceBadgeClass } from '../utils';
import { Employee, JobListing, KanbanStage, Candidate, Schedule } from '../types';
import { db, logActivity, handleFirestoreError, OperationType, storage } from '../firebase';
import { doc, setDoc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface RekrutmenContentProps {
  employees: Employee[];
  jobListings: JobListing[];
  setJobListings: React.Dispatch<React.SetStateAction<JobListing[]>>;
  kanbanStages: KanbanStage[];
  setKanbanStages: React.Dispatch<React.SetStateAction<KanbanStage[]>>;
  jobStagesMap: Record<number, string[]>;
  setJobStagesMap: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  candidates: Candidate[];
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  schedules: Schedule[];
  setSchedules: React.Dispatch<React.SetStateAction<Schedule[]>>;
}

export const RekrutmenContent = ({ 
  employees, jobListings, setJobListings, kanbanStages, setKanbanStages, 
  jobStagesMap, setJobStagesMap, candidates, setCandidates,
  schedules, setSchedules 
}: RekrutmenContentProps) => {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [isEditJobModalOpen, setIsEditJobModalOpen] = useState(false);
  const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
  const [jobFormData, setJobFormData] = useState<any>({
    title: '',
    dept: '',
    status: 'Karyawan',
    quota: '1',
    isActiveJob: true,
    customDept: ''
  });
  const [jobFilter, setJobFilter] = useState('Aktif');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [draggingJobId, setDraggingJobId] = useState<number | null>(null);
  const [dragOverJobId, setDragOverJobId] = useState<number | null>(null);
  const [candidateSearchQuery, setCandidateSearchQuery] = useState('');
  const [copiedPhoneId, setCopiedPhoneId] = useState<number | null>(null);
  const [copiedNameId, setCopiedNameId] = useState<number | null>(null);
  const [draggedCandidate, setDraggedCandidate] = useState<Candidate | null>(null);
  const [dropPlaceholder, setDropPlaceholder] = useState<{ stageId: string | null, index: number | null, height: number | null }>({ stageId: null, index: null, height: null });
  const [dragPosition, setDragPosition] = useState({ x: -9999, y: -9999 });
  const [stageDropIndex, setStageDropIndex] = useState<number | null>(null);
  const dragOffset = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const customDragRef = useRef<HTMLDivElement>(null);
  const customStageDragRef = useRef<HTMLDivElement>(null);
  const customJobDragRef = useRef<HTMLDivElement>(null);
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [activeCandidateDropdown, setActiveCandidateDropdown] = useState<number | null>(null);
  const [isEditCandidateModalOpen, setIsEditCandidateModalOpen] = useState(false);
  const [editCandidateFormData, setEditCandidateFormData] = useState<any>(null);
  const [isUploadDocumentModalOpen, setIsUploadDocumentModalOpen] = useState(false);
  const [documentUploadTarget, setDocumentUploadTarget] = useState<Candidate | null>(null);
  const [activeAddFormStage, setActiveAddFormStage] = useState<string | null>(null);
  const [addCandidateFormData, setAddCandidateFormData] = useState({ name: '', phone: '', source: 'Glints', customSource: '', stage: '' });
  
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>([]);
  
  const [isDeleteJobModalOpen, setIsDeleteJobModalOpen] = useState(false);
  const [jobToDeleteId, setJobToDeleteId] = useState<number | null>(null);

  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [isDownloadingDoc, setIsDownloadingDoc] = useState<string | null>(null);

  const [candidateToDelete, setCandidateToDelete] = useState<number | null>(null);
  
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedCandidateForSchedule, setSelectedCandidateForSchedule] = useState<Candidate | null>(null);
  const [scheduleFormData, setScheduleFormData] = useState<Partial<Schedule>>({
    title: '',
    type: 'Meeting',
    date: new Date().toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '09:00',
    method: 'Google Meet',
    participants: ['https://i.pravatar.cc/150?img=11'],
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollAnimationFrame = useRef<number | null>(null);
  const mousePos = useRef({ x: -1, y: -1 });

  const getDeptStyles = (dept: string) => {
    const styles: Record<string, any> = {
      'Marketing': { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' },
      'Sales': { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
      'IT': { bg: 'bg-indigo-50', text: 'text-indigo-600', dot: 'bg-indigo-500' },
      'HR': { bg: 'bg-rose-50', text: 'text-rose-600', dot: 'bg-rose-500' },
      'Finance': { bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-500' },
      'Operasional': { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-500' },
    };
    return styles[dept] || { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-500' };
  };

  const handleEditJob = (job: JobListing) => {
    const isCustom = !['Marketing', 'Sales', 'IT', 'HR', 'Finance', 'Operasional'].includes(job.dept);
    setJobFormData({ 
      ...job, 
      quota: job.quota.toString(), 
      dept: isCustom ? 'Lainnya' : job.dept,
      customDept: isCustom ? job.dept : '' 
    });
    setIsEditJobModalOpen(true);
    setActiveDropdown(null);
  };

  const handleDeactivateJob = (id: number) => {
    setJobListings(prev => prev.map(j => j.id === id ? { ...j, isActiveJob: false } : j));
    const job = jobListings.find(j => j.id === id);
    if (job) logActivity('Lowongan Dinonaktifkan', { posisi: job.title });
    setActiveDropdown(null);
  };

  const handleActivateJob = (id: number) => {
    setJobListings(prev => prev.map(j => j.id === id ? { ...j, isActiveJob: true } : j));
    const job = jobListings.find(j => j.id === id);
    if (job) logActivity('Lowongan Diaktifkan', { posisi: job.title });
    setActiveDropdown(null);
  };

  const handleDeleteJob = (id: number) => {
    setJobToDeleteId(id);
    setIsDeleteJobModalOpen(true);
    setActiveDropdown(null);
  };

  const confirmDeleteJob = () => {
    if (jobToDeleteId !== null) {
      const job = jobListings.find(j => j.id === jobToDeleteId);
      if (job) logActivity('Lowongan Dihapus', { posisi: job.title });
      
      const candidateIds = candidates.filter(c => c.jobId === jobToDeleteId).map(c => c.id);
      
      setJobListings(prev => prev.filter(j => j.id !== jobToDeleteId));
      setCandidates(prev => prev.filter(c => c.jobId !== jobToDeleteId));
      setSchedules(prev => prev.filter(s => !candidateIds.includes(s.candidateId)));
      
      setIsDeleteJobModalOpen(false);
      setJobToDeleteId(null);
    }
  };

  const confirmDeleteCandidate = () => {
    if (candidateToDelete !== null) {
      const candidate = candidates.find(c => c.id === candidateToDelete);
      if (candidate) logActivity('Kandidat Dihapus', { nama: candidate.name });
      
      setCandidates(prev => prev.filter(cand => cand.id !== candidateToDelete));
      setSchedules(prev => prev.filter(s => s.candidateId !== candidateToDelete));
      
      setCandidateToDelete(null);
    }
  };

  const handleJobFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalDept = jobFormData.dept === 'Lainnya' ? jobFormData.customDept : jobFormData.dept;
    const finalQuota = parseInt(jobFormData.quota) || 0;
    
    if (isCreateJobModalOpen) {
      const styles = getDeptStyles(finalDept || '');
      const newJob: JobListing = {
        ...jobFormData,
        dept: finalDept,
        quota: finalQuota,
        id: Date.now(),
        catBg: styles.bg,
        catText: styles.text,
        catDot: styles.dot,
        applied: 0,
        progress: 0,
        accepted: 0,
        isActiveJob: true,
      };
      setJobListings(prev => [newJob, ...prev]);
      logActivity('Lowongan Dibuat', { posisi: newJob.title });
      setIsCreateJobModalOpen(false);
    } else {
      setJobListings(prev => prev.map(j => {
        if (j.id === jobFormData.id) {
          const styles = getDeptStyles(finalDept || '');
          return { 
            ...j, 
            ...jobFormData, 
            dept: finalDept,
            quota: finalQuota,
            catBg: styles.bg, 
            catText: styles.text, 
            catDot: styles.dot 
          };
        }
        return j;
      }));
      logActivity('Lowongan Diupdate', { posisi: jobFormData.title });
      setIsEditJobModalOpen(false);
    }
  };
  const uniqueDepts = useMemo(() => {
    const fromEmps = employees.map(emp => emp.dept);
    const fromJobs = jobListings.map(j => j.dept);
    return [...new Set([...fromEmps, ...fromJobs])];
  }, [employees, jobListings]);
  const uniqueStatuses = useMemo(() => [...new Set(employees.map(emp => emp.status))], [employees]);
  const deptOptions = useMemo(() => Array.from(new Set([...uniqueDepts, 'Lainnya'])), [uniqueDepts]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // Clear selection if clicking outside Kanban cards and not holding Ctrl
      const isCardClick = (e.target as HTMLElement).closest('.kanban-card');
      if (!isCardClick && !e.ctrlKey && !e.metaKey) {
        setSelectedCandidateIds([]);
      }

      if (activeCandidateDropdown !== null) {
        setActiveCandidateDropdown(null);
      }
      if (activeDropdown !== null) {
        setActiveDropdown(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [activeCandidateDropdown, activeDropdown]);

  useEffect(() => {
    if (!draggedCandidate && !draggedStageId && !draggingJobId) {
      if (autoScrollAnimationFrame.current) cancelAnimationFrame(autoScrollAnimationFrame.current);
      return;
    }
    const handleDragOverGlobal = (e: DragEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      if (customDragRef.current && draggedCandidate) {
        customDragRef.current.style.left = (e.clientX - dragOffset.current.x) + 'px';
        customDragRef.current.style.top = (e.clientY - dragOffset.current.y) + 'px';
      }
      if (customStageDragRef.current && draggedStageId) {
        customStageDragRef.current.style.left = (e.clientX - dragOffset.current.x) + 'px';
        customStageDragRef.current.style.top = (e.clientY - dragOffset.current.y) + 'px';
      }
      if (customJobDragRef.current && draggingJobId) {
        const x = e.clientX - dragOffset.current.x;
        const y = e.clientY - dragOffset.current.y;
        customJobDragRef.current.style.left = x + 'px';
        customJobDragRef.current.style.top = y + 'px';
        // Still update state for React to have fallback info on re-renders
        setDragPosition({ x, y });
      }
    };
    window.addEventListener('dragover', handleDragOverGlobal);
    const scrollStep = () => {
      if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const rect = container.getBoundingClientRect();
        const edgeThreshold = 80;
        const speed = 12;
        const { x, y } = mousePos.current;
        if (y >= 0 && y < rect.top + edgeThreshold) container.scrollTop -= speed;
        else if (y >= 0 && y > rect.bottom - edgeThreshold) container.scrollTop += speed;
        if (x >= 0 && x < rect.left + edgeThreshold) container.scrollLeft -= speed;
        else if (x >= 0 && x > rect.right - edgeThreshold) container.scrollLeft += speed;
      }
      autoScrollAnimationFrame.current = requestAnimationFrame(scrollStep);
    };
    autoScrollAnimationFrame.current = requestAnimationFrame(scrollStep);
    return () => {
      window.removeEventListener('dragover', handleDragOverGlobal);
      if (autoScrollAnimationFrame.current) cancelAnimationFrame(autoScrollAnimationFrame.current);
    };
  }, [draggedCandidate, draggedStageId, draggingJobId]);

  useEffect(() => {
    if (candidateSearchQuery.trim() && selectedJob && scrollContainerRef.current) {
      const query = candidateSearchQuery.toLowerCase();
      
      let bestMatch: Candidate | null = null;
      let bestScore = Infinity;

      candidates.forEach(c => {
        if (c.jobId !== selectedJob.id) return;
        
        const nameMatch = c.name.toLowerCase();
        const phoneMatch = c.phone || '';
        
        if (!nameMatch.includes(query) && !phoneMatch.includes(query)) return;

        let score = Infinity;
        if (nameMatch === query || phoneMatch === query) score = 1;
        else if (nameMatch.startsWith(query) || phoneMatch.startsWith(query)) score = 2;
        else score = 3;
        
        if (score < bestScore) {
          bestScore = score;
          bestMatch = c;
        } else if (score === bestScore && bestMatch) {
           if (c.name.localeCompare(bestMatch.name) < 0) {
               bestMatch = c;
           }
        }
      });

      if (bestMatch) {
         const container = scrollContainerRef.current;
         const el = container.querySelector(`[data-stage-id="${bestMatch.stage}"]`) as HTMLElement;
         if (el) {
            const scrollLeftPos = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
            container.scrollTo({ left: scrollLeftPos, behavior: 'smooth' });
         }
      }
    }
  }, [candidateSearchQuery, candidates, selectedJob]);

  const filteredJobListings = useMemo(() => {
    if (jobFilter === 'Aktif') return jobListings.filter(job => job.isActiveJob);
    if (jobFilter === 'Tidak Aktif') return jobListings.filter(job => !job.isActiveJob);
    return jobListings.filter(job => job.isActiveJob);
  }, [jobListings, jobFilter]);

  const handleJobDragStart = (e: React.DragEvent, id: number) => { 
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width };
    
    e.dataTransfer.effectAllowed = 'move'; 
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);

    setDraggingJobId(id); 
    document.body.style.cursor = 'grabbing';
  };
  const handleJobDragEnd = () => {
    setDraggingJobId(null);
    setDragOverJobId(null);
    document.body.style.cursor = '';
  };
  const handleJobDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (!draggingJobId || draggingJobId === id) return;
    
    // Improved reordering logic: swap whenever the index of the target is different
    // This allows moving back and forth between cards smoothly
    setJobListings(prev => {
      const fromIdx = prev.findIndex(j => j.id === draggingJobId);
      const toIdx = prev.findIndex(j => j.id === id);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      
      const newList = [...prev];
      const [moved] = newList.splice(fromIdx, 1);
      newList.splice(toIdx, 0, moved);
      return newList;
    });
    
    // We still keep track of hover state for visual feedback
    if (dragOverJobId !== id) {
      setDragOverJobId(id);
    }
  };

  const handleJobDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingJobId(null); 
    setDragOverJobId(null);
  };

  const displayedJobs = useMemo(() => {
    return [...filteredJobListings];
  }, [filteredJobListings]);

  const handleCopyPhone = (e: React.MouseEvent, phone: string, id: number) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  };

  const handleCopyName = (e: React.MouseEvent, name: string, id: number) => {
    e.stopPropagation();
    navigator.clipboard.writeText(name);
    setCopiedNameId(id);
    setTimeout(() => setCopiedNameId(null), 2000);
  };

  const handleUpdateCandidateTag = (e: React.MouseEvent, id: number, tag: 'DITOLAK' | 'TIDAK HADIR' | 'TIDAK RESPON' | null) => {
    e.stopPropagation();
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, tag: c.tag === tag ? null : tag } : c));
    const cand = candidates.find(c => c.id === id);
    if (cand) logActivity('Status Kandidat Diubah', { nama: cand.name, status: tag || 'Dihapus' });
    setActiveCandidateDropdown(null);
  };

  const handleCandDragStart = (e: React.DragEvent, candidate: Candidate) => {
    const isMultiDrag = selectedCandidateIds.includes(candidate.id) && selectedCandidateIds.length > 1;
    
    // If dragging a card that is not selected AND not holding ctrl, clear selection and select this one
    if (!selectedCandidateIds.includes(candidate.id) && !e.ctrlKey && !e.metaKey) {
      setSelectedCandidateIds([candidate.id]);
    } else if (e.ctrlKey || e.metaKey) {
      // If ctrl dragging, ensure it's in the list
      if (!selectedCandidateIds.includes(candidate.id)) {
        setSelectedCandidateIds(prev => [...prev, candidate.id]);
      }
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width, height: rect.height };
    setDragPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    e.dataTransfer.effectAllowed = 'move';
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
    setTimeout(() => {
        setDraggedCandidate(candidate);
        const stageCands = candidates.filter(c => c.stage === candidate.stage);
        const idx = stageCands.findIndex(c => c.id === candidate.id);
        setDropPlaceholder({ stageId: candidate.stage, index: idx, height: rect.height });
    }, 0);
  };

  const handleColumnDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (!draggedCandidate) return;
    const container = e.currentTarget as HTMLElement;
    const cards = Array.from(container.querySelectorAll('.kanban-card:not(.hidden-card)'));
    let insertIndex = cards.length;
    for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) { insertIndex = i; break; }
    }
    setDropPlaceholder(prev => (prev.stageId === stageId && prev.index === insertIndex) ? prev : { ...prev, stageId, index: insertIndex });
  };
  
  const handleCandDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    if (!draggedCandidate || !dropPlaceholder.stageId) return;
    
    const selectedIds = selectedCandidateIds.includes(draggedCandidate.id) 
      ? selectedCandidateIds 
      : [draggedCandidate.id];
      
    // Mark associated schedules as 'Hadir' if candidate is moved to a new stage
    const movingCandidatesRaw = candidates.filter(c => selectedIds.includes(c.id));
    const stageChangedCandidateIds = movingCandidatesRaw
      .filter(c => c.stage !== dropPlaceholder.stageId)
      .map(c => c.id);

    if (stageChangedCandidateIds.length > 0) {
      setSchedules(prevSchedules => prevSchedules.map(s => {
        if (s.candidateId && stageChangedCandidateIds.includes(s.candidateId) && !s.attendance) {
          return { ...s, attendance: 'Hadir' };
        }
        return s;
      }));
    }

    setCandidates(prev => {
      const movingCandidates = prev.filter(c => selectedIds.includes(c.id));
      const filtered = prev.filter(c => !selectedIds.includes(c.id));
      
      const stageCands = filtered.filter(c => c.stage === dropPlaceholder.stageId);
      const others = filtered.filter(c => c.stage !== dropPlaceholder.stageId);
      
      const movedOnes = movingCandidates.map(c => {
        const resetTag = ['Kandidat Join', 'Talent Pool'].includes(dropPlaceholder.stageId!) ? null : c.tag;
        return { ...c, stage: dropPlaceholder.stageId!, tag: resetTag };
      });
      stageCands.splice(dropPlaceholder.index!, 0, ...movedOnes);
      
      movingCandidates.forEach(c => {
        logActivity('Kandidat Dipindah Stage', { nama: c.name, stage_baru: kanbanStages.find(s => s.id === dropPlaceholder.stageId)?.label || dropPlaceholder.stageId });
      });

      return [...others, ...stageCands];
    });
    
    setDraggedCandidate(null); 
    setDropPlaceholder({ stageId: null, index: null, height: null }); 
    setDragOverStageId(null);
    setSelectedCandidateIds([]);
  };

  const handleCandDragEnd = () => {
    setDraggedCandidate(null);
    setDropPlaceholder({ stageId: null, index: null, height: null });
    setDragPosition({ x: -9999, y: -9999 });
    setDragOverStageId(null);
  };

  const handleRateCandidate = (e: React.MouseEvent, candidateId: number, rating: number) => {
    e.stopPropagation();
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, rating: c.rating === rating ? 0 : rating } : c));
  };

  const handleStageDragStart = (e: React.DragEvent, stageId: string) => {
    e.stopPropagation();
    const wrapper = (e.currentTarget as HTMLElement).closest('.stage-column') || e.currentTarget as HTMLElement;
    const rect = wrapper.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width };
    setDragPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    
    e.dataTransfer.effectAllowed = 'move';
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);

    setTimeout(() => {
       setDraggedStageId(stageId);
       const order = selectedJob ? (jobStagesMap[selectedJob.id] || kanbanStages.map(s => s.id)) : [];
       setStageDropIndex(order.indexOf(stageId));
    }, 0);
  };

  const handleStageDragEnd = () => {
    setDraggedStageId(null);
    setDragOverStageId(null);
    setStageDropIndex(null);
    setDragPosition({ x: -9999, y: -9999 });
  };

  const handleStageContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedStageId) return;
    
    const container = scrollContainerRef.current;
    if (!container) return;
    const cols = Array.from(container.querySelectorAll('.stage-column:not(.hidden-stage)')) as HTMLElement[];
    
    const ghostLeft = e.clientX - dragOffset.current.x;
    const ghostCenter = ghostLeft + (dragOffset.current.width / 2);
    
    let insertIndex = cols.length;
    for (let i = 0; i < cols.length; i++) {
        const rect = cols[i].getBoundingClientRect();
        if (ghostCenter < rect.left + rect.width / 2) {
            insertIndex = i;
            break;
        }
    }
    
    if (stageDropIndex !== insertIndex) {
        setStageDropIndex(insertIndex);
    }
  };

  const handleStageContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedStageId && selectedJob && stageDropIndex !== null) {
      setJobStagesMap(prev => {
        const order = prev[selectedJob.id] || kanbanStages.map(s => s.id);
        const newList = order.filter(id => id !== draggedStageId);
        newList.splice(stageDropIndex, 0, draggedStageId);
        return { ...prev, [selectedJob.id]: newList };
      });
      handleStageDragEnd();
    }
  };

  const handleAddCandidateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCandidateFormData.name.trim()) return;
    const finalSource = addCandidateFormData.source === 'Lainnya' ? (addCandidateFormData.customSource || 'Lainnya') : addCandidateFormData.source;
    const newCand: Candidate = {
      id: Date.now(), 
      jobId: selectedJob!.id, 
      name: addCandidateFormData.name,
      phone: addCandidateFormData.phone, 
      source: finalSource, 
      stage: addCandidateFormData.stage,
      tag: null,
      appliedDate: new Date().toISOString().split('T')[0]
    };
    setCandidates(prev => [newCand, ...prev]);
    logActivity('Kandidat Ditambahkan', { nama: newCand.name, posisi: jobListings.find(j => j.id === newCand.jobId)?.title || 'Unknown' });
    setAddCandidateFormData({ name: '', phone: '', source: 'Glints', customSource: '', stage: '' });
    setActiveAddFormStage(null);
  };

  if (view === 'detail' && selectedJob) {
    const jobStagesOrder = jobStagesMap[selectedJob.id] || kanbanStages.map(s => s.id);
    return (
      <div className="flex flex-col h-full animate-fadeIn min-h-0">
        <div className="flex justify-between items-center mb-8 px-1">
          <div className="flex items-center gap-4">
             <button onClick={() => { setView('list'); setSelectedJob(null); }} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors group">
               <Icon name="chevron-left" size={24} className="group-hover:text-primary transition-colors" />
             </button>
             <h1 className="text-2xl font-black text-slate-800 tracking-tight">{selectedJob.title}</h1>
          </div>
          <div className="relative w-80">
            <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari nama atau telepon..." 
              value={candidateSearchQuery} 
              onChange={(e) => setCandidateSearchQuery(e.target.value)} 
              className="w-full pl-12 pr-5 py-3 bg-white border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all outline-none" 
            />
          </div>
        </div>

        <div ref={scrollContainerRef} className="flex gap-4 overflow-x-auto hover-scrollbar flex-1 min-h-0 pb-8 px-1 items-stretch" onDragOver={handleStageContainerDragOver} onDrop={handleStageContainerDrop}>
          {(() => {
            const remainingStages = jobStagesOrder.filter(id => id !== draggedStageId);
            let stageItems: { type: 'stage' | 'placeholder', id: string }[] = remainingStages.map(id => ({ type: 'stage', id }));
            
            if (draggedStageId && stageDropIndex !== null) {
                stageItems.splice(stageDropIndex, 0, { type: 'placeholder', id: 'stage-placeholder' });
                stageItems.push({ type: 'stage', id: draggedStageId });
            } else if (!draggedStageId) {
                stageItems = jobStagesOrder.map(id => ({ type: 'stage', id }));
            }

            return stageItems.map((item, idx) => {
              if (item.type === 'placeholder') {
                 return <div key={`placeholder-${idx}`} className="w-[260px] shrink-0 self-stretch min-h-[500px] bg-slate-100/80 rounded-[20px] border border-transparent"></div>;
              }

              const stageId = item.id;
              const stage = kanbanStages.find(s => s.id === stageId)!;
              let stageCands = candidates.filter(c => c.jobId === selectedJob.id && c.stage === stageId && (c.name.toLowerCase().includes(candidateSearchQuery.toLowerCase()) || (c.phone?.includes(candidateSearchQuery))));
              
              if (candidateSearchQuery.trim()) {
                  const query = candidateSearchQuery.toLowerCase();
                  stageCands.sort((a, b) => {
                      const getScore = (c: Candidate) => {
                          const nameStr = c.name.toLowerCase();
                          const phoneStr = c.phone || '';
                          if (nameStr === query || phoneStr === query) return 1;
                          if (nameStr.startsWith(query) || phoneStr.startsWith(query)) return 2;
                          return 3;
                      };
                      const scoreA = getScore(a);
                      const scoreB = getScore(b);
                      if (scoreA !== scoreB) return scoreA - scoreB;
                      return a.name.localeCompare(b.name);
                  });
              }

              const movingIds = draggedCandidate 
                ? (selectedCandidateIds.includes(draggedCandidate.id) ? selectedCandidateIds : [draggedCandidate.id])
                : [];
              const visibleStageCands = stageCands.filter(c => !movingIds.includes(c.id));
              const hiddenStageCands = stageCands.filter(c => movingIds.includes(c.id));

              let renderList: any[] = [...visibleStageCands];
              
              if (draggedCandidate && dropPlaceholder.stageId === stageId) {
                 renderList.splice(dropPlaceholder.index!, 0, { isPlaceholder: true });
              }
              
              const finalRenderList = [...renderList, ...hiddenStageCands.map(c => ({ ...c, isHiddenDragSource: true }))];
              const isEmpty = visibleStageCands.length === 0 && activeAddFormStage !== stageId;
              const isDraggedStage = draggedStageId === stageId;

              return (
                <div 
                  key={stageId} 
                  data-stage-id={stageId}
                  className={isDraggedStage ? 'opacity-0 w-0 h-0 m-0 p-0 overflow-hidden pointer-events-none border-0 hidden-stage' : `w-[260px] shrink-0 flex flex-col min-h-full rounded-[20px] stage-column`}
                  onDragOver={(e) => handleColumnDragOver(e, stageId)}
                  onDrop={(e) => handleCandDrop(e, stageId)}
                >
                  <div draggable onDragStart={(e) => handleStageDragStart(e, stageId)} onDragEnd={handleStageDragEnd} className={`sticky top-0 z-10 px-4 py-3 rounded-[15px] mb-4 flex justify-between items-center shadow-sm border cursor-grab active:cursor-grabbing ${stage.color}`}>
                    <h4 className="font-black text-[10px] uppercase tracking-widest leading-none">{stage.label}</h4>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setActiveAddFormStage(stageId); setAddCandidateFormData({ name: '', phone: '', source: 'Glints', customSource: '', stage: stageId }); }} className="hover:bg-black/5 p-1 rounded-lg transition-colors">
                        <Icon name="plus" size={13} />
                      </button>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm ${stage.badgeColor}`}>{stageCands.length}</span>
                    </div>
                  </div>

                <div className="flex flex-col gap-3 flex-1 pb-4">
                  {activeAddFormStage === stageId && (
                    <div className="p-4 border-2 border-primary/50 shadow-xl animate-scaleIn bg-white rounded-xl mb-4 relative z-20">
                      <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-1">
                          Nama Pelamar <span className="text-red-500">*</span>
                        </label>
                        <input 
                          type="text" 
                          autoFocus 
                          placeholder="Ketik nama pelamar..." 
                          value={addCandidateFormData.name} 
                          onChange={(e) => setAddCandidateFormData(p => ({...p, name: e.target.value}))} 
                          className="w-full text-sm font-semibold text-slate-700 bg-transparent border-b border-primary pb-1 focus:outline-none placeholder:text-slate-300" 
                        />
                      </div>
                      
                      <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-1">
                          No. Telepon
                        </label>
                        <input 
                          type="text" 
                          placeholder="08..." 
                          value={addCandidateFormData.phone} 
                          onChange={(e) => setAddCandidateFormData(p => ({...p, phone: e.target.value}))} 
                          className="w-full text-sm font-semibold text-slate-700 bg-transparent border-b border-slate-200 pb-1 focus:border-primary focus:outline-none transition-colors placeholder:text-slate-300" 
                        />
                      </div>

                      <div className="mb-6">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-2">
                          Sumber
                        </label>
                        <div className="relative">
                          <select 
                            value={addCandidateFormData.source} 
                            onChange={(e) => setAddCandidateFormData(p => ({...p, source: e.target.value as Candidate['source']}))} 
                            className="w-full text-sm font-bold text-slate-700 bg-transparent border border-slate-200 rounded-lg py-2 px-3 appearance-none focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors cursor-pointer"
                          >
                            <option value="Glints">Glints</option>
                            <option value="Pintarnya">Pintarnya</option>
                            <option value="Indeed">Indeed</option>
                            <option value="Jobstreet">Jobstreet</option>
                            <option value="Linkedin">Linkedin</option>
                            <option value="GForm">GForm</option>
                            <option value="Internal">Internal</option>
                            <option value="Lainnya">Lainnya</option>
                          </select>
                          <Icon name="chevron-down" size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        {addCandidateFormData.source === 'Lainnya' && (
                          <div className="mt-3">
                            <input 
                              type="text" 
                              placeholder="Ketik sumber..." 
                              value={addCandidateFormData.customSource} 
                              onChange={(e) => setAddCandidateFormData(p => ({...p, customSource: e.target.value}))} 
                              className="w-full text-sm font-semibold text-slate-700 bg-transparent border-b border-slate-200 pb-1 focus:border-primary focus:outline-none transition-colors placeholder:text-slate-300" 
                            />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                        <button onClick={() => setActiveAddFormStage(null)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                          <Icon name="trash-2" size={16} />
                        </button>
                        <button onClick={handleAddCandidateSubmit} className="bg-indigo-400 hover:bg-indigo-500 text-white text-sm font-bold px-6 py-2 rounded-lg shadow-md transition-all flex items-center gap-2">
                          <Icon name="check" size={16} /> Tambah
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {finalRenderList.map((c, i) => {
                    if (c.isPlaceholder) {
                      return <div key={`placeholder-${i}`} className="bg-slate-100/80 rounded-xl border border-transparent transition-all duration-200" style={{ height: dropPlaceholder.height || 96 }}></div>;
                    }
                    if (c.isHiddenDragSource) {
                      return <div key={c.id} className="hidden kanban-card hidden-card"></div>;
                    }
                    const isSelected = selectedCandidateIds.includes(c.id);
                    
                    const activeSchedule = schedules.find(s => s.candidateId === c.id && s.attendance !== 'Hadir');
                    
                    return (
                      <div 
                        key={c.id} 
                        draggable 
                        onDragStart={(e) => handleCandDragStart(e, c)} 
                        onDragEnd={handleCandDragEnd} 
                        onClick={(e) => {
                          if (e.ctrlKey || e.metaKey) {
                            setSelectedCandidateIds(prev => 
                              prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                            );
                          }
                        }}
                        className={`kanban-card bg-white rounded-xl p-3 shadow-sm border-2 group cursor-grab relative transition-all duration-200 active:scale-95 active:cursor-grabbing ${isSelected ? 'border-primary ring-4 ring-primary/10 shadow-md translate-x-1' : 'border-slate-100 hover:border-primary/20 hover:shadow-md'} ${activeCandidateDropdown === c.id ? 'z-50' : 'z-10'}`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            {c.stage === 'Kandidat Join' ? (
                              <span className="inline-block px-1.5 py-0.5 rounded-md border border-emerald-300 bg-emerald-50/50 text-[8px] font-black uppercase tracking-widest text-emerald-500 mb-1">
                                DITERIMA
                              </span>
                            ) : c.tag === 'DITOLAK' ? (
                              <span className="inline-block px-1.5 py-0.5 rounded-md border border-red-200 bg-red-50 text-[8px] font-black uppercase tracking-widest text-red-500 mb-1">
                                DITOLAK
                              </span>
                            ) : c.tag === 'TIDAK HADIR' || activeSchedule?.attendance === 'Tidak Hadir' ? (
                              <span className="inline-block px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">
                                TIDAK HADIR
                              </span>
                            ) : c.tag === 'TIDAK RESPON' ? (
                              <span className="inline-block px-1.5 py-0.5 rounded-md border border-orange-200 bg-orange-50 text-[8px] font-black uppercase tracking-widest text-orange-500 mb-1">
                                TIDAK RESPON
                              </span>
                            ) : activeSchedule ? (
                              <span className="inline-block px-1.5 py-0.5 rounded-md border border-indigo-200 bg-indigo-50/70 text-[8px] font-black uppercase tracking-widest text-indigo-600 mb-1">
                                SCHEDULE {activeSchedule.title.split(' - ')[0]?.toUpperCase()}
                              </span>
                            ) : null}
                            <div 
                              className="font-extrabold text-[13px] text-slate-800 leading-tight transition-colors flex items-center justify-between cursor-pointer group/name"
                              onClick={(e) => handleCopyName(e, c.name, c.id)}
                            >
                              <span className={`transition-colors ${copiedNameId === c.id ? 'text-green-600' : 'group-hover:text-primary'}`}>
                                {copiedNameId === c.id ? 'Disalin!' : c.name}
                              </span>
                              {!copiedNameId || copiedNameId !== c.id ? (
                                <div className="opacity-0 group-hover/name:opacity-100 transition-opacity">
                                  <Icon name="copy" size={12} className="text-slate-400 group-hover:text-primary" />
                                </div>
                              ) : (
                                <Icon name="check" size={12} className="text-green-500" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1 mb-2.5">{selectedJob.title}</p>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={(e) => handleRateCandidate(e, c.id, star)}
                                  className="focus:outline-none hover:scale-125 transition-transform"
                                  title={`Rating ${star}`}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill={star <= (c.rating || 0) ? "#FBBF24" : "none"} stroke={star <= (c.rating || 0) ? "#FBBF24" : "#CBD5E1"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                  </svg>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="relative">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setActiveCandidateDropdown(activeCandidateDropdown === c.id ? null : c.id); }}
                              className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
                            >
                              <Icon name="more-horizontal" size={18} />
                            </button>
                            {activeCandidateDropdown === c.id && (
                              <div 
                                className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[20px] py-1.5 z-20 animate-fadeIn"
                                onClick={(e) => e.stopPropagation()}
                              >
                                  <button type="button" onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setEditCandidateFormData({ ...c }); 
                                      setIsEditCandidateModalOpen(true); 
                                      setActiveCandidateDropdown(null); 
                                    }} className="w-full text-left px-4 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                    <Icon name="edit" size={15} className="text-slate-600" /> Ubah Data
                                  </button>
                                  <button type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedCandidateForSchedule(c);
                                      setScheduleFormData({
                                        title: `${c.stage} - ${c.name}`,
                                        type: 'Interview Online',
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
                                        candidateId: c.id,
                                        candidateName: c.name
                                      });
                                      setIsScheduleModalOpen(true);
                                      setActiveCandidateDropdown(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                                  >
                                    <Icon name="calendar" size={15} className="text-slate-600" /> Atur Jadwal
                                  </button>
                                  <button type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDocumentUploadTarget(c);
                                      setIsUploadDocumentModalOpen(true);
                                      setActiveCandidateDropdown(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                                  >
                                    <Icon name="file" size={15} className="text-slate-600" /> Upload Dokumen
                                  </button>
                                  
                                  {c.stage !== 'Kandidat Join' && (
                                    <>
                                      <div className="px-4 py-1.5 mt-1">
                                        <span className="text-[10px] font-extrabold text-slate-400/80 uppercase tracking-widest">Tandai Status</span>
                                      </div>
                                      <button type="button" onClick={(e) => handleUpdateCandidateTag(e, c.id, 'DITOLAK')} className={`w-full text-left px-4 py-2 text-[12px] font-bold transition-colors flex items-center gap-3 ${c.tag === 'DITOLAK' ? 'bg-red-50 text-red-600' : 'text-slate-700 hover:bg-slate-50'}`}>
                                        <Icon name="x-circle" size={15} className={c.tag === 'DITOLAK' ? 'text-red-500' : 'text-slate-600'} /> Ditolak
                                      </button>
                                      <button type="button" onClick={(e) => handleUpdateCandidateTag(e, c.id, 'TIDAK HADIR')} className={`w-full text-left px-4 py-2 text-[12px] font-bold transition-colors flex items-center gap-3 ${c.tag === 'TIDAK HADIR' ? 'bg-slate-100 text-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                                        <Icon name="user-x" size={15} className={c.tag === 'TIDAK HADIR' ? 'text-slate-600' : 'text-slate-600'} /> Tidak Hadir
                                      </button>
                                      <button type="button" onClick={(e) => handleUpdateCandidateTag(e, c.id, 'TIDAK RESPON')} className={`w-full text-left px-4 py-2 text-[12px] font-bold transition-colors flex items-center gap-3 mb-1 ${c.tag === 'TIDAK RESPON' ? 'bg-orange-50 text-orange-600' : 'text-slate-700 hover:bg-slate-50'}`}>
                                        <Icon name="message-square" size={15} className={c.tag === 'TIDAK RESPON' ? 'text-orange-500' : 'text-slate-600'} /> Tidak Respon
                                      </button>
                                      
                                      {(c.tag || activeSchedule) && (
                                        <>
                                          <div className="border-t border-slate-50 my-1"></div>
                                          <button type="button" onClick={(e) => {
                                            handleUpdateCandidateTag(e, c.id, null);
                                            if (activeSchedule) {
                                              setSchedules(prev => prev.filter(s => s.id !== activeSchedule.id));
                                            }
                                          }} className="w-full text-left px-4 py-2 text-[12px] font-bold text-slate-500 hover:bg-slate-50 flex items-center gap-3 transition-colors mb-1">
                                            <Icon name="rotate-ccw" size={15} className="text-slate-400" /> Hapus Status
                                          </button>
                                        </>
                                      )}
                                    </>
                                  )}

                                  <div className="border-t border-slate-50 my-1"></div>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setCandidateToDelete(c.id); setActiveCandidateDropdown(null); }} className="w-full text-left px-4 py-2.5 text-[12px] font-bold text-red-500 hover:bg-red-50 flex items-center gap-3 transition-colors rounded-b-[20px]">
                                    <Icon name="trash-2" size={15} /> Hapus Data
                                  </button>
                                </div>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          <div className="flex items-center gap-3">
                            <div 
                              className="flex items-center gap-2 cursor-pointer hover:text-primary group/phone" 
                              onClick={(e) => handleCopyPhone(e, c.phone || '', c.id)}
                            >
                              <span className={`text-[11px] ${copiedPhoneId === c.id ? 'text-green-600 font-bold' : 'text-slate-600 font-medium'}`}>
                                {copiedPhoneId === c.id ? 'Tersalin' : (c.phone || '-')}
                              </span>
                              <Icon name={copiedPhoneId === c.id ? "check" : "copy"} size={12} className={copiedPhoneId === c.id ? "text-green-500" : "text-slate-400 group-hover/phone:text-primary"} />
                            </div>
                            {c.documents && c.documents.length > 0 && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setDocumentUploadTarget(c); setIsUploadDocumentModalOpen(true); }}
                                className="flex items-center justify-center p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-blue-500 transition-colors"
                                title="Lihat/Upload Dokumen"
                              >
                                <Icon name="paperclip" size={14} />
                                <span className="ml-1 text-[10px] font-bold">{c.documents.length}</span>
                              </button>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded-lg border text-[8px] font-black uppercase tracking-wider ${getSourceBadgeClass(c.source)}`}>
                            {c.source === 'Lainnya' && c.customSource ? c.customSource : c.source}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {isEmpty && (
                    <div className="h-20 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center bg-transparent">
                       <span className="text-[12px] font-medium text-slate-400">Kosong</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })})()}
        </div>
        {draggedCandidate && (
          <div ref={customDragRef} className="fixed pointer-events-none z-[9999] kanban-card bg-white rounded-xl p-3 shadow-2xl border-2 border-primary flex flex-col" style={{ width: dragOffset.current.width, left: dragPosition.x, top: dragPosition.y, transform: 'rotate(2deg) scale(1.02)' }}>
            {selectedCandidateIds.length > 1 && (
              <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-black text-xs shadow-lg border-2 border-white z-50">
                {selectedCandidateIds.length}
              </div>
            )}
            <div className="flex justify-between items-start mb-3">
              <div>
                {(() => {
                  const activeSchedule = schedules.find(s => s.candidateId === draggedCandidate.id && s.attendance !== 'Hadir');
                  if (draggedCandidate.stage === 'Kandidat Join') {
                    return (
                      <span className="inline-block px-1.5 py-0.5 rounded-md border border-emerald-300 bg-emerald-50/50 text-[8px] font-black uppercase tracking-widest text-emerald-500 mb-1">
                        DITERIMA
                      </span>
                    );
                  } else if (draggedCandidate.tag === 'DITOLAK') {
                    return (
                      <span className="inline-block px-1.5 py-0.5 rounded-md border border-red-200 bg-red-50 text-[8px] font-black uppercase tracking-widest text-red-500 mb-1">
                        DITOLAK
                      </span>
                    );
                  } else if (draggedCandidate.tag === 'TIDAK HADIR' || activeSchedule?.attendance === 'Tidak Hadir') {
                    return (
                      <span className="inline-block px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">
                        TIDAK HADIR
                      </span>
                    );
                  } else if (draggedCandidate.tag === 'TIDAK RESPON') {
                    return (
                      <span className="inline-block px-1.5 py-0.5 rounded-md border border-orange-200 bg-orange-50 text-[8px] font-black uppercase tracking-widest text-orange-500 mb-1">
                        TIDAK RESPON
                      </span>
                    );
                  } else if (activeSchedule) {
                    return (
                      <span className="inline-block px-1.5 py-0.5 rounded-md border border-indigo-200 bg-indigo-50/70 text-[8px] font-black uppercase tracking-widest text-indigo-600 mb-1">
                        SCHEDULE {activeSchedule.title.split(' - ')[0]?.toUpperCase()}
                      </span>
                    );
                  }
                  return null;
                })()}
                <p className="font-extrabold text-[13px] text-slate-800 leading-tight">{draggedCandidate.name}</p>
                <p className="text-[11px] text-slate-500 mt-1 uppercase tracking-tight font-bold opacity-70">{selectedJob.title}</p>
              </div>
              <div className="relative">
                <button className="text-slate-400 p-1 rounded-md">
                  <Icon name="more-horizontal" size={16} />
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center mt-3">
              <div className="flex items-center gap-2 cursor-pointer">
                <span className="text-[11px] text-slate-600 font-medium">{draggedCandidate.phone || '-'}</span>
                <Icon name="copy" size={12} className="text-slate-400" />
              </div>
              <span className={`px-2 py-0.5 rounded-lg border text-[8px] font-black uppercase tracking-wider ${getSourceBadgeClass(draggedCandidate.source)}`}>
                {draggedCandidate.source === 'Lainnya' && draggedCandidate.customSource ? draggedCandidate.customSource : draggedCandidate.source}
              </span>
            </div>
          </div>
        )}
        
        {draggedStageId && (
          <div ref={customStageDragRef} className="fixed pointer-events-none z-[9999] opacity-90" style={{ width: dragOffset.current.width, left: dragPosition.x, top: dragPosition.y, transform: 'rotate(2deg) scale(1.02)' }}>
            {(() => {
              const stage = kanbanStages.find(s => s.id === draggedStageId);
              if (!stage) return null;
              return (
                 <div className={`px-5 py-4 rounded-[18px] mb-6 flex justify-between items-center shadow-2xl border bg-opacity-100 backdrop-blur-md ${stage.color}`}>
                    <h4 className="font-black text-[11px] uppercase tracking-widest leading-none">{stage.label}</h4>
                 </div>
              );
            })()}
          </div>
        )}

        {draggingJobId && (
          <div 
            ref={customJobDragRef}
            className="fixed pointer-events-none z-[100000] origin-center p-8" 
            style={{ 
              width: dragOffset.current.width + 64, // Add padding space
              left: dragPosition.x - 32,
              top: dragPosition.y - 32,
              transform: 'rotate(1deg) scale(0.7)' 
            }}
          >
            {(() => {
              const job = jobListings.find(j => j.id === draggingJobId);
              if (!job) return null;
              
              const jobCandidates = candidates.filter(c => c.jobId === job.id);
              const activeStages = (jobStagesMap[job.id] || kanbanStages.map(s => s.id)).filter(id => id !== 'Talent Pool');
              const joined = jobCandidates.filter(c => c.stage === 'Kandidat Join' && c.tag !== 'DITOLAK' && c.tag !== 'TIDAK HADIR' && c.tag !== 'TIDAK RESPON').length;
              
              const candidateWeights = jobCandidates.map(c => {
                if (c.stage === 'Talent Pool' || c.tag === 'DITOLAK' || c.tag === 'TIDAK HADIR' || c.tag === 'TIDAK RESPON') return 0;
                const idx = activeStages.indexOf(c.stage);
                if (idx !== -1) {
                   return activeStages.length > 1 ? (idx / (activeStages.length - 1)) : 1;
                }
                return 0;
              }).sort((a, b) => b - a);
              
              const topWeightsSum = candidateWeights.slice(0, job.quota > 0 ? job.quota : 1).reduce((sum, w) => sum + w, 0);
              const pct = job.quota > 0 ? Math.min(100, Math.round((topWeightsSum / job.quota) * 100)) : 0;
              const progCount = jobCandidates.filter(c => c.stage !== activeStages[0] && c.stage !== activeStages[activeStages.length - 1] && c.stage !== 'Talent Pool' && c.tag !== 'DITOLAK' && c.tag !== 'TIDAK HADIR' && c.tag !== 'TIDAK RESPON').length;

              return (
                <div className="bg-white rounded-[20px] p-5 border-2 border-primary/10 flex flex-col w-full shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-black/5 backdrop-blur-sm">
                   <div className="flex justify-between items-start mb-4">
                     <h3 className="font-bold text-[16px] text-slate-800 tracking-tight leading-tight">{job.title}</h3>
                     <Icon name="more-horizontal" size={18} className="text-slate-300" />
                   </div>
                   <div className="flex gap-4 mb-4">
                     <div className="flex items-center gap-2">
                       <span className="text-[24px] font-medium text-slate-800 tracking-tight">{jobCandidates.length}</span>
                       <span className="text-xs font-medium text-slate-400">Candidate</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <span className="text-[24px] font-medium text-indigo-600 tracking-tight">{progCount}</span>
                       <span className="text-xs font-medium text-indigo-400 whitespace-nowrap">In Process</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <div className="flex items-end">
                         <span className="text-[24px] font-medium text-slate-800 tracking-tight">{joined}</span>
                         <span className="text-[11px] font-medium text-slate-400 mb-1 ml-0.5">/{job.quota}</span>
                       </div>
                       <span className="text-xs font-medium text-slate-400">Join</span>
                     </div>
                   </div>
                   <div className="h-[1px] w-full bg-slate-100 mb-4"></div>
                   <div className="flex justify-between items-end opacity-60">
                     <div className="flex items-center gap-3">
                       <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${job.catBg} ${job.catText}`}>
                         <div className={`w-1.5 h-1.5 rounded-full ${job.catDot}`}></div>
                         <span className="text-[10px] font-bold">{job.dept}</span>
                       </div>
                     </div>
                     <div className="flex flex-col items-end gap-1.5 w-24">
                       <span className="text-[10px] font-black text-slate-400">{pct}%</span>
                       <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                         <div className="h-full bg-slate-200" style={{ width: `${pct}%` }}></div>
                       </div>
                     </div>
                   </div>
                </div>
              );
            })()}
          </div>
        )}

        {isUploadDocumentModalOpen && documentUploadTarget && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4 animate-fadeIn">
            <div className="w-full max-w-lg bg-white rounded-[24px] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-scaleIn">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100/50 rounded-full flex items-center justify-center text-blue-600">
                    <Icon name="file-text" size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-slate-800 tracking-tight">Dokumen Kandidat</h3>
                    <p className="text-sm font-bold text-slate-400">{documentUploadTarget.name}</p>
                  </div>
                </div>
                <button onClick={() => { setIsUploadDocumentModalOpen(false); setDocumentUploadTarget(null); }} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-xl transition-all">
                  <Icon name="x" size={20} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[60vh] flex flex-col gap-6">
                <div>
                  <h4 className="text-[13px] font-black text-slate-800 uppercase tracking-wider mb-4">Daftar Dokumen</h4>
                  {(!documentUploadTarget.documents || documentUploadTarget.documents.length === 0) ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
                        <Icon name="file" size={24} />
                      </div>
                      <p className="text-[13px] font-bold text-slate-500 text-center">Belum ada dokumen</p>
                      <p className="text-[11.5px] text-slate-400 mt-1 text-center max-w-[250px]">Silakan upload CV, Ijazah, atau dokumen pendukung lainnya di bawah.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {documentUploadTarget.documents.map((doc, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white shadow-sm group hover:border-blue-200 transition-colors">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                              <Icon name={doc.name.toLowerCase().endsWith('.pdf') ? 'file-text' : 'image'} size={20} />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[13px] font-bold text-slate-700 truncate block">{doc.name}</span>
                              <span className="text-[11px] font-bold text-slate-400">{doc.size ? `${(doc.size / 1024 / 1024).toFixed(1)} MB` : 'Dokumen'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                              title="Download Dokumen"
                              onClick={async () => {
                                setIsDownloadingDoc(doc.url);
                                try {
                                  let downloadUrl = doc.url;
                                  if (doc.url && doc.url.startsWith('DB_STORED:')) {
                                    const docId = doc.url.split(':')[1];
                                    const docSnap = await getDoc(doc(db, 'fileContents', docId));
                                    const data = docSnap.data() as any;
                                    if (docSnap.exists() && data?.base64) {
                                      downloadUrl = data.base64;
                                    }
                                  }

                                  if (downloadUrl) {
                                    const { downloadFile } = await import('../utils');
                                    await downloadFile(downloadUrl, doc.name);
                                  } else {
                                    alert('File tidak ditemukan.');
                                  }
                                } catch (err) {
                                  console.error("Download fail", err);
                                  alert('Gagal mengunduh file.');
                                } finally {
                                  setIsDownloadingDoc(null);
                                }
                              }}
                            >
                              {isDownloadingDoc === doc.url ? (
                                <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <Icon name="download" size={14} />
                              )}
                            </button>
                            <button 
                              className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                              title="Hapus Dokumen"
                              onClick={() => {
                                const newDocs = [...(documentUploadTarget.documents || [])];
                                newDocs.splice(idx, 1);
                                const updated = { ...documentUploadTarget, documents: newDocs };
                                setDocumentUploadTarget(updated);
                                setCandidates(prev => prev.map(c => c.id === updated.id ? updated : c));
                              }}
                            >
                              <Icon name="trash-2" size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <h4 className="text-[13px] font-black text-slate-800 uppercase tracking-wider mb-4">Tambahkan Dokumen Baru</h4>
                  <div className="relative">
                    <input 
                      type="file" 
                      id="candidate-document-upload" 
                      className="hidden"
                      onChange={async (e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          const file = e.target.files[0];
                          if (file.size > 3 * 1024 * 1024) {
                            alert('Ukuran file maksimal adalah 3MB.');
                            e.target.value = '';
                            return;
                          }
                          
                      setIsUploadingDoc(true);
                      try {
                        const { uploadFileToFirestore } = await import('../firebase');
                        const downloadUrl = await uploadFileToFirestore(file);
                        
                        const name = file.name;
                        const size = file.size;
                        const url = downloadUrl;
                        
                        const newDocs = [...(documentUploadTarget.documents || []), { name, url, size }];
                        const updated = { ...documentUploadTarget, documents: newDocs };
                        setDocumentUploadTarget(updated);
                        setCandidates(prev => prev.map(c => c.id === updated.id ? updated : c));
                      } catch (error) {
                        console.error("Upload error", error);
                        alert(error instanceof Error ? error.message : 'Gagal mengunggah file ke cloud storage.');
                      } finally {
                        setIsUploadingDoc(false);
                        e.target.value = '';
                      }
                    }
                  }}
                />
                <label 
                  htmlFor="candidate-document-upload"
                  className={`flex flex-col items-center justify-center w-full py-6 border-2 border-dashed border-blue-200 bg-blue-50/30 rounded-2xl cursor-pointer hover:bg-blue-50/80 transition-colors group ${isUploadingDoc ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <div className="w-10 h-10 bg-white border border-blue-100 rounded-full flex items-center justify-center mb-2 shadow-sm group-hover:scale-110 transition-transform">
                    {isUploadingDoc ? (
                       <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                       <Icon name="upload-cloud" size={20} className="text-blue-500" />
                    )}
                  </div>
                  <span className="text-sm font-bold text-blue-700">{isUploadingDoc ? 'Sedang Mengunggah...' : 'Pilih File untuk Diupload'}</span>
                  <span className="text-[11px] font-semibold text-blue-500/70 mt-1">Maks. 3MB (PDF/JPG/PNG)</span>
                </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isEditCandidateModalOpen && editCandidateFormData && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px] p-4 animate-fadeIn">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col overflow-hidden">
              <div className="flex justify-between items-center p-5 border-b border-slate-100">
                <h3 className="font-bold text-lg text-slate-800">Ubah Data Kandidat</h3>
                <button onClick={() => setIsEditCandidateModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <Icon name="x" size={20} />
                </button>
              </div>
              
              <div className="p-5 overflow-y-auto max-h-[70vh]">
                <form 
                  id="edit-candidate-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setCandidates(prev => prev.map(c => c.id === editCandidateFormData.id ? editCandidateFormData : c));
                    logActivity('Kandidat Diupdate', { nama: editCandidateFormData.name });
                    setIsEditCandidateModalOpen(false);
                    setEditCandidateFormData(null);
                  }}
                  className="space-y-5"
                >
                  <div>
                    <label className="text-[12px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-2">
                      Nama Lengkap <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      required
                      placeholder="Masukkan nama lengkap" 
                      value={editCandidateFormData.name} 
                      onChange={(e) => setEditCandidateFormData({...editCandidateFormData, name: e.target.value})} 
                      className="w-full text-sm font-semibold text-slate-700 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-primary/30 focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-300" 
                    />
                  </div>

                  <div>
                    <label className="text-[12px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-2">
                      Nomor Telepon
                    </label>
                    <input 
                      type="text" 
                      placeholder="08..." 
                      value={editCandidateFormData.phone || ''} 
                      onChange={(e) => setEditCandidateFormData({...editCandidateFormData, phone: e.target.value})} 
                      className="w-full text-sm font-semibold text-slate-700 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-primary/30 focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-300" 
                    />
                  </div>

                  <div>
                    <label className="text-[12px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-2">
                      Sumber Lamaran
                    </label>
                    <div className="relative">
                      <select 
                        value={editCandidateFormData.source === 'Lainnya' && !['Glints','Pintarnya','Indeed','Jobstreet','Linkedin','GForm','Internal'].includes(editCandidateFormData.source) && kanbanStages.length ? 'Lainnya' : editCandidateFormData.source} 
                        onChange={(e) => {
                           const val = e.target.value;
                           if (val !== 'Lainnya') {
                               setEditCandidateFormData({...editCandidateFormData, source: val as any, customSource: ''});
                           } else {
                               setEditCandidateFormData({...editCandidateFormData, source: 'Lainnya'});
                           }
                        }} 
                        className="w-full text-sm font-bold text-slate-700 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-primary/30 focus:ring-4 focus:ring-primary/10 outline-none transition-all cursor-pointer appearance-none bg-white"
                      >
                        <option value="Glints">Glints</option>
                        <option value="Pintarnya">Pintarnya</option>
                        <option value="Indeed">Indeed</option>
                        <option value="Jobstreet">Jobstreet</option>
                        <option value="Linkedin">Linkedin</option>
                        <option value="GForm">GForm</option>
                        <option value="Internal">Internal</option>
                        <option value="Lainnya">Lainnya</option>
                      </select>
                      <Icon name="chevron-down" size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    {editCandidateFormData.source === 'Lainnya' && (
                      <div className="mt-3">
                        <input 
                          type="text" 
                          placeholder="Ketik sumber..." 
                          value={editCandidateFormData.customSource || ''} 
                          onChange={(e) => setEditCandidateFormData({...editCandidateFormData, customSource: e.target.value})} 
                          className="w-full text-sm font-semibold text-slate-700 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-primary/30 focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-300" 
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-[12px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-2">
                      Tahapan Saat Ini
                    </label>
                    <div className="relative">
                      <select 
                        value={editCandidateFormData.stage} 
                        onChange={(e) => setEditCandidateFormData({...editCandidateFormData, stage: e.target.value})} 
                        className="w-full text-sm font-bold text-slate-700 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-primary/30 focus:ring-4 focus:ring-primary/10 outline-none transition-all cursor-pointer appearance-none bg-white"
                      >
                        {kanbanStages.map(stage => (
                           <option key={stage.id} value={stage.id}>{stage.label}</option>
                        ))}
                      </select>
                      <Icon name="chevron-down" size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsEditCandidateModalOpen(false)} 
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-200 transition-colors bg-slate-200/50"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  form="edit-candidate-form"
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-primary hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </div>
        )}

        {isScheduleModalOpen && (
          <>
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2000] animate-fadeIn" onClick={() => setIsScheduleModalOpen(false)}></div>
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-lg bg-white rounded-3xl shadow-2xl p-6 lg:p-8 z-[2000] animate-slideUp overflow-y-auto max-h-[90vh] hover-scrollbar">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-extrabold text-xl text-slate-900">Add Schedule Target</h3>
                <button type="button" onClick={() => setIsScheduleModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-xl transition-colors">
                  <Icon name={"x" as any} size={20} />
                </button>
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const newSchedule: Schedule = {
                    ...scheduleFormData as Schedule,
                    id: Date.now(),
                  };
                  setSchedules(prev => [...prev, newSchedule]);
                  setIsScheduleModalOpen(false);
                }} 
                className="space-y-4 text-left"
              >
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Judul Schedule</label>
                  <input 
                    type="text" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={scheduleFormData.title} onChange={e => setScheduleFormData({...scheduleFormData, title: e.target.value})}
                    placeholder="Misal: Psikotes Calon Designer"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Tanggal</label>
                    <input 
                      type="date" required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                      value={scheduleFormData.date} onChange={e => setScheduleFormData({...scheduleFormData, date: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Tipe</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                      value={scheduleFormData.type} onChange={e => setScheduleFormData({...scheduleFormData, type: e.target.value as any})}
                    >
                      <option value="Interview Online">Interview Online</option>
                      <option value="Interview Offline">Interview Offline</option>
                    </select>
                  </div>
                </div>

                {scheduleFormData.type === 'Interview Online' && (
                  <div className="animate-fadeIn">
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Link Interview Online</label>
                    <input 
                      type="url" required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                      value={scheduleFormData.link || ''} onChange={e => setScheduleFormData({...scheduleFormData, link: e.target.value})}
                      placeholder="Contoh: https://meet.google.com/..."
                    />
                  </div>
                )}

                {scheduleFormData.type === 'Interview Offline' && (
                  <div className="animate-fadeIn">
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Lokasi / Ruangan</label>
                    <input 
                      type="text" required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                      value={scheduleFormData.location || ''} onChange={e => setScheduleFormData({...scheduleFormData, location: e.target.value})}
                      placeholder="Contoh: Gedung A, Ruang Meeting 3"
                    />
                  </div>
                )}

                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Interviewer / PIC</label>
                  <input 
                    type="text" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={scheduleFormData.interviewer || ''} onChange={e => setScheduleFormData({...scheduleFormData, interviewer: e.target.value})}
                    placeholder="Siapa yang akan meng-interview?"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Waktu Mulai</label>
                    <input 
                      type="time" required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                      value={scheduleFormData.startTime} onChange={e => setScheduleFormData({...scheduleFormData, startTime: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Waktu Selesai</label>
                    <input 
                      type="time" required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                      value={scheduleFormData.endTime} onChange={e => setScheduleFormData({...scheduleFormData, endTime: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Keterangan / Deskripsi</label>
                  <textarea 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:border-indigo-500 outline-none transition-all resize-y min-h-[80px]"
                    value={scheduleFormData.description || ''} onChange={e => setScheduleFormData({...scheduleFormData, description: e.target.value})}
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

        {(isCreateJobModalOpen || isEditJobModalOpen) && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden animate-scaleIn">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                    <Icon name={isCreateJobModalOpen ? "plus" : "edit"} size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-xl text-slate-800 tracking-tight">
                      {isCreateJobModalOpen ? 'Buat Lowongan Baru' : 'Ubah Data Lowongan'}
                    </h3>
                    <p className="text-sm font-bold text-slate-400">Pastikan informasi lowongan sudah sesuai</p>
                  </div>
                </div>
                <button onClick={() => { setIsCreateJobModalOpen(false); setIsEditJobModalOpen(false); }} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-xl transition-all">
                  <Icon name="x" size={20} />
                </button>
              </div>

              <form onSubmit={handleJobFormSubmit} className="p-8 space-y-6">
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Judul Lowongan</label>
                  <input 
                    type="text"
                    required
                    placeholder="Contoh: Senior Fullstack Developer"
                    value={jobFormData.title}
                    onChange={e => setJobFormData({...jobFormData, title: e.target.value})}
                    className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 font-bold placeholder:text-slate-300 focus:bg-white focus:border-primary/20 focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Departemen</label>
                    <div className="relative">
                      <select 
                        required
                        value={jobFormData.dept}
                        onChange={e => setJobFormData({...jobFormData, dept: e.target.value})}
                        className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 font-bold focus:bg-white focus:border-primary/20 focus:ring-4 focus:ring-primary/5 outline-none transition-all appearance-none cursor-pointer"
                      >
                        {deptOptions.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                      <Icon name="chevron-down" size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    {jobFormData.dept === 'Lainnya' && (
                      <div className="mt-3 animate-fadeIn">
                        <input 
                          type="text"
                          required
                          placeholder="Ketik departemen..."
                          value={jobFormData.customDept || ''}
                          onChange={e => setJobFormData({...jobFormData, customDept: e.target.value})}
                          className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 font-bold placeholder:text-slate-300 focus:bg-white focus:border-primary/20 focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Status Pekerja</label>
                    <div className="relative">
                      <select 
                        required
                        value={jobFormData.status}
                        onChange={e => setJobFormData({...jobFormData, status: e.target.value})}
                        className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 font-bold focus:bg-white focus:border-primary/20 focus:ring-4 focus:ring-primary/5 outline-none transition-all appearance-none cursor-pointer"
                      >
                        <option value="Karyawan">Karyawan</option>
                        <option value="Daily Worker">Daily Worker</option>
                        <option value="Magang">Magang</option>
                        <option value="Kontrak">Kontrak</option>
                        <option value="Outsource">Outsource</option>
                      </select>
                      <Icon name="chevron-down" size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Jumlah Kebutuhan (Quota)</label>
                  <div className="relative">
                    <input 
                      type="text"
                      inputMode="numeric"
                      required
                      placeholder="0"
                      value={jobFormData.quota || ''}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setJobFormData({...jobFormData, quota: val});
                      }}
                      className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 font-bold placeholder:text-slate-300 focus:bg-white focus:border-primary/20 focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                    />
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">
                      Orang
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => { setIsCreateJobModalOpen(false); setIsEditJobModalOpen(false); }}
                    className="flex-1 px-6 py-4 rounded-2xl font-black text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] px-6 py-4 rounded-2xl font-black text-white bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all active:scale-95"
                  >
                    {isCreateJobModalOpen ? 'Buat Lowongan' : 'Simpan Perubahan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {candidateToDelete && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden animate-scaleIn">
              <div className="p-8">
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6 mx-auto">
                  <Icon name="trash-2" size={32} />
                </div>
                <h3 className="text-xl font-black text-slate-800 text-center mb-4 px-4">Hapus Data Kandidat Permanen?</h3>
                <p className="text-slate-500 text-center text-sm leading-relaxed mb-8 px-6">
                  Apakah Anda yakin ingin menghapus data kandidat ini secara permanen? Data yang telah dihapus tidak dapat dikembalikan.
                </p>
                
                <div className="flex gap-4">
                  <button 
                    onClick={() => setCandidateToDelete(null)}
                    className="flex-1 px-6 py-4 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-50 transition-all border border-slate-100"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={confirmDeleteCandidate}
                    className="flex-1 bg-red-600 text-white px-6 py-4 rounded-2xl text-sm font-black shadow-xl shadow-red-200 active:scale-95 transition-all"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      <div className="flex justify-between items-center mb-8 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-100 shadow-sm">
             <Icon name="user-plus" size={24} />
          </div>
          <div className="flex flex-col">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">Rekrutmen</h2>
            <p className="text-sm font-bold text-slate-400">Kelola proses rekrutmen</p>
          </div>
        </div>
        <div className="flex gap-4">
           <div className="relative">
             <button 
               onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)} 
               className="bg-white border-2 border-slate-100 px-5 py-3 rounded-2xl text-sm font-black text-slate-700 flex items-center gap-3 hover:border-slate-200 transition-all shadow-sm"
             >
               <Icon name="users" size={18} className="text-slate-400" />
               Lowongan {jobFilter} 
               <Icon name="chevron-down" size={16} className={`text-slate-400 transition-transform ${isFilterDropdownOpen ? 'rotate-180' : ''}`} />
             </button>
             {isFilterDropdownOpen && (
               <>
                 <div className="fixed inset-0 z-10" onClick={() => setIsFilterDropdownOpen(false)}></div>
                 <div className="absolute right-0 top-full mt-2 w-48 bg-white border-2 border-slate-50 shadow-2xl rounded-2xl py-2 z-20 animate-fadeIn">
                   {['Aktif', 'Tidak Aktif'].map(f => (
                     <button 
                       key={f}
                       onClick={() => { setJobFilter(f); setIsFilterDropdownOpen(false); }}
                       className={`w-full text-left px-5 py-2.5 text-sm font-bold flex justify-between items-center ${jobFilter === f ? 'text-primary bg-blue-50' : 'text-slate-600 hover:bg-slate-50'}`}
                     >
                       {f}
                       {jobFilter === f && <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>}
                     </button>
                   ))}
                 </div>
               </>
             )}
           </div>
           <button 
             onClick={() => {
               setJobFormData({ title: '', dept: deptOptions[0], status: 'Karyawan', quota: '1', isActiveJob: true, customDept: '' });
               setIsCreateJobModalOpen(true);
             }}
             className="bg-primary text-white px-6 py-3 rounded-2xl text-sm font-black shadow-xl shadow-primary/30 flex items-center gap-2 active:scale-95 transition-all"
           >
             <Icon name="plus" size={18} /> Buat Lowongan Baru
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto hover-scrollbar pb-16 px-6 pt-6 content-start flex-1 min-h-0"
        onDragOver={(e) => e.preventDefault()}
      >
         {displayedJobs.map(job => {
          const isDraggingThis = job.id === draggingJobId;
          const isOverThis = job.id === dragOverJobId;
          
          const jobCandidates = candidates.filter(c => c.jobId === job.id);
          const activeStages = (jobStagesMap[job.id] || kanbanStages.map(s => s.id)).filter(id => id !== 'Talent Pool');
          
          const joinCount = jobCandidates.filter(c => c.stage === 'Kandidat Join' && c.tag !== 'DITOLAK' && c.tag !== 'TIDAK HADIR' && c.tag !== 'TIDAK RESPON').length;

          const candidateWeights = jobCandidates.map(c => {
            if (c.stage === 'Talent Pool' || c.tag === 'DITOLAK' || c.tag === 'TIDAK HADIR' || c.tag === 'TIDAK RESPON') return 0;
            const idx = activeStages.indexOf(c.stage);
            if (idx !== -1) {
               return activeStages.length > 1 ? (idx / (activeStages.length - 1)) : 1;
            }
            return 0;
          }).sort((a, b) => b - a);
          
          const topWeightsSum = candidateWeights.slice(0, job.quota > 0 ? job.quota : 1).reduce((sum, w) => sum + w, 0);
          const progressPercent = job.quota > 0 ? Math.min(100, Math.round((topWeightsSum / job.quota) * 100)) : 0;
          
          const progressCount = jobCandidates.filter(c => 
            c.stage !== activeStages[0] && 
            c.stage !== activeStages[activeStages.length - 1] && 
            c.stage !== 'Talent Pool' &&
            c.tag !== 'DITOLAK' &&
            c.tag !== 'TIDAK HADIR' &&
            c.tag !== 'TIDAK RESPON'
          ).length;

          return (
            <div 
              key={job.id} 
              draggable
              onDragStart={(e) => handleJobDragStart(e, job.id)}
              onDragOver={(e) => handleJobDragOver(e, job.id)}
              onDragEnd={handleJobDragEnd}
              onDrop={handleJobDrop}
              onClick={() => { if(!draggingJobId) { setSelectedJob(job); setView('detail'); } }} 
              className={`rounded-[20px] transition-all group flex flex-col cursor-grab active:cursor-grabbing min-h-[190px] ${isDraggingThis ? 'bg-slate-100 border-2 border-dashed border-slate-200 shadow-none scale-95' : 'bg-white border border-slate-100 shadow-sm hover:border-primary/30 hover:shadow-xl hover:shadow-slate-200'} ${isOverThis && !isDraggingThis ? 'ring-[3px] ring-primary border-primary scale-[1.02] z-10' : ''}`}
            >
               {!isDraggingThis ? (
                 <div className="p-[18px] flex flex-col h-full">
                   <div className="flex justify-between items-start mb-4">
                     <h3 className="font-bold text-[16px] text-slate-800 tracking-tight leading-tight group-hover:text-primary transition-colors pr-4">{job.title}</h3>
                     <div className="relative">
                       <button 
                         onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === job.id ? null : job.id); }}
                         className="text-slate-300 hover:text-slate-500 p-1.5 rounded-lg transition-colors shrink-0"
                       >
                         <Icon name="more-horizontal" size={18} />
                       </button>
                       {activeDropdown === job.id && (
                         <div 
                           className="absolute right-0 top-full mt-2 w-52 bg-white border border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.1)] rounded-2xl py-2 z-[110] animate-fadeIn"
                           onClick={(e) => e.stopPropagation()}
                         >
                           <button onClick={() => handleEditJob(job)} className="w-full text-left px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors border-b border-slate-50">
                             <Icon name="edit" size={16} className="text-slate-400" /> Edit Lowongan
                           </button>
                           
                           {job.isActiveJob ? (
                             <button onClick={() => handleDeactivateJob(job.id)} className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors">
                               <Icon name="power" size={16} className="text-red-400" /> Non-aktifkan Lowongan
                             </button>
                           ) : (
                             <>
                               <button onClick={() => handleActivateJob(job.id)} className="w-full text-left px-4 py-2.5 text-sm font-bold text-emerald-600 hover:bg-emerald-50 flex items-center gap-3 transition-colors border-b border-slate-50">
                                 <Icon name="power" size={16} className="text-emerald-500" /> Aktifkan Lowongan
                               </button>
                               <button onClick={() => handleDeleteJob(job.id)} className="w-full text-left px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-3 transition-colors">
                                 <Icon name="trash-2" size={16} className="text-rose-500" /> Hapus Lowongan
                               </button>
                             </>
                           )}
                         </div>
                       )}
                     </div>
                   </div>

                   <div className="flex gap-4 mb-4">
                     <div className="flex items-center gap-2">
                       <span className="text-[28px] font-medium text-slate-800 tracking-tight">{jobCandidates.length}</span>
                       <span className="text-xs font-medium text-slate-400">Candidate</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <span className="text-[28px] font-medium text-indigo-600 tracking-tight">{progressCount}</span>
                       <span className="text-xs font-medium text-indigo-400 whitespace-nowrap">Progress</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <div className="flex items-end">
                         <span className="text-[28px] font-medium text-slate-800 tracking-tight">{joinCount}</span>
                         <span className="text-[11px] font-medium text-slate-400 mb-1 ml-0.5">/{job.quota}</span>
                       </div>
                       <span className="text-xs font-medium text-slate-400">Join</span>
                     </div>
                   </div>

                   <div className="h-[1px] w-full bg-slate-100 mb-4"></div>

                   <div className="mt-auto flex flex-col gap-4">
                     <div className="flex flex-col gap-2 w-full">
                       <div className="flex justify-between items-center w-full">
                         <span className="text-[11px] font-bold text-slate-500">Progress</span>
                         <span className={`text-[11px] font-black ${
                           progressPercent === 0 ? 'text-slate-400' : 
                           progressPercent <= 25 ? 'text-rose-500' :
                           progressPercent <= 50 ? 'text-orange-500' :
                           progressPercent <= 75 ? 'text-amber-500' :
                           progressPercent <= 99 ? 'text-blue-500' : 'text-emerald-500'
                         }`}>
                           {progressPercent}%
                         </span>
                       </div>
                       <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                         <div 
                           className={`h-full rounded-full transition-all duration-1000 ${
                             progressPercent === 0 ? 'bg-transparent' : 
                             progressPercent <= 25 ? 'bg-rose-500' :
                             progressPercent <= 50 ? 'bg-orange-500' :
                             progressPercent <= 75 ? 'bg-amber-500' :
                             progressPercent <= 99 ? 'bg-blue-500' : 'bg-emerald-500'
                           }`} 
                           style={{ width: `${progressPercent}%` }}
                         ></div>
                       </div>
                     </div>
                     <div className="flex justify-between items-end">
                     <div className="flex items-center gap-2">
                       <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-transparent ${job.catBg} ${job.catText}`}>
                         <div className={`w-1 h-1 rounded-full ${job.catDot}`}></div>
                         <span className="text-[10px] font-bold">{job.dept}</span>
                       </div>
                       <div className="px-2.5 py-1 rounded-xl border border-slate-200 bg-white">
                         <span className="text-[10px] font-bold text-slate-600 truncate max-w-[50px] inline-block">
                           {job.status === 'Daily Worker' ? 'DW' : job.status}
                         </span>
                       </div>
                     </div>

                      {/* Old progress bar removed */}
                   </div>
                   </div>
                 </div>
               ) : null}
            </div>
          );
        })}
      </div>

      {(isCreateJobModalOpen || isEditJobModalOpen) && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden animate-scaleIn">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                  <Icon name={isCreateJobModalOpen ? "plus" : "edit"} size={24} />
                </div>
                <div>
                  <h3 className="font-black text-xl text-slate-800 tracking-tight">
                    {isCreateJobModalOpen ? 'Buat Lowongan Baru' : 'Ubah Data Lowongan'}
                  </h3>
                  <p className="text-sm font-bold text-slate-400">Pastikan informasi lowongan sudah sesuai</p>
                </div>
              </div>
              <button onClick={() => { setIsCreateJobModalOpen(false); setIsEditJobModalOpen(false); }} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-xl transition-all">
                <Icon name="x" size={20} />
              </button>
            </div>

            <form onSubmit={handleJobFormSubmit} className="p-8 space-y-6">
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Judul Lowongan</label>
                <input 
                  type="text"
                  required
                  placeholder="Contoh: Senior Fullstack Developer"
                  value={jobFormData.title}
                  onChange={e => setJobFormData({...jobFormData, title: e.target.value})}
                  className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 font-bold placeholder:text-slate-300 focus:bg-white focus:border-primary/20 focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Departemen</label>
                  <div className="relative">
                    <select 
                      required
                      value={jobFormData.dept}
                      onChange={e => setJobFormData({...jobFormData, dept: e.target.value})}
                      className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 font-bold focus:bg-white focus:border-primary/20 focus:ring-4 focus:ring-primary/5 outline-none transition-all appearance-none cursor-pointer"
                    >
                      {deptOptions.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                    <Icon name="chevron-down" size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  {jobFormData.dept === 'Lainnya' && (
                    <div className="mt-3 animate-fadeIn">
                      <input 
                        type="text"
                        required
                        placeholder="Ketik departemen..."
                        value={jobFormData.customDept || ''}
                        onChange={e => setJobFormData({...jobFormData, customDept: e.target.value})}
                        className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 font-bold placeholder:text-slate-300 focus:bg-white focus:border-primary/20 focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Status Pekerja</label>
                  <div className="relative">
                    <select 
                      required
                      value={jobFormData.status}
                      onChange={e => setJobFormData({...jobFormData, status: e.target.value})}
                      className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 font-bold focus:bg-white focus:border-primary/20 focus:ring-4 focus:ring-primary/5 outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="Karyawan">Karyawan</option>
                      <option value="Daily Worker">Daily Worker</option>
                      <option value="Magang">Magang</option>
                      <option value="Kontrak">Kontrak</option>
                      <option value="Outsource">Outsource</option>
                    </select>
                    <Icon name="chevron-down" size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Jumlah Kebutuhan (Quota)</label>
                <div className="relative">
                  <input 
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="0"
                    value={jobFormData.quota || ''}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setJobFormData({...jobFormData, quota: val});
                    }}
                    className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-700 font-bold placeholder:text-slate-300 focus:bg-white focus:border-primary/20 focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">
                    Orang
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button 
                  type="button"
                  onClick={() => { setIsCreateJobModalOpen(false); setIsEditJobModalOpen(false); }}
                  className="flex-1 px-6 py-4 rounded-2xl font-black text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="flex-[2] px-6 py-4 rounded-2xl font-black text-white bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all active:scale-95"
                >
                  {isCreateJobModalOpen ? 'Buat Lowongan' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteJobModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden animate-scaleIn">
            <div className="p-8">
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6 mx-auto">
                <Icon name="trash-2" size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-800 text-center mb-4 px-4">Hapus Lowongan Permanen?</h3>
              <p className="text-slate-500 text-center text-sm leading-relaxed mb-8 px-6">
                Apakah Anda yakin ingin menghapus data lowongan ini secara permanen? Data yang telah dihapus tidak dapat dikembalikan.
              </p>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => { setIsDeleteJobModalOpen(false); setJobToDeleteId(null); }}
                  className="flex-1 px-6 py-4 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-50 transition-all border border-slate-100"
                >
                  Batal
                </button>
                <button 
                  onClick={confirmDeleteJob}
                  className="flex-1 bg-red-600 text-white px-6 py-4 rounded-2xl text-sm font-black shadow-xl shadow-red-200 active:scale-95 transition-all"
                >
                  Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {candidateToDelete && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden animate-scaleIn">
            <div className="p-8">
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6 mx-auto">
                <Icon name="trash-2" size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-800 text-center mb-4 px-4">Hapus Data Kandidat Permanen?</h3>
              <p className="text-slate-500 text-center text-sm leading-relaxed mb-8 px-6">
                Apakah Anda yakin ingin menghapus data kandidat ini secara permanen? Data yang telah dihapus tidak dapat dikembalikan.
              </p>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setCandidateToDelete(null)}
                  className="flex-1 px-6 py-4 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-50 transition-all border border-slate-100"
                >
                  Batal
                </button>
                <button 
                  onClick={confirmDeleteCandidate}
                  className="flex-1 bg-red-600 text-white px-6 py-4 rounded-2xl text-sm font-black shadow-xl shadow-red-200 active:scale-95 transition-all"
                >
                  Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
