import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { SearchableSelect } from './ui/FormSelect';
import { QRCodeSVG } from 'qrcode.react';
import QRCode from 'qrcode';
import { Employee } from '../types';
import { db, handleFirestoreError, OperationType, logActivity } from '../firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';

interface AssetHistory {
  id: string;
  employeeId: string;
  employeeNameSnapshot: string;
  dateAssigned: string;
  dateReturned?: string;
  notes?: string;
}

interface Asset {
  id: string;
  barcode: string;
  name: string;
  category: string;
  status: 'Tersedia' | 'Dipakai' | 'Rusak';
  assignedToId?: string; // Employee ID
  purchaseDate: string;
  history: AssetHistory[];
}

interface InventoryContentProps {
  employees: Employee[];
}

export function InventoryContent({ employees }: InventoryContentProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [isScanResultModalOpen, setIsScanResultModalOpen] = useState(false);
  
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isReturnConfirmOpen, setIsReturnConfirmOpen] = useState(false);
  const [editAssetData, setEditAssetData] = useState<Asset | null>(null);
  const [isDeleteHistoryConfirmOpen, setIsDeleteHistoryConfirmOpen] = useState(false);
  const [historyToDelete, setHistoryToDelete] = useState<{assetId: string, historyId: string} | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const q = collection(db, 'assets');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const asts: Asset[] = [];
      snapshot.forEach((doc) => {
        asts.push({ id: doc.id, ...doc.data() } as Asset);
      });
      setAssets(asts);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'assets');
    });
    return () => unsubscribe();
  }, []);


  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Semua');
  const [filterStatus, setFilterStatus] = useState('Semua');
  const [filterDivision, setFilterDivision] = useState('Semua');
  
  // Form States for Assignment
  const [assignEmployeeId, setAssignEmployeeId] = useState('');
  
  // Form States for Add Asset
  const [newAssetData, setNewAssetData] = useState({
    name: '',
    category: 'Laptop',
    customCategory: '',
    purchaseDate: new Date().toISOString().split('T')[0]
  });

  const [editCustomCategory, setEditCustomCategory] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const scanBarcode = params.get('scan');
      if (scanBarcode) {
        const foundAsset = assets.find(a => a.barcode === scanBarcode);
        if (foundAsset) {
          setSelectedAsset(foundAsset);
          setIsScanResultModalOpen(true);
        }
        // Optional: remove standard URL param so it doesn't re-trigger on refresh
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [assets]);
  
  const handleOpenAssignModal = (asset: Asset) => {
    setSelectedAsset(asset);
    setAssignEmployeeId('');
    setIsAssignModalOpen(true);
  };
  
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !assignEmployeeId) return;
    
    const d = new Date();
    const todayStr = d.toISOString().split('T')[0];
    const targetEmployee = employees.find(emp => emp.id === assignEmployeeId);
    
    try {
      await updateDoc(doc(db, 'assets', selectedAsset.id), {
        status: 'Dipakai',
        assignedToId: assignEmployeeId,
        history: [
          ...selectedAsset.history,
          { id: Date.now().toString(), employeeId: assignEmployeeId, employeeNameSnapshot: targetEmployee?.name || 'Unknown', dateAssigned: todayStr, notes: 'Assigned via system' }
        ]
      });
      logActivity('Aset Didistribusikan', { aset: selectedAsset.name, penerima: targetEmployee?.name || 'Unknown' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `assets/${selectedAsset.id}`);
    }
    
    setIsAssignModalOpen(false);
  };

  const handleOpenEditModal = (asset: Asset) => {
    setEditAssetData(asset);
    if (!['Laptop', 'Komputer', 'Elektronik', 'Kendaraan', 'Furniture'].includes(asset.category)) {
      setEditCustomCategory(asset.category);
    } else {
      setEditCustomCategory('');
    }
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAssetData) return;
    const finalCategory = (editAssetData.category === 'Lainnya' || !['Laptop', 'Komputer', 'Elektronik', 'Kendaraan', 'Furniture'].includes(editAssetData.category)) ? editCustomCategory : editAssetData.category;
    
    try {
      const { id, ...data } = editAssetData;
      await updateDoc(doc(db, 'assets', id), { ...data, category: finalCategory });
      logActivity('Data Aset Diupdate', { aset: editAssetData.name });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `assets/${editAssetData.id}`);
    }
    
    setIsEditModalOpen(false);
  };

  const handleOpenDeleteConfirm = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (selectedAsset) {
      try {
        await deleteDoc(doc(db, 'assets', selectedAsset.id));
        logActivity('Data Aset Dihapus', { aset: selectedAsset.name });
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `assets/${selectedAsset.id}`);
      }
      setIsDeleteConfirmOpen(false);
      setSelectedAsset(null);
    }
  };

  const handleOpenReturnConfirm = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsReturnConfirmOpen(true);
  };

  const handleReturnConfirm = async () => {
    if (!selectedAsset) return;
    const d = new Date();
    const todayStr = d.toISOString().split('T')[0];
    
    try {
      const updatedHistory = selectedAsset.history.map((h, i) => {
        if (i === selectedAsset.history.length - 1) {
          return { ...h, dateReturned: todayStr };
        }
        return h;
      });
      await updateDoc(doc(db, 'assets', selectedAsset.id), {
        status: 'Tersedia',
        assignedToId: null as unknown as string,
        history: updatedHistory
      });
      logActivity('Aset Dikembalikan', { aset: selectedAsset.name });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `assets/${selectedAsset.id}`);
    }

    setIsReturnConfirmOpen(false);
    setSelectedAsset(null);
  };

  const handleDeleteHistoryConfirm = async () => {
    if (!historyToDelete) return;
    
    const targetAsset = assets.find(a => a.id === historyToDelete.assetId);
    if (targetAsset) {
      let isRemovingActiveHolder = false;
      const newHistory = targetAsset.history.filter(h => {
        if (h.id === historyToDelete.historyId) {
          if (!h.dateReturned) isRemovingActiveHolder = true;
          return false;
        }
        return true;
      });

      // Update selected asset state properly to reflect modal
      if (selectedAsset && selectedAsset.id === targetAsset.id) {
        setSelectedAsset({
          ...targetAsset,
          history: newHistory,
          ...(isRemovingActiveHolder ? { status: 'Tersedia', assignedToId: null as unknown as string } : {})
        });
      }

      try {
        await updateDoc(doc(db, 'assets', targetAsset.id), {
          history: newHistory,
          ...(isRemovingActiveHolder ? { status: 'Tersedia', assignedToId: null as unknown as string } : {})
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `assets/${targetAsset.id}`);
      }
    }
    
    setIsDeleteHistoryConfirmOpen(false);
    setHistoryToDelete(null);
  };

  const handleShowBarcode = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsBarcodeModalOpen(true);
  };

  const handleDownloadSticker = (asset: Asset) => {
    const qrUrl = `${window.location.origin}${window.location.pathname}?scan=${asset.barcode}`;
    
    QRCode.toString(qrUrl, { type: 'svg', margin: 1, width: 80, color: { dark: '#000000', light: '#ffffff' } }, (err, qrSvg) => {
      if (err) {
        console.error('Error generating QR code:', err);
        return;
      }
      
      const qrSvgAdjusted = qrSvg.replace('<svg', '<svg x="15" y="30"');
      
      const svgContent = `
        <svg width="320" height="140" xmlns="http://www.w3.org/2000/svg">
          <rect width="320" height="140" fill="white" rx="15" />
          <rect width="320" height="140" fill="none" stroke="#000000" stroke-width="4" rx="15" />
          
          ${qrSvgAdjusted}
          
          <text x="110" y="45" font-family="sans-serif" font-size="20" font-weight="bold" fill="#000000">${asset.name}</text>
          <text x="110" y="70" font-family="sans-serif" font-size="14" fill="#000000">${asset.category}</text>
          <text x="110" y="105" font-family="monospace" font-size="16" font-weight="bold" fill="#000000">${asset.barcode}</text>
        </svg>
      `;

      const blob = new Blob([svgContent], {type: 'image/svg+xml;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stiker-${asset.barcode}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    const newId = `AST-${String(assets.length + 1).padStart(3, '0')}`;
    const newBarcode = `INV-${new Date().getFullYear()}-${String(assets.length + 1).padStart(4, '0')}`;
    const newAsset: Asset = {
      id: newId,
      barcode: newBarcode,
      name: newAssetData.name,
      category: newAssetData.category === 'Lainnya' ? newAssetData.customCategory : newAssetData.category,
      purchaseDate: newAssetData.purchaseDate,
      status: 'Tersedia',
      history: []
    };
    
    try {
      const { id, ...data } = newAsset;
      await setDoc(doc(db, 'assets', id), data);
      logActivity('Data Aset Ditambahkan', { aset: newAsset.name });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `assets/${newId}`);
    }
    
    setIsAddModalOpen(false);
    setNewAssetData({ name: '', category: 'Laptop', customCategory: '', purchaseDate: new Date().toISOString().split('T')[0] });
  };

  const getAssetDepartment = (asset: Asset) => {
    if (asset.assignedToId) {
      const emp = employees.find(e => e.id === asset.assignedToId);
      if (emp) return emp.dept;
    }
    if (asset.category === 'Laptop' || asset.category === 'Komputer' || asset.category === 'Elektronik') return 'IT';
    if (asset.category === 'Kendaraan') return 'Operasional';
    return 'Umum';
  };

  const getEmployeeName = (empId?: string, fallback?: string) => {
    if (!empId) return fallback || '';
    const emp = employees.find(e => e.id === empId);
    return emp ? emp.name : (fallback || 'Karyawan Dihapus');
  };

  const uniqueDivisionsCount = new Set(assets.map(getAssetDepartment)).size;

  const uniqueCategories = Array.from(new Set(assets.map(a => a.category)));
  const uniqueDivisions = Array.from(new Set(assets.map(getAssetDepartment)));

  const filteredAssets = assets.filter(asset => {
    const pemakaiName = getEmployeeName(asset.assignedToEmpId, asset.currentAssigneeInfo).toLowerCase();
    const matchSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        asset.barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        pemakaiName.includes(searchQuery.toLowerCase());
    const matchCategory = filterCategory === 'Semua' || asset.category === filterCategory;
    const matchStatus = filterStatus === 'Semua' || asset.status === filterStatus;
    const matchDivision = filterDivision === 'Semua' || getAssetDepartment(asset) === filterDivision;
    
    return matchSearch && matchCategory && matchStatus && matchDivision;
  });

  const isFilterActive = filterCategory !== 'Semua' || filterStatus !== 'Semua' || filterDivision !== 'Semua' || searchQuery !== '';

  const handleClearFilter = () => {
    setFilterCategory('Semua');
    setFilterStatus('Semua');
    setFilterDivision('Semua');
    setSearchQuery('');
  };

  return (
    <div className="p-8 h-full overflow-y-auto hide-scrollbar animate-fadeIn">
      <div className="w-full mx-auto">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col gap-6 mb-6">
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 w-full">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-800">Inventory & Assets</h2>
              <p className="text-sm text-slate-500 mt-1">Kelola barang inventaris dan distribusinya ke karyawan.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2 mr-2"
              >
                <Icon name="plus" size={16} />
                Input Data
              </button>
  
              {isFilterActive && (
                <button onClick={handleClearFilter} className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5 mr-1">
                  <Icon name="x" size={12} /> Hapus Filter
                </button>
              )}
              
              {/* Filter Category */}
              <div className="relative">
                <select 
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[140px]"
                >
                  <option value="Semua">Semua Kategori</option>
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Icon name="chevron-down" size={16} />
                </div>
              </div>
  
              {/* Filter Status */}
              <div className="relative">
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[130px]"
                >
                  <option value="Semua">Semua Status</option>
                  <option value="Tersedia">Tersedia</option>
                  <option value="Dipakai">Dipakai</option>
                  <option value="Rusak">Rusak</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Icon name="chevron-down" size={16} />
                </div>
              </div>
  
              {/* Filter Division */}
              <div className="relative">
                <select 
                  value={filterDivision}
                  onChange={(e) => setFilterDivision(e.target.value)}
                  className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[140px]"
                >
                  <option value="Semua">Semua Divisi</option>
                  {uniqueDivisions.map(div => (
                    <option key={div} value={div}>{div}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Icon name="chevron-down" size={16} />
                </div>
              </div>
              
              {/* Search */}
              <div className="relative ml-auto">
                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Cari aset, barcode, atau nama pemakai..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 outline-none w-48 transition-all"
                />
              </div>
            </div>
          </div>
  
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Card 1 - Blue */}
            <div className="relative bg-blue-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-blue-100/50 group cursor-default">
              <div className="relative z-10 flex justify-between items-center w-full">
                <div className="flex flex-col justify-center">
                  <p className="text-[10px] font-black text-blue-500 mb-1 uppercase tracking-widest">Total Aset</p>
                  <p className="text-[32px] leading-none font-black text-blue-950">{assets.length}</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-blue-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                  <Icon name="box" size={20} strokeWidth={2.5} />
                </div>
              </div>
              <div className="absolute bottom-0 right-0 w-10 h-10 bg-blue-500 origin-bottom-right transition-transform group-hover:scale-110" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
            </div>
  
            {/* Card 2 - Emerald */}
            <div className="relative bg-emerald-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-emerald-100/50 group cursor-default">
              <div className="relative z-10 flex justify-between items-center w-full">
                <div className="flex flex-col justify-center">
                  <p className="text-[10px] font-black text-emerald-500 mb-1 uppercase tracking-widest">Tersedia</p>
                  <p className="text-[32px] leading-none font-black text-emerald-950">{assets.filter(a => a.status === 'Tersedia').length}</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-emerald-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                  <Icon name="check-circle" size={20} strokeWidth={2.5} />
                </div>
              </div>
              <div className="absolute bottom-0 right-0 w-10 h-10 bg-emerald-500 origin-bottom-right transition-transform group-hover:scale-110" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
            </div>
  
            {/* Card 3 - Purple */}
            <div className="relative bg-purple-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-purple-100/50 group cursor-default">
              <div className="relative z-10 flex justify-between items-center w-full">
                <div className="flex flex-col justify-center">
                  <p className="text-[10px] font-black text-purple-500 mb-1 uppercase tracking-widest">Sedang Dipakai</p>
                  <p className="text-[32px] leading-none font-black text-purple-950">{assets.filter(a => a.status === 'Dipakai').length}</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-purple-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                  <Icon name="user" size={20} strokeWidth={2.5} />
                </div>
              </div>
              <div className="absolute bottom-0 right-0 w-10 h-10 bg-purple-500 origin-bottom-right transition-transform group-hover:scale-110" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
            </div>
  
            {/* Card 4 - Rose */}
            <div className="relative bg-rose-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-sm hover:shadow-md border border-rose-100/50 group cursor-default">
              <div className="relative z-10 flex justify-between items-center w-full">
                <div className="flex flex-col justify-center">
                  <p className="text-[10px] font-black text-rose-500 mb-1 uppercase tracking-widest">Jumlah Divisi</p>
                  <p className="text-[32px] leading-none font-black text-rose-950">{uniqueDivisionsCount}</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-rose-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                  <Icon name="briefcase" size={20} strokeWidth={2.5} />
                </div>
              </div>
              <div className="absolute bottom-0 right-0 w-10 h-10 bg-rose-500 origin-bottom-right transition-transform group-hover:scale-110" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}></div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm">
          <div className="w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider rounded-tl-3xl">Barcode ID</th>
                  <th className="py-4 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Stiker</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Barang / Aset</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Kategori</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Divisi</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Pemakai (Karyawan)</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Histori</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right rounded-tr-3xl">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500 font-medium">
                      Tidak ada aset yang sesuai dengan filter
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((item, index) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className={`py-4 px-6 ${index === filteredAssets.length - 1 ? 'rounded-bl-3xl' : ''}`}>
                      <div className="flex items-center gap-2 cursor-pointer text-blue-600 hover:text-blue-800 transition-colors" onClick={() => handleShowBarcode(item)}>
                        <Icon name="qr-code" size={18} />
                        <span className="text-sm font-mono font-bold">{item.barcode}</span>
                      </div>
                    </td>
                    <td className="py-4 px-3 text-center">
                      <button 
                        title="Download Barcode Stiker"
                        className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 rounded-md transition-colors inline-flex items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadSticker(item);
                        }}
                      >
                        <Icon name="download" size={16} />
                      </button>
                    </td>
                    <td className="py-4 px-6 text-sm font-bold text-slate-800">{item.name}</td>
                    <td className="py-4 px-6 text-sm text-slate-600">
                      <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-[11px] font-bold">
                        {item.category}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm font-bold text-slate-700">
                      {getAssetDepartment(item)}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                        item.status === 'Tersedia' ? 'bg-emerald-100 text-emerald-700' :
                        item.status === 'Dipakai' ? 'bg-blue-100 text-blue-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {item.assignedToId ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-[10px]">
                            {getEmployeeName(item.assignedToId).substring(0, 2).toUpperCase()}
                          </div>
                          <span className="font-bold text-slate-700">{getEmployeeName(item.assignedToId)}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Belum dialokasikan</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <button 
                        title="Lihat Histori"
                        className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 rounded-md transition-colors inline-flex items-center justify-center"
                        onClick={() => {
                          setSelectedAsset(item);
                          setIsScanResultModalOpen(true);
                        }}
                      >
                        <Icon name="clock" size={16} />
                      </button>
                    </td>
                    <td className={`py-4 px-6 text-right relative ${index === filteredAssets.length - 1 ? 'rounded-br-3xl' : ''}`}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(openDropdownId === item.id ? null : item.id);
                        }}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors inline-flex items-center justify-center"
                      >
                        <Icon name="more-horizontal" size={20} />
                      </button>
                      
                      {openDropdownId === item.id && (
                        <div 
                          className="absolute right-6 top-14 mt-1 w-40 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-20 text-left"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              setOpenDropdownId(null);
                              handleOpenEditModal(item);
                            }}
                            className="w-full px-4 py-2 text-left text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"
                          >
                            <Icon name="edit" size={16} />
                            Edit Aset
                          </button>
                          
                          {item.status === 'Tersedia' ? (
                            <button
                              onClick={() => {
                                setOpenDropdownId(null);
                                handleOpenAssignModal(item);
                              }}
                              className="w-full px-4 py-2 text-left text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"
                            >
                              <Icon name="user-check" size={16} />
                              Tugaskan
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setOpenDropdownId(null);
                                handleOpenReturnConfirm(item);
                              }}
                              className="w-full px-4 py-2 text-left text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"
                            >
                              <Icon name="rotate-ccw" size={16} />
                              Kembalikan
                            </button>
                          )}

                          <div className="border-t border-slate-100 my-1"></div>
                          
                          <button
                            onClick={() => {
                              setOpenDropdownId(null);
                              handleOpenDeleteConfirm(item);
                            }}
                            className="w-full px-4 py-2 text-left text-sm font-bold text-rose-500 hover:bg-rose-50 flex items-center gap-2 transition-colors"
                          >
                            <Icon name="trash-2" size={16} />
                            Hapus
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Barcode Display Modal */}
      {isBarcodeModalOpen && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl relative">
            <button 
              onClick={() => setIsBarcodeModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
            >
              <Icon name="x-circle" size={20} />
            </button>
            <div className="p-8 flex flex-col items-center justify-center text-center">
              <h3 className="font-bold text-slate-800 text-xl mb-1">{selectedAsset.name}</h3>
              <p className="text-sm text-slate-500 mb-6">Scan Barcode untuk melihat detail & histori</p>
              
              {/* Real Barcode Visual */}
              <div className="bg-white border-2 border-slate-200 p-6 rounded-2xl mb-4 flex flex-col items-center justify-center text-slate-800">
                <QRCodeSVG value={`${window.location.origin}${window.location.pathname}?scan=${selectedAsset.barcode}`} size={150} level="H" />
                <span className="font-mono font-black text-sm tracking-widest mt-4">{selectedAsset.barcode}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simulated Web View of Asset (After Scanning) */}
      {isScanResultModalOpen && selectedAsset && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative h-[80vh]">
            <div className="bg-slate-800 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="layout" size={18} />
                <span className="font-bold text-sm tracking-wide">Detail Aset</span>
              </div>
              <button onClick={() => setIsScanResultModalOpen(false)} className="text-slate-300 hover:text-white">
                <Icon name="x-circle" size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 mb-1">{selectedAsset.name}</h2>
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 font-mono">
                    {selectedAsset.barcode}
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                  selectedAsset.status === 'Tersedia' ? 'bg-emerald-100 text-emerald-700' :
                  selectedAsset.status === 'Dipakai' ? 'bg-blue-100 text-blue-700' :
                  'bg-rose-100 text-rose-700'
                }`}>
                  {selectedAsset.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-bold mb-1 uppercase tracking-wider">Kategori</div>
                  <div className="text-sm font-bold text-slate-800">{selectedAsset.category}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-bold mb-1 uppercase tracking-wider">Tgl Pembelian</div>
                  <div className="text-sm font-bold text-slate-800">{selectedAsset.purchaseDate}</div>
                </div>
              </div>

              <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
                <Icon name="list" size={18} className="text-slate-400" />
                Histori Pemakaian
              </h3>
              
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {selectedAsset.history.length === 0 ? (
                  <div className="text-center p-6 text-sm text-slate-500 italic border border-slate-100 rounded-xl bg-slate-50 relative z-10">
                    Belum ada histori pemakaian.
                  </div>
                ) : (
                  selectedAsset.history.slice().reverse().map((hist, idx) => (
                    <div key={hist.id} className="relative flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-white border-4 border-slate-100 flex-shrink-0 flex items-center justify-center z-10 text-slate-400">
                        {idx === 0 && !hist.dateReturned ? (
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                        )}
                      </div>
                      <div className={`flex-1 rounded-xl p-4 border ${idx === 0 && !hist.dateReturned ? 'border-blue-200 bg-blue-50/50' : 'border-slate-100 bg-white shadow-sm'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-slate-800 text-sm">{getEmployeeName(hist.employeeId, hist.employeeNameSnapshot)}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              {hist.dateAssigned}
                            </span>
                            <button
                              title="Hapus Histori"
                              className="text-slate-400 hover:text-rose-500 transition-colors"
                              onClick={() => {
                                setHistoryToDelete({ assetId: selectedAsset.id, historyId: hist.id });
                                setIsDeleteHistoryConfirmOpen(true);
                              }}
                            >
                              <Icon name="x" size={16} strokeWidth={3} />
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-slate-600">
                          <span className="font-medium">Status: </span>
                          {hist.dateReturned ? (
                            <span className="text-emerald-600">Dikembalikan pada {hist.dateReturned}</span>
                          ) : (
                            <span className="text-blue-600 font-bold">Sedang memegang aset</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {isAssignModalOpen && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-lg">Tugaskan Aset</h3>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x-circle" size={20} />
              </button>
            </div>
            <form onSubmit={handleAssignSubmit} className="p-6">
              <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="text-xs text-slate-500 font-bold mb-1">ASET TERPILIH</div>
                <div className="font-bold text-slate-800">{selectedAsset.name}</div>
                <div className="font-mono text-xs text-slate-600 mt-1">{selectedAsset.barcode}</div>
              </div>

              <div className="space-y-4">
                <div>
                  <SearchableSelect
                    label="Pilih Karyawan"
                    placeholder="-- Pilih Karyawan --"
                    value={assignEmployeeId}
                    onChange={(val) => setAssignEmployeeId(val)}
                    options={employees.filter(e => e.isActive).map(emp => ({
                      value: emp.id,
                      label: `${emp.name} (${emp.pos})`
                    }))}
                    required
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={!assignEmployeeId}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition-all"
                >
                  Simpan Penugasan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-lg">Input Data Aset</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x-circle" size={20} />
              </button>
            </div>
            <form onSubmit={handleAddAsset} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Nama Barang / Aset</label>
                  <input
                    type="text"
                    required
                    value={newAssetData.name}
                    onChange={(e) => setNewAssetData({...newAssetData, name: e.target.value})}
                    placeholder="Contoh: MacBook Pro M3"
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Kategori</label>
                  <select 
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium appearance-none"
                    value={['Laptop', 'Komputer', 'Elektronik', 'Kendaraan', 'Furniture'].includes(newAssetData.category) ? newAssetData.category : 'Lainnya'}
                    onChange={(e) => {
                      if (e.target.value === 'Lainnya') {
                        setNewAssetData({...newAssetData, category: 'Lainnya', customCategory: ''});
                      } else {
                        setNewAssetData({...newAssetData, category: e.target.value});
                      }
                    }}
                  >
                    <option value="Laptop">Laptop</option>
                    <option value="Komputer">Komputer</option>
                    <option value="Elektronik">Elektronik</option>
                    <option value="Kendaraan">Kendaraan</option>
                    <option value="Furniture">Furniture</option>
                    <option value="Lainnya">Lainnya (Ketik Manual)</option>
                  </select>
                  {newAssetData.category === 'Lainnya' && (
                    <input
                      type="text"
                      required
                      placeholder="Masukkan kategori lain..."
                      value={newAssetData.customCategory}
                      onChange={(e) => setNewAssetData({...newAssetData, customCategory: e.target.value})}
                      className="w-full mt-3 bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Tanggal Pembelian</label>
                  <input
                    type="date"
                    required
                    value={newAssetData.purchaseDate}
                    onChange={(e) => setNewAssetData({...newAssetData, purchaseDate: e.target.value})}
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={!newAssetData.name}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition-all"
                >
                  Simpan Aset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && editAssetData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-lg">Edit Data Aset</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x-circle" size={20} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Nama Barang / Aset</label>
                  <input
                    type="text"
                    required
                    value={editAssetData.name}
                    onChange={(e) => setEditAssetData({...editAssetData, name: e.target.value})}
                    placeholder="Contoh: MacBook Pro M3"
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Kategori</label>
                  <select 
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium appearance-none"
                    value={['Laptop', 'Komputer', 'Elektronik', 'Kendaraan', 'Furniture'].includes(editAssetData.category) ? editAssetData.category : 'Lainnya'}
                    onChange={(e) => {
                      if (e.target.value === 'Lainnya') {
                        setEditAssetData({...editAssetData, category: 'Lainnya'});
                        setEditCustomCategory('');
                      } else {
                        setEditAssetData({...editAssetData, category: e.target.value});
                      }
                    }}
                  >
                    <option value="Laptop">Laptop</option>
                    <option value="Komputer">Komputer</option>
                    <option value="Elektronik">Elektronik</option>
                    <option value="Kendaraan">Kendaraan</option>
                    <option value="Furniture">Furniture</option>
                    <option value="Lainnya">Lainnya (Ketik Manual)</option>
                  </select>
                  {(!['Laptop', 'Komputer', 'Elektronik', 'Kendaraan', 'Furniture'].includes(editAssetData.category) || editAssetData.category === 'Lainnya') && (
                    <input
                      type="text"
                      required
                      placeholder="Masukkan kategori lain..."
                      value={editCustomCategory}
                      onChange={(e) => setEditCustomCategory(e.target.value)}
                      className="w-full mt-3 bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Tanggal Pembelian</label>
                  <input
                    type="date"
                    required
                    value={editAssetData.purchaseDate}
                    onChange={(e) => setEditAssetData({...editAssetData, purchaseDate: e.target.value})}
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={!editAssetData.name}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition-all"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {isDeleteConfirmOpen && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl relative p-6 text-center">
            <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="alert-triangle" size={32} />
            </div>
            <h3 className="font-bold text-slate-800 text-xl mb-2">Hapus Aset?</h3>
            <p className="text-sm text-slate-500 mb-6">
              Anda yakin ingin menghapus <strong>{selectedAsset.name}</strong> dengan barcode <strong>{selectedAsset.barcode}</strong>? Data ini beserta riwayat pemakaiannya akan dihapus permanen.
            </p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="flex-1 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={handleDeleteConfirm}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Confirm Modal */}
      {isReturnConfirmOpen && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl relative p-6 text-center">
            <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="rotate-ccw" size={32} />
            </div>
            <h3 className="font-bold text-slate-800 text-xl mb-2">Kembalikan Aset?</h3>
            <p className="text-sm text-slate-500 mb-6">
              Anda yakin ingin menandai <strong>{selectedAsset.name}</strong> telah dikembalikan oleh <strong>{getEmployeeName(selectedAsset.assignedToId)}</strong>?
            </p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => setIsReturnConfirmOpen(false)}
                className="flex-1 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                Batal
              </button>
              <button 
                onClick={handleReturnConfirm}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all"
              >
                Ya, Kembalikan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete History Confirm Modal */}
      {isDeleteHistoryConfirmOpen && historyToDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl relative p-6 text-center">
            <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="alert-triangle" size={32} />
            </div>
            <h3 className="font-bold text-slate-800 text-xl mb-2">Hapus Histori?</h3>
            <p className="text-sm text-slate-500 mb-6">
              Apakah Anda yakin ingin menghapus catatan histori ini? Jika status masih belum dikembalikan, status aset juga akan di-reset menjadi <strong>Tersedia</strong>.
            </p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => {
                  setIsDeleteHistoryConfirmOpen(false);
                  setHistoryToDelete(null);
                }}
                className="flex-1 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={handleDeleteHistoryConfirm}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
