/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface DatePickerProps {
  label?: string;
  name: string;
  value: string;
  onChange: (e: any) => void;
  required?: boolean;
  placeholder?: string;
}

export const CustomDatePicker = ({ label, name, value, onChange, required, placeholder = "Pilih tanggal..." }: DatePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<'bottom' | 'top'>('bottom');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const today = new Date();
  
  const parseLocalDate = (str: string) => {
    if (!str) return today;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const initialDate = value ? parseLocalDate(value) : today;
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  const handleOpen = () => {
    const d = value ? parseLocalDate(value) : today;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setIsOpen(true);
  };

  useEffect(() => {
    if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const popupHeight = 320;
        
        let pos = 'bottom';
        if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
            pos = 'top';
        }
        
        setDropdownPos(pos as 'top' | 'bottom');
        setCoords({
            left: rect.left,
            top: pos === 'top' ? rect.top - popupHeight - 8 : rect.bottom + 8,
            width: Math.max(280, rect.width)
        });
    }
  }, [isOpen]);

  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const daysOfWeek = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  const getDaysArray = () => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const handleDayClick = (e: React.MouseEvent, day: number | null) => {
    e.stopPropagation();
    if (!day) return;
    const y = viewYear;
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange({ target: { name, value: `${y}-${m}-${d}` } });
    setIsOpen(false);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({length: 150}, (_, i) => currentYear - 100 + i);

  const displayValue = value ? parseLocalDate(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  return (
    <div className="relative">
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className={`flex items-center justify-between w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none transition-all ${isOpen ? 'border-primary ring-1 ring-primary/30 shadow-sm text-slate-900' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}
      >
        <span className={`truncate whitespace-nowrap ${!displayValue ? 'text-slate-400 font-medium' : ''}`}>
          {displayValue || placeholder}
        </span>
        <Icon name={"calendar" as any} size={16} className={`text-slate-400 shrink-0 transition-colors ${isOpen ? 'text-primary' : ''}`} />
      </button>

      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}></div>
          <div 
            className="fixed bg-white border border-slate-100 shadow-xl rounded-2xl p-4 z-[9999] animate-fadeIn"
            style={{ 
              top: coords.top, 
              left: coords.left, 
              width: coords.width,
              minHeight: '320px'
            }}
          >
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <button type="button" onClick={handlePrevMonth} className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-colors">
                <Icon name={"chevron-left" as any} size={16} />
              </button>
              <div className="flex items-center gap-2">
                <div className="relative inline-flex items-center">
                  <select 
                    value={viewMonth} 
                    onChange={(e) => setViewMonth(parseInt(e.target.value))}
                    className="appearance-none bg-transparent text-sm font-extrabold text-slate-800 pr-4 cursor-pointer focus:outline-none hover:text-primary z-10"
                  >
                    {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <Icon name={"chevron-down" as any} size={12} className="absolute right-0 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative inline-flex items-center">
                  <select 
                    value={viewYear} 
                    onChange={(e) => setViewYear(parseInt(e.target.value))}
                    className="appearance-none bg-transparent text-sm font-extrabold text-slate-800 pr-4 cursor-pointer focus:outline-none hover:text-primary z-10"
                  >
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <Icon name={"chevron-down" as any} size={12} className="absolute right-0 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <button type="button" onClick={handleNextMonth} className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-colors">
                <Icon name={"chevron-right" as any} size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {daysOfWeek.map(day => (
                <div key={day} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">{day}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {getDaysArray().map((day, idx) => {
                const isSelected = value && parseLocalDate(value).getDate() === day && parseLocalDate(value).getMonth() === viewMonth && parseLocalDate(value).getFullYear() === viewYear;
                const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                
                if (!day) return <div key={`empty-${idx}`} className="h-8"></div>;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => handleDayClick(e, day)}
                    className={`h-8 w-full rounded-lg text-xs font-medium flex items-center justify-center transition-all ${
                      isSelected ? 'bg-primary text-white shadow-md shadow-primary/40 font-bold scale-105' : 
                      isToday ? 'bg-blue-50 text-primary font-bold hover:bg-blue-100 ring-1 ring-primary/20' : 
                      'text-slate-700 hover:bg-slate-100 hover:text-primary'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
