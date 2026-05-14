import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export function ManagerSelect({
  value,
  onChange,
  employees,
  currentEmpId,
  disabled
}: {
  value: string;
  onChange: (val: string) => void;
  employees: any[];
  currentEmpId: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPos, setNewPos] = useState('');
  const [newDept, setNewDept] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && wrapperRef.current.contains(event.target as Node)) {
        return;
      }
      if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
      setIsAdding(false);
    }
    
    function handleScroll(event: Event) {
      if (isOpen && event.target instanceof Node) {
        if (!dropdownRef.current?.contains(event.target)) {
          setIsOpen(false);
          setIsAdding(false);
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      
      // Calculate position
      let left = rect.right - 300; // default right-aligned
      // If going off screen left, align to the left side of the screen or element
      if (left < 10) left = rect.left;
      
      setCoords({
        top: rect.bottom + window.scrollY + 4,
        left: left + window.scrollX,
      });
    }
  }, [isOpen]);

  // Collect external managers from existing employees
  const externalManagers = React.useMemo(() => {
    const exts = new Map<string, { id: string, name: string, pos: string, isExternal: boolean }>();
    employees.forEach(e => {
      if (e.managerId && e.managerId.startsWith('__EXT__::')) {
        const parts = e.managerId.split('::');
        exts.set(e.managerId, { id: e.managerId, name: parts[1] || 'Unknown', pos: parts[2] || '', isExternal: true });
      }
    });
    return Array.from(exts.values());
  }, [employees]);

  const activeEmployees = employees
    .filter(e => e.isActive && e.id !== currentEmpId)
    .map(e => ({ id: e.id, name: e.name, pos: e.pos, isExternal: e.isExternal || false }));

  const allOptions = [...activeEmployees, ...externalManagers];

  const filteredOptions = allOptions.filter(o => 
    o.name.toLowerCase().includes(search.toLowerCase()) || 
    (o.pos && o.pos.toLowerCase().includes(search.toLowerCase()))
  );

  const selectedOption = allOptions.find(o => o.id === value);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearch('');
  };

  const handleAddExternal = () => {
    if (!newName.trim()) return;
    const extId = `__EXT__::${newName.trim()}::${newPos.trim()}::${newDept.trim()}`;
    onChange(extId);
    setIsOpen(false);
    setIsAdding(false);
    setSearch('');
    setNewName('');
    setNewPos('');
    setNewDept('');
  };

  const dropdownContent = isOpen ? (
    <div 
      ref={dropdownRef}
      className="fixed z-[9999] w-[300px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col"
      style={{ top: coords.top, left: coords.left }}
    >
      {!isAdding ? (
        <>
          <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50 shrink-0">
            <Icon name="search" size={14} className="text-slate-400 ml-1" />
            <input 
              type="text" 
              placeholder="Cari nama / posisi..." 
              className="w-full bg-transparent border-none text-xs outline-none font-medium p-1"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1 p-1 min-h-[50px] max-h-[160px]">
            <div 
              className="px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              onClick={() => handleSelect('')}
            >
              -- Tidak ada Atasan --
            </div>
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div 
                  key={opt.id}
                  className="px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors flex flex-col"
                  onClick={() => handleSelect(opt.id)}
                >
                  <span className="font-bold">{opt.name} {opt.isExternal && <span className="text-[10px] text-blue-500 ml-1 bg-blue-50 px-1.5 py-0.5 rounded">Eksternal</span>}</span>
                  <span className="text-slate-500 text-[11px]">{opt.pos || '-'}</span>
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                Tidak ditemukan.
              </div>
            )}
          </div>
          <div className="p-2 border-t border-slate-100 bg-slate-50 shrink-0">
            <button 
              onClick={() => setIsAdding(true)}
              className="w-full py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors flex items-center justify-center gap-1"
            >
              <Icon name="plus" size={12} /> Tambah Atasan Eksternal
            </button>
          </div>
        </>
      ) : (
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <button 
              onClick={() => setIsAdding(false)}
              className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200"
            >
              <Icon name="arrow-left" size={12} />
            </button>
            <span className="text-xs font-bold text-slate-800">Tambah Atasan Eksternal</span>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Nama Atasan</label>
            <input 
              type="text" 
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Cth: Budi Santoso"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Posisi / Jabatan</label>
            <input 
              type="text" 
              value={newPos}
              onChange={e => setNewPos(e.target.value)}
              placeholder="Cth: Owner / Konsultan"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500 mb-2"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Departemen</label>
            <input 
              type="text" 
              value={newDept}
              onChange={e => setNewDept(e.target.value)}
              placeholder="Cth: Direksi"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500"
            />
          </div>
          <button 
            onClick={handleAddExternal}
            disabled={!newName.trim()}
            className="w-full py-2 mt-1 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Simpan & Pilih
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="relative w-full text-left" ref={wrapperRef}>
      <div 
        className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between min-h-[38px] ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100'}`}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
      >
        <span className="text-xs font-bold text-slate-700 truncate">
          {selectedOption ? `${selectedOption.name} (${selectedOption.pos || '-'}) ${selectedOption.isExternal ? '(Eksternal)' : ''}` : '-- Tidak ada Atasan --'}
        </span>
        <Icon name="chevron-down" size={14} className="text-slate-400 shrink-0" />
      </div>

      {isOpen && typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  );
}
