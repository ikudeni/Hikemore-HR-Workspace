/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui/Icon';
import { FormSelect, CompactFormSelect } from './ui/FormSelect';
import { CustomDatePicker } from './ui/DatePicker';
import { Employee } from '../types';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface KaryawanContentProps {
  employees: Employee[];
  onAddEmployee: (data: Employee) => void;
  onEditEmployee: (data: Employee) => void;
  onResignEmployee: (id: string, data: any) => void;
  onCancelResign: (id: string) => void;
  onRejoinEmployee: (id: string) => void;
  onDeleteEmployee: (id: string) => void;
}

const getStatusBadgeClass = (status: string) => {
  const s = status.toLowerCase();
  if (s === 'karyawan' || s === 'permanent') return 'bg-blue-50 text-blue-600 border-blue-200';
  if (s === 'magang' || s.includes('intern')) return 'bg-pink-50 text-pink-600 border-pink-200';
  if (s === 'freelance') return 'bg-emerald-50 text-emerald-600 border-emerald-200';
  if (s === 'daily worker' || s === 'dw') return 'bg-amber-50 text-amber-600 border-amber-200';
  if (s === 'kontrak') return 'bg-purple-50 text-purple-600 border-purple-200';
  if (s === 'outsource') return 'bg-teal-50 text-teal-600 border-teal-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

export const KaryawanContent = ({ 
  employees, onAddEmployee, onEditEmployee, onResignEmployee, 
  onCancelResign, onRejoinEmployee, onDeleteEmployee 
}: KaryawanContentProps) => {
  const [activeTab, setActiveTab] = useState<'Active' | 'Resigned'>('Active');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null); 
  const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null); 
  const [actionMenuPos, setActionMenuPos] = useState({ top: 0, bottom: 0, right: 0, direction: 'down' as 'up' | 'down' });
  
  const [isUploadDocumentModalOpen, setIsUploadDocumentModalOpen] = useState(false);
  const [documentUploadTarget, setDocumentUploadTarget] = useState<Employee | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [isDownloadingDoc, setIsDownloadingDoc] = useState<string | null>(null);

  const [isResignModalOpen, setIsResignModalOpen] = useState(false);
  const [resigningEmployeeId, setResigningEmployeeId] = useState<string | null>(null);
  const [resignFormData, setResignFormData] = useState({ resignDate: '', resignReason: '' });

  const [confirmAction, setConfirmAction] = useState({ isOpen: false, type: '', id: '' });
  const [employeeToDelete, setEmployeeToDelete] = useState<string | null>(null);

  const [isCancelResignModalOpen, setIsCancelResignModalOpen] = useState(false);
  const [isRejoinModalOpen, setIsRejoinModalOpen] = useState(false);
  const [targetEmployeeId, setTargetEmployeeId] = useState<string | null>(null);

  const [formData, setFormData] = useState<any>({
    name: '', dob: '', joinDate: '', gender: 'Laki-Laki', religion: 'Islam',
    maritalStatus: 'Belum Menikah', edu: 'SD', major: '', pos: '',
    dept: 'Marketing', customDept: '', customReligion: '', customStatus: '', customContractType: '', status: 'Karyawan', isActive: true,
    contractType: 'Kontrak Lanjutan', contractStart: '', contractEnd: ''
  });
  
  const [filterStatus, setFilterStatus] = useState('All Status');
  const [filterDept, setFilterDept] = useState('All Departemen');
  const [filterEdu, setFilterEdu] = useState('All Pendidikan');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const uniqueStatuses = useMemo(() => [...new Set(employees.map(emp => emp.status))], [employees]);
  const uniqueDepts = useMemo(() => [...new Set(employees.map(emp => emp.dept))], [employees]);
  const uniqueEdus = useMemo(() => [...new Set(employees.map(emp => emp.edu))], [employees]);
  const uniqueContractTypes = useMemo(() => [...new Set(employees.map(emp => emp.contractType).filter(Boolean))], [employees]);
  
  const baseStatuses = ['Karyawan', 'Daily Worker', 'Magang', 'Kontrak', 'Outsource', 'Freelance'];
  const statusOptions = useMemo(() => Array.from(new Set([...baseStatuses, ...uniqueStatuses, 'Lainnya'])), [uniqueStatuses]);
  
  const baseContractTypes = ['Kontrak Lanjutan', 'Kontrak Probation', 'Kontrak Magang', 'Kontrak Freelance'];
  const contractTypeOptions = useMemo(() => Array.from(new Set([...baseContractTypes, ...uniqueContractTypes, 'Lainnya'])), [uniqueContractTypes]);
  
  const deptOptions = useMemo(() => Array.from(new Set([...uniqueDepts, 'Lainnya'])), [uniqueDepts]);

  useEffect(() => {
    const handleScroll = (e: any) => {
      if (e.target.closest?.('.action-dropdown-menu')) return;
      if (actionMenuOpenId !== null) setActionMenuOpenId(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [actionMenuOpenId]);

  const filteredEmployees = employees.filter(emp => {
    const isTabMatch = activeTab === 'Active' ? emp.isActive : !emp.isActive;
    const isNameMatch = emp.name.toLowerCase().includes(deferredSearchQuery.toLowerCase());
    const isStatusMatch = filterStatus === 'All Status' || emp.status === filterStatus;
    const isDeptMatch = filterDept === 'All Departemen' || emp.dept === filterDept;
    const isEduMatch = filterEdu === 'All Pendidikan' || emp.edu === filterEdu;
    return isTabMatch && isNameMatch && isStatusMatch && isDeptMatch && isEduMatch;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, deferredSearchQuery, filterStatus, filterDept, filterEdu]);

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleInputChange = (e: any) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const toggleActionMenu = (id: string, e: React.MouseEvent) => {
    if (actionMenuOpenId === id) {
      setActionMenuOpenId(null);
    } else {
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const direction = spaceBelow < 220 ? 'up' : 'down';
      setActionMenuPos({
        top: rect.bottom + 4,
        bottom: window.innerHeight - rect.top + 4,
        right: window.innerWidth - rect.right,
        direction
      });
      setActionMenuOpenId(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = { ...formData };
    if (finalData.dept === 'Lainnya') finalData.dept = finalData.customDept;
    if (finalData.religion === 'Lainnya') finalData.religion = finalData.customReligion;
    if (finalData.status === 'Lainnya') finalData.status = finalData.customStatus;
    if (finalData.contractType === 'Lainnya') finalData.contractType = finalData.customContractType;
    if (editingEmployeeId) onEditEmployee(finalData); 
    else onAddEmployee(finalData); 
    setIsModalOpen(false); 
  };

  const confirmDeleteEmployee = () => {
    if (employeeToDelete) {
      onDeleteEmployee(employeeToDelete);
      setEmployeeToDelete(null);
    }
  };

  const openAddModal = () => {
    setEditingEmployeeId(null);
    setFormData({
      name: '', dob: '', joinDate: '', gender: 'Laki-Laki', religion: 'Islam',
      maritalStatus: 'Belum Menikah', edu: 'SD', major: '', pos: '',
      dept: uniqueDepts.length > 0 ? uniqueDepts[0] : 'Marketing', customDept: '', customReligion: '', customStatus: '', customContractType: '', status: 'Karyawan', isActive: true,
      contractType: 'Kontrak Lanjutan', contractStart: '', contractEnd: ''
    });
    setIsModalOpen(true);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterStatus('All Status');
    setFilterDept('All Departemen');
    setFilterEdu('All Pendidikan');
  };

  const isFilterActive = searchQuery !== '' || filterStatus !== 'All Status' || filterDept !== 'All Departemen' || filterEdu !== 'All Pendidikan';

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-50 h-full flex flex-col overflow-hidden relative">
      <div className="flex justify-between items-end border-b border-slate-200 px-6 pt-5">
        <div className="flex gap-6">
          <button className={`pb-3 font-bold text-sm border-b-[3px] transition-all ${activeTab === 'Active' ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`} onClick={() => setActiveTab('Active')}>Active</button>
          <button className={`pb-3 font-bold text-sm border-b-[3px] transition-all ${activeTab === 'Resigned' ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`} onClick={() => setActiveTab('Resigned')}>Resigned</button>
        </div>
        <div className="flex gap-3 pb-3">
          <button onClick={openAddModal} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm shadow-primary/30">
            <Icon name="plus" size={14} /> Tambah Karyawan
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-6 py-4 relative z-[60]">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Cari nama di sini..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary shadow-sm" />
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-[140px]">
            <CompactFormSelect 
              name="filterStatus" 
              value={filterStatus} 
              options={['All Status', ...Array.from(new Set([...baseStatuses, ...uniqueStatuses]))]} 
              onChange={(e) => setFilterStatus(e.target.value)} 
            />
          </div>
          <div className="w-[140px]">
            <CompactFormSelect 
              name="filterDept" 
              value={filterDept} 
              options={['All Departemen', ...uniqueDepts]} 
              onChange={(e) => setFilterDept(e.target.value)} 
            />
          </div>
          <div className="w-[140px]">
            <CompactFormSelect 
              name="filterEdu" 
              value={filterEdu} 
              options={['All Pendidikan', ...uniqueEdus]} 
              onChange={(e) => setFilterEdu(e.target.value)} 
            />
          </div>
          
          {isFilterActive && (
            <button 
              onClick={handleResetFilters}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-500 hover:text-primary hover:border-primary transition-all animate-fadeIn"
            >
              <Icon name="rotate-ccw" size={12} />
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto hover-scrollbar border-t border-slate-100">
        <table className="w-full text-left whitespace-nowrap">
          <thead className="bg-slate-50 sticky top-0 z-20">
            <tr className="text-sm font-bold text-slate-700 border-b border-slate-200">
              <th className="px-4 py-4 sticky left-0 z-30 bg-slate-50">No.</th>
              <th className="px-4 py-4 sticky left-[52px] z-30 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">Nama Karyawan</th>
              <th className="px-6 py-4">Agama</th>
              <th className="px-6 py-4">Pendidikan</th>
              <th className="px-6 py-4">Jurusan</th>
              <th className="px-6 py-4">Jenis Kelamin</th>
              <th className="px-6 py-4">Tanggal Lahir</th>
              <th className="px-6 py-4">Umur</th>
              <th className="px-6 py-4">Status Perkawinan</th>
              <th className="px-6 py-4">Tanggal Join</th>
              <th className="px-6 py-4">Lama Kerja</th>
              <th className="px-6 py-4 font-medium text-slate-500">Jabatan</th>
              <th className="px-6 py-4 font-medium text-slate-500">Departemen</th>
              {activeTab === 'Active' && (
                <>
                  <th className="px-6 py-4 font-medium text-slate-500">Jenis Kontrak</th>
                  <th className="px-6 py-4 font-medium text-slate-500">Kontrak Awal</th>
                  <th className="px-6 py-4 font-medium text-slate-500">Kontrak Akhir</th>
                </>
              )}
              {activeTab === 'Resigned' && (
                <>
                  <th className="px-6 py-4 text-red-600 font-black">Akhir Kerja</th>
                  <th className="px-6 py-4 text-red-600 font-black">Alasan Resign</th>
                </>
              )}
              <th className="px-6 py-4 font-medium text-slate-500">Dokumen</th>
              <th className="px-6 py-4 sticky right-0 z-30 bg-slate-50 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.08)]">Aksi</th>
            </tr>
          </thead>
          <tbody className="text-sm text-slate-600 divide-y divide-slate-100 font-medium">
             {paginatedEmployees.map((emp, index) => (
                <tr key={emp.id} className="hover:bg-slate-50 relative group">
                  <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10 w-[52px] text-center font-medium">
                    {index + 1 + (currentPage - 1) * itemsPerPage}.
                  </td>
                  <td className="px-4 py-3 sticky left-[52px] bg-white group-hover:bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] z-10 min-w-[220px]">
                    <div className="flex gap-3 items-center">
                      <div className="w-10 h-10 rounded-full bg-blue-100/50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-base shrink-0">{emp.name.charAt(0)}</div>
                      <div className="flex flex-col">
                        <span className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                          {emp.name}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black mt-0.5 w-fit ${getStatusBadgeClass(emp.status)}`}>
                          {emp.status === 'Daily Worker' ? 'DW' : emp.status}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 font-medium">{emp.religion}</td>
                  <td className="px-6 py-3 font-medium">{emp.edu}</td>
                  <td className="px-6 py-3 font-medium">{emp.major || '-'}</td>
                  <td className="px-6 py-3 font-medium">{emp.gender}</td>
                  <td className="px-6 py-3 font-medium">{emp.formattedDob}</td>
                  <td className="px-6 py-3 font-medium text-center">{emp.calculatedAge}</td>
                  <td className="px-6 py-3 font-medium">{emp.maritalStatus}</td>
                  <td className="px-6 py-3 font-medium">{emp.formattedJoinDate}</td>
                  <td className="px-6 py-3 font-medium">{emp.calculatedDuration}</td>
                  <td className="px-6 py-3 font-medium">{emp.pos}</td>
                  <td className="px-6 py-3 font-medium">{emp.dept}</td>
                  {activeTab === 'Active' && (
                    <>
                      <td className="px-6 py-3 font-medium">{emp.contractType || '-'}</td>
                      <td className="px-6 py-3 font-medium">{emp.contractStart || '-'}</td>
                      <td className="px-6 py-3 font-medium">{emp.contractEnd || '-'}</td>
                    </>
                  )}
                  {activeTab === 'Resigned' && (
                    <>
                      <td className="px-6 py-3 text-red-600 font-black">{emp.formattedResignDate}</td>
                      <td className="px-6 py-3 text-[#7FA9C5] italic font-medium max-w-[200px] truncate">{emp.resignReason}</td>
                    </>
                  )}
                  <td className="px-6 py-3 font-medium text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDocumentUploadTarget(emp); setIsUploadDocumentModalOpen(true); setActionMenuOpenId(null); }}
                      className="inline-flex items-center justify-center p-1.5 border border-slate-200 hover:bg-blue-50 hover:border-blue-200 rounded-md text-slate-500 hover:text-blue-600 transition-colors"
                      title="Lihat/Upload Dokumen"
                    >
                      <Icon name="file" size={16} />
                      <span className="ml-[4px] text-[11px] font-bold">{emp.documents?.length || 0}</span>
                    </button>
                  </td>
                  <td className="px-6 py-3 sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.08)] z-10 w-[120px]">
                    <div className="relative inline-block w-full">
                      <button onClick={(e) => toggleActionMenu(emp.id, e)} className="flex items-center justify-between w-[95px] px-3 py-1.5 rounded-md text-xs font-bold border border-primary text-primary hover:bg-primary/10 transition-colors">
                        Action <Icon name="chevron-down" size={14} />
                      </button>
                      {actionMenuOpenId === emp.id && createPortal(
                        <>
                          <div className="fixed inset-0 z-[9998]" onClick={() => setActionMenuOpenId(null)}></div>
                          <div className={`action-dropdown-menu fixed w-44 bg-white border border-slate-200 shadow-xl rounded-xl py-1 z-[9999] animate-fadeIn`}
                            style={{ top: actionMenuPos.direction === 'down' ? actionMenuPos.top : 'auto', bottom: actionMenuPos.direction === 'up' ? actionMenuPos.bottom : 'auto', right: actionMenuPos.right }}>
                            <button onClick={() => { 
                              setEditingEmployeeId(emp.id); 
                              const editData = {...emp};
                              if (editData.dept && !uniqueDepts.includes(editData.dept)) {
                                editData.customDept = editData.dept;
                                editData.dept = 'Lainnya';
                              }
                              if (editData.religion && !['Islam', 'Kristen', 'Katolik', 'Budha', 'Hindu', 'Konghucu'].includes(editData.religion)) {
                                editData.customReligion = editData.religion;
                                editData.religion = 'Lainnya';
                              }
                              if (editData.status && !baseStatuses.includes(editData.status)) {
                                editData.customStatus = editData.status;
                                editData.status = 'Lainnya';
                              }
                              if (editData.contractType && !baseContractTypes.includes(editData.contractType)) {
                                editData.customContractType = editData.contractType;
                                editData.contractType = 'Lainnya';
                              }
                              if (!editData.customDept) editData.customDept = '';
                              if (!editData.customReligion) editData.customReligion = '';
                              if (!editData.customStatus) editData.customStatus = '';
                              if (!editData.customContractType) editData.customContractType = '';
                              setFormData(editData); 
                              setIsModalOpen(true); 
                              setActionMenuOpenId(null); 
                            }} className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Icon name="edit" size={14} /> Ubah Data</button>
                            <button onClick={() => { setDocumentUploadTarget(emp); setIsUploadDocumentModalOpen(true); setActionMenuOpenId(null); }} className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Icon name="file" size={14} /> Dokumen</button>
                            {emp.isActive ? (
                              <button onClick={() => { setResigningEmployeeId(emp.id); setIsResignModalOpen(true); setActionMenuOpenId(null); }} className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"><Icon name="user-minus" size={14} /> Resign</button>
                            ) : (
                               <>
                                <button onClick={() => { setTargetEmployeeId(emp.id); setIsCancelResignModalOpen(true); setActionMenuOpenId(null); }} className="w-full text-left px-4 py-2.5 text-xs text-orange-600 hover:bg-orange-50 flex items-center gap-2"><Icon name="rotate-ccw" size={14} /> Batalkan Resign</button>
                                <button onClick={() => { setTargetEmployeeId(emp.id); setIsRejoinModalOpen(true); setActionMenuOpenId(null); }} className="w-full text-left px-4 py-2.5 text-xs text-emerald-600 hover:bg-emerald-50 flex items-center gap-2"><Icon name="user-plus" size={14} /> Join Kembali</button>
                                <button onClick={() => { setEmployeeToDelete(emp.id); setActionMenuOpenId(null); }} className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"><Icon name="trash-2" size={14} /> Hapus Data</button>
                               </>
                            )}
                          </div>
                        </>,
                        document.body
                      )}
                    </div>
                  </td>
                </tr>
             ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white shrink-0">
        <div className="text-xs text-slate-500">
          Showing {filteredEmployees.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredEmployees.length)} of {filteredEmployees.length} entries
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1 || totalPages === 0}
            className="p-1.5 rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-slate-100"
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors ${currentPage === page ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {page}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="p-1.5 rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-slate-100"
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-fadeIn">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <h3 className="font-bold text-lg text-slate-800">{editingEmployeeId ? 'Ubah Data Karyawan' : 'Tambah Karyawan'}</h3>
              <button onClick={() => setIsModalOpen(false)}><Icon name="x" size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <form id="addEmployeeForm" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2 border-b border-slate-100 pb-2"><h4 className="text-sm font-bold uppercase">Personal Info</h4></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Nama</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-sm border-slate-200 outline-none focus:border-primary" /></div>
                <CustomDatePicker label="Tgl Lahir" name="dob" value={formData.dob} onChange={handleInputChange} required />
                <FormSelect label="Gender" name="gender" value={formData.gender} onChange={handleInputChange} options={['Laki-Laki', 'Perempuan']} />
                <div>
                  <FormSelect label="Agama" name="religion" value={formData.religion} onChange={handleInputChange} options={['Islam', 'Kristen', 'Katolik', 'Budha', 'Hindu', 'Konghucu', 'Lainnya']} />
                  {formData.religion === 'Lainnya' && (
                    <div className="mt-3 animate-fadeIn">
                      <input 
                        type="text" 
                        name="customReligion" 
                        value={formData.customReligion || ''} 
                        onChange={handleInputChange} 
                        placeholder="Ketik agama..." 
                        required 
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all" 
                      />
                    </div>
                  )}
                </div>
                <FormSelect label="Status Perkawinan" name="maritalStatus" value={formData.maritalStatus} onChange={handleInputChange} options={['Belum Menikah', 'Menikah', 'Cerai Hidup', 'Cerai Mati']} />
                <FormSelect label="Pendidikan" name="edu" value={formData.edu} onChange={handleInputChange} options={['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2', 'S3']} />
                <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-700 mb-1">Jurusan</label><input type="text" name="major" value={formData.major} onChange={handleInputChange} placeholder="Ketik jurusan pendidikan..." className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-sm border-slate-200 outline-none focus:border-primary" /></div>
                
                <div className="md:col-span-2 border-b border-slate-100 pb-2"><h4 className="text-sm font-bold uppercase">Work Info</h4></div>
                <div>
                  <FormSelect label="Status Karyawan" name="status" value={formData.status} onChange={handleInputChange} options={statusOptions} />
                  {formData.status === 'Lainnya' && (
                    <div className="mt-3 animate-fadeIn">
                      <input 
                        type="text" 
                        name="customStatus" 
                        value={formData.customStatus || ''} 
                        onChange={handleInputChange} 
                        placeholder="Ketik status karyawan..." 
                        required 
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all" 
                      />
                    </div>
                  )}
                </div>
                <CustomDatePicker label="Tgl Join" name="joinDate" value={formData.joinDate} onChange={handleInputChange} required />
                <div>
                  <FormSelect label="Departemen" name="dept" value={formData.dept} onChange={handleInputChange} options={deptOptions} />
                  {formData.dept === 'Lainnya' && (
                    <div className="mt-3 animate-fadeIn">
                      <input 
                        type="text" 
                        name="customDept" 
                        value={formData.customDept || ''} 
                        onChange={handleInputChange} 
                        placeholder="Ketik departemen..." 
                        required 
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all" 
                      />
                    </div>
                  )}
                </div>
                <div className="md:col-span-1"><label className="block text-xs font-bold text-slate-700 mb-1">Jabatan</label><input type="text" name="pos" value={formData.pos} onChange={handleInputChange} required className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-sm border-slate-200 outline-none focus:border-primary" /></div>
                
                {(formData.status === 'Kontrak' || formData.status === 'Karyawan' || formData.status === 'Magang' || formData.status === 'Freelance' || formData.status === 'Lainnya') && (
                  <>
                    <div className="md:col-span-2 border-b border-slate-100 pb-2 mt-2"><h4 className="text-sm font-bold uppercase">Contract Info</h4></div>
                    <div>
                      <FormSelect label="Jenis Kontrak" name="contractType" value={formData.contractType || 'Kontrak Lanjutan'} onChange={handleInputChange} options={contractTypeOptions} />
                      {formData.contractType === 'Lainnya' && (
                        <div className="mt-3 animate-fadeIn">
                          <input 
                            type="text" 
                            name="customContractType" 
                            value={formData.customContractType || ''} 
                            onChange={handleInputChange} 
                            placeholder="Ketik jenis kontrak..." 
                            required 
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all" 
                          />
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-1"></div>
                    <CustomDatePicker label="Kontrak Awal" name="contractStart" value={formData.contractStart || ''} onChange={handleInputChange} required />
                    <CustomDatePicker label="Kontrak Akhir" name="contractEnd" value={formData.contractEnd || ''} onChange={handleInputChange} required />
                  </>
                )}
              </form>
            </div>
            <div className="px-6 py-5 border-t border-slate-100 flex justify-end gap-3 rounded-b-2xl">
              <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-sm font-bold bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 hover:-translate-y-0.5 transition-all active:scale-95 hover:shadow-sm">Batal</button>
              <button type="submit" form="addEmployeeForm" className="px-6 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:bg-opacity-90 hover:-translate-y-0.5 transition-all active:scale-95 hover:shadow-md">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {isUploadDocumentModalOpen && documentUploadTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-white rounded-[24px] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-scaleIn">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-100/50 rounded-full flex items-center justify-center text-blue-600">
                  <Icon name="file-text" size={20} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-slate-800 tracking-tight">Dokumen Karyawan</h3>
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
                              const updatedEmployee = { ...documentUploadTarget, documents: newDocs };
                              setDocumentUploadTarget(updatedEmployee);
                              // We should call a prop function like onEditEmployee but only editing documents.
                              onEditEmployee(updatedEmployee);
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
                    id="employee-document-upload" 
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
                          const updatedEmployee = { ...documentUploadTarget, documents: newDocs };
                          setDocumentUploadTarget(updatedEmployee);
                          onEditEmployee(updatedEmployee);
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
                    htmlFor="employee-document-upload"
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

      {isResignModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg animate-fadeIn overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white relative">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                  <Icon name="user-minus" size={24} />
                </div>
                <h3 className="font-extrabold text-xl text-slate-800">Proses Resign Karyawan</h3>
              </div>
              <button 
                onClick={() => setIsResignModalOpen(false)}
                className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors shadow-sm"
              >
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">Tanggal Resign <span className="text-red-500">*</span></label>
                <CustomDatePicker 
                  name="resignDate" 
                  value={resignFormData.resignDate} 
                  onChange={(e) => setResignFormData(prev => ({...prev, resignDate: e.target.value}))} 
                  required 
                  placeholder="Pilih tanggal..."
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">Alasan Resign <span className="text-red-500">*</span></label>
                <textarea 
                  placeholder="Tuliskan alasan pengajuan resign..."
                  value={resignFormData.resignReason} 
                  onChange={(e) => setResignFormData(prev => ({...prev, resignReason: e.target.value}))} 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm h-32 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none placeholder:text-slate-400 font-medium" 
                  required 
                />
              </div>
            </div>
            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex justify-center gap-4">
              <button 
                onClick={() => setIsResignModalOpen(false)} 
                className="px-8 py-3.5 text-sm font-black bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-100 hover:-translate-y-0.5 hover:shadow-md transition-all shadow-sm active:scale-95"
              >
                Batal
              </button>
              <button 
                onClick={() => { onResignEmployee(resigningEmployeeId!, resignFormData); setIsResignModalOpen(false); }} 
                className="flex items-center gap-2 px-8 py-3.5 text-sm font-black text-white bg-red-600 rounded-2xl hover:bg-red-700 hover:-translate-y-0.5 transition-all shadow-xl shadow-red-200 active:scale-95"
              >
                <Icon name="check" size={18} />
                Konfirmasi Resign
              </button>
            </div>
          </div>
        </div>
      )}

      {isCancelResignModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn">
            <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center text-orange-500">
                  <Icon name="rotate-ccw" size={24} />
                </div>
                <h3 className="font-extrabold text-xl text-slate-800">Batalkan Resign?</h3>
              </div>
              <button 
                onClick={() => setIsCancelResignModalOpen(false)}
                className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 rounded-full text-slate-400 hover:text-slate-600 shadow-sm"
              >
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="p-8">
              <p className="text-slate-500 text-sm leading-relaxed font-medium">
                Tindakan ini akan mengembalikan data karyawan ke daftar Aktif (misal: karena kesalahan pihak HR). Perhitungan lama kerja akan dilanjutkan dari tanggal join semula.
              </p>
            </div>
            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex justify-center gap-4">
              <button 
                onClick={() => setIsCancelResignModalOpen(false)} 
                className="px-8 py-3.5 text-sm font-black bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-100 hover:-translate-y-0.5 hover:shadow-md transition-all shadow-sm active:scale-95"
              >
                Batal
              </button>
              <button 
                onClick={() => { onCancelResign(targetEmployeeId!); setIsCancelResignModalOpen(false); }} 
                className="flex items-center gap-2 px-8 py-3.5 text-sm font-black text-white bg-orange-600 rounded-2xl hover:bg-orange-700 hover:-translate-y-0.5 transition-all shadow-xl shadow-orange-100 active:scale-95"
              >
                <Icon name="check" size={18} />
                Ya, Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}

      {isRejoinModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn">
            <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500">
                  <Icon name="user-plus" size={24} />
                </div>
                <h3 className="font-extrabold text-xl text-slate-800">Join Kembali?</h3>
              </div>
              <button 
                onClick={() => setIsRejoinModalOpen(false)}
                className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 rounded-full text-slate-400 hover:text-slate-600 shadow-sm"
              >
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="p-8">
              <p className="text-slate-500 text-sm leading-relaxed font-medium">
                Karyawan ini akan dimasukkan kembali ke daftar Aktif. Tanggal join akan direset menjadi hari ini dan perhitungan lama kerja akan diulang dari nol.
              </p>
            </div>
            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex justify-center gap-4">
              <button 
                onClick={() => setIsRejoinModalOpen(false)} 
                className="px-8 py-3.5 text-sm font-black bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-100 hover:-translate-y-0.5 hover:shadow-md transition-all shadow-sm active:scale-95"
              >
                Batal
              </button>
              <button 
                onClick={() => { onRejoinEmployee(targetEmployeeId!); setIsRejoinModalOpen(false); }} 
                className="flex items-center gap-2 px-8 py-3.5 text-sm font-black text-white bg-emerald-600 rounded-2xl hover:bg-emerald-700 hover:-translate-y-0.5 transition-all shadow-xl shadow-emerald-100 active:scale-95"
              >
                <Icon name="check" size={18} />
                Ya, Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}

      {employeeToDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden animate-scaleIn">
            <div className="p-8">
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6 mx-auto">
                <Icon name="trash-2" size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-800 text-center mb-4 px-4">Hapus Data Permanen?</h3>
              <p className="text-slate-500 text-center text-sm leading-relaxed mb-8 px-6">
                Apakah Anda yakin ingin menghapus data karyawan ini secara permanen? Data yang telah dihapus tidak dapat dikembalikan.
              </p>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setEmployeeToDelete(null)}
                  className="flex-1 px-6 py-4 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-50 hover:-translate-y-0.5 hover:shadow-md transition-all border border-slate-100 active:scale-95"
                >
                  Batal
                </button>
                <button 
                  onClick={confirmDeleteEmployee}
                  className="flex-1 bg-red-600 text-white px-6 py-4 rounded-2xl text-sm font-black shadow-xl shadow-red-200 hover:-translate-y-0.5 active:scale-95 transition-all"
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
