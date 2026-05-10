/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface Option {
  value: string;
  label: string;
}

interface FormSelectProps {
  label?: string;
  name: string;
  value: string;
  options: (string | Option)[];
  onChange: (e: any) => void;
  required?: boolean;
}

export const FormSelect = ({ label, name, value, options, onChange, required }: FormSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const [dropdownPos, setDropdownPos] = useState<'bottom' | 'top'>('bottom');
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const popupHeight = Math.min(options.length * 40 + 20, 240); // Estimate max height 240
        
        let pos = 'bottom';
        if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
            pos = 'top';
        }
        
        setDropdownPos(pos as 'top' | 'bottom');
        setCoords({
            left: rect.left,
            top: pos === 'top' ? rect.top - popupHeight - 8 : rect.bottom + 8,
            width: rect.width
        });
    }
  }, [isOpen, options.length]);

  return (
    <div>
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-between w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none transition-all ${isOpen ? 'border-primary ring-1 ring-primary/30 shadow-sm text-slate-900' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}
        >
          <span className="truncate whitespace-nowrap">{value || 'Pilih...'}</span>
          <Icon name="chevron-down" size={16} className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}></div>
            <div 
              className="fixed bg-white border border-slate-100 shadow-xl rounded-xl py-1.5 z-[9999] max-h-[240px] overflow-y-auto animate-fadeIn"
              style={{ top: coords.top, left: coords.left, width: coords.width }}
            >
              {options.map((opt) => {
                const optValue = typeof opt === 'object' ? opt.value : opt;
                const optLabel = typeof opt === 'object' ? opt.label : opt;
                return (
                  <button
                    key={optValue}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange({ target: { name, value: optValue } });
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-slate-50 ${value === optValue ? 'text-primary font-bold bg-blue-50/50' : 'text-slate-700 font-medium'}`}
                  >
                    {optLabel}
                  </button>
                )
              })}
            </div>
          </>,
          document.body
        )}
      </div>
    </div>
  );
};

export const SearchableSelect = ({ label, value, options, onChange, placeholder = 'Pilih...', required }: { label?: string, value: string, options: {value: string, label: string}[], onChange: (val: string) => void, placeholder?: string, required?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const popupHeight = Math.min(options.length * 40 + 60, 280); // Estimate max height
        
        let pos = 'bottom';
        if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
            pos = 'top';
        }
        
        setCoords({
            left: rect.left,
            top: pos === 'top' ? rect.top - popupHeight - 8 : rect.bottom + 8,
            width: rect.width
        });
        
        // Focus input after slight delay to ensure portal is rendered
        setTimeout(() => {
            inputRef.current?.focus();
        }, 50);
    } else {
        setSearch(''); // Reset search when closed
    }
  }, [isOpen, options.length]);

  const filteredOptions = options.filter(opt => opt.label.toLowerCase().includes(search.toLowerCase()));

  const selectedLabel = options.find(o => o.value === value)?.label;

  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-between w-full px-4 py-2 bg-white border rounded-xl text-[13px] font-semibold focus:outline-none transition-all ${isOpen ? 'border-primary ring-4 ring-blue-100/50 shadow-sm text-slate-800' : 'border-slate-200 text-slate-800 hover:border-slate-300'}`}
        >
          <span className="truncate whitespace-nowrap">{selectedLabel || placeholder}</span>
          <Icon name="chevron-down" size={16} className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}></div>
            <div 
              className="fixed bg-white border border-slate-100 shadow-xl rounded-xl py-2 z-[9999] max-h-[280px] flex flex-col animate-fadeIn"
              style={{ top: coords.top, left: coords.left, width: coords.width }}
            >
              <div className="px-3 pb-2 border-b border-slate-100 shrink-0 relative">
                <Icon name="search" size={14} className="absolute left-6 top-1/2 -translate-y-[calc(50%+4px)] text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Cari..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-medium focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
                />
              </div>
              <div className="overflow-y-auto flex-1 py-1">
                {filteredOptions.length > 0 ? filteredOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-[13px] transition-colors hover:bg-slate-50 ${value === opt.value ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700 font-semibold'}`}
                  >
                    {opt.label}
                  </button>
                )) : (
                  <div className="px-4 py-3 text-[13px] text-slate-500 text-center font-medium">Tidak ada hasil</div>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
      </div>
    </div>
  );
};

export const CompactFormSelect = ({ name, value, options, onChange }: Omit<FormSelectProps, 'label' | 'required'>) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const [dropdownPos, setDropdownPos] = useState<'bottom' | 'top'>('bottom');
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const popupHeight = Math.min(options.length * 32 + 10, 160); // Estimate max height 160
        
        let pos = 'bottom';
        if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
            pos = 'top';
        }
        
        setDropdownPos(pos as 'top' | 'bottom');
        setCoords({
            left: rect.left,
            top: pos === 'top' ? rect.top - popupHeight - 4 : rect.bottom + 4,
            width: rect.width
        });
    }
  }, [isOpen, options.length]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className={`flex items-center justify-between w-full text-[11px] font-bold bg-slate-50 border rounded-md px-2 py-1.5 focus:outline-none transition-all ${isOpen ? 'border-primary ring-1 ring-primary/30 text-slate-900 shadow-sm' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
      >
        <span className="truncate">{value || 'Pilih...'}</span>
        <Icon name="chevron-down" size={12} className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}></div>
          <div 
            className="fixed bg-white border border-slate-200 shadow-xl rounded-md py-1 z-[9999] max-h-[160px] overflow-y-auto animate-fadeIn"
            style={{ top: coords.top, left: coords.left, width: coords.width }}
          >
            {options.map((opt) => {
              const optValue = typeof opt === 'object' ? opt.value : opt;
              const optLabel = typeof opt === 'object' ? opt.label : opt;
              return (
                <button
                  key={optValue}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ target: { name, value: optValue } });
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-bold transition-colors hover:bg-slate-50 ${value === optValue ? 'text-primary bg-blue-50/50' : 'text-slate-600'}`}
                >
                  {optLabel}
                </button>
              )
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
