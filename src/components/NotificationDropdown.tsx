import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './ui/Icon';
import { Employee } from '../types';

interface NotificationDropdownProps {
  employees: Employee[];
}

export function NotificationDropdown({ employees }: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  // Check for contracts expiring within 30 days
  const today = new Date();
  const next30Days = new Date(today);
  next30Days.setDate(today.getDate() + 30);

  const expiringContracts = employees.filter(emp => {
    if (!emp.isActive || !emp.contractEnd) return false;
    const endDate = new Date(emp.contractEnd);
    return endDate >= today && endDate <= next30Days;
  });

  // Also include already expired contracts? The requirement says "nearing expiration (e.g. 30 days before)". 
  // Let's include expired up to some days or just keep it simple >= today. Let's include contracts that are expired but active.
  const allNotifs = employees.filter(emp => {
    if (!emp.isActive || !emp.contractEnd) return false;
    const endDate = new Date(emp.contractEnd);
    // expiring in next 30 days or already expired but still marked active
    return endDate <= next30Days;
  }).sort((a, b) => new Date(a.contractEnd!).getTime() - new Date(b.contractEnd!).getTime());

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors relative"
      >
        <Icon name="bell" size={20} />
        {allNotifs.length > 0 && (
          <span className="absolute top-2.5 right-2 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-[120%] right-0 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-fadeIn">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-sm">Notifikasi</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{allNotifs.length}</span>
          </div>
          <div className="max-h-[350px] overflow-y-auto custom-scrollbar p-0">
            {allNotifs.length > 0 ? (
              <div className="flex flex-col divide-y divide-slate-50">
                {allNotifs.map((emp) => {
                  const endDate = new Date(emp.contractEnd!);
                  const diffTime = endDate.getTime() - today.getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  const isExpired = diffDays < 0;
                  
                  return (
                    <div key={emp.id} className="p-4 hover:bg-slate-50 transition-colors flex gap-3 items-start">
                      <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isExpired ? 'bg-rose-100 text-rose-600' : 'bg-orange-100 text-orange-600'}`}>
                        <Icon name="alert-circle" size={16} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] text-slate-900 font-bold leading-tight mb-1">Kontrak {isExpired ? 'Berakhir' : 'Akan Berakhir'}</p>
                        <p className="text-[12px] text-slate-600 leading-snug">
                          Kontrak <b>{emp.name}</b> {isExpired ? 'telah berakhir' : 'akan berakhir dalam'} <span className={`font-bold ${isExpired ? 'text-rose-600' : 'text-orange-600'}`}>{isExpired ? `${Math.abs(diffDays)} hari yang lalu` : `${diffDays} hari`}</span>.
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1.5 font-medium">{endDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                  <Icon name="bell" size={24} />
                </div>
                <span>Tidak ada notifikasi.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
