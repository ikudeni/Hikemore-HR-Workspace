import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './Icon';

interface DateRangePickerProps {
  startDate: string | null;
  endDate: string | null;
  onRangeSelect: (start: string | null, end: string | null) => void;
}

export const DateRangePicker = ({ startDate, endDate, onRangeSelect }: DateRangePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth());
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  const [tempStart, setTempStart] = useState<string | null>(startDate);
  const [tempEnd, setTempEnd] = useState<string | null>(endDate);
  
  const [selectingMonth, setSelectingMonth] = useState<'left' | 'right' | null>(null);
  const [tempYearLeft, setTempYearLeft] = useState(currentMonth.getFullYear());
  const [tempYearRight, setTempYearRight] = useState(currentMonth.getFullYear());

  useEffect(() => {
    setTempYearLeft(currentMonth.getFullYear());
    setTempYearRight(currentMonth.getFullYear()); // rightMonth's year is usually currentMonth or next, let's derive it
  }, [currentMonth]);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const rightEdge = window.innerWidth - rect.right;
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        right: Math.max(8, rightEdge)
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      return () => window.removeEventListener('resize', updatePosition);
    }
  }, [isOpen]);

  const toggleDropdown = () => {
    setTempStart(startDate);
    setTempEnd(endDate);
    setSelectingMonth(null);
    if (startDate) {
      const d = new Date(startDate);
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth()));
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && 
          containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const formatDateLabel = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  
  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }).toUpperCase();
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handleDateClick = (calMonth: Date, day: number) => {
    const year = calMonth.getFullYear();
    const month = (calMonth.getMonth() + 1).toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    const fullDate = `${year}-${month}-${dayStr}`;

    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(fullDate);
      setTempEnd(null);
    } else {
      if (fullDate >= tempStart) {
        setTempEnd(fullDate);
      } else {
        setTempStart(fullDate);
        setTempEnd(null);
      }
    }
  };

  const handleApply = () => {
    onRangeSelect(tempStart, tempEnd);
    setIsOpen(false);
  };

  const handleReset = () => {
    setTempStart(null);
    setTempEnd(null);
  };

  const renderDays = (calMonth: Date) => {
    const days = [];
    const firstDay = getFirstDayOfMonth(calMonth.getFullYear(), calMonth.getMonth());
    const totalDays = getDaysInMonth(calMonth.getFullYear(), calMonth.getMonth());

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${calMonth.getMonth()}-${i}`} className="w-full h-8"></div>);
    }
    
    for (let d = 1; d <= totalDays; d++) {
      const year = calMonth.getFullYear();
      const month = (calMonth.getMonth() + 1).toString().padStart(2, '0');
      const dayStr = d.toString().padStart(2, '0');
      const fullDate = `${year}-${month}-${dayStr}`;
      
      let isSelected = false;
      let isInRange = false;
      let isStart = false;
      let isEnd = false;
      
      const today = new Date();
      const isToday = today.getFullYear() === year && today.getMonth() + 1 === parseInt(month) && today.getDate() === d;

      if (tempStart === fullDate) {
        isSelected = true;
        isStart = true;
      }
      if (tempEnd === fullDate) {
        isSelected = true;
        isEnd = true;
      }
      if (tempStart && tempEnd && fullDate > tempStart && fullDate < tempEnd) {
        isInRange = true;
      }

      days.push(
        <div key={`${calMonth.getMonth()}-${d}`} className="relative w-full h-8 flex items-center justify-center">
          {isInRange && (
            <div className="absolute inset-0 bg-blue-50/80"></div>
          )}
          {isStart && tempEnd && tempStart !== tempEnd && (
            <div className="absolute inset-y-0 right-0 w-1/2 bg-blue-50/80"></div>
          )}
          {isEnd && tempStart && tempStart !== tempEnd && (
             <div className="absolute inset-y-0 left-0 w-1/2 bg-blue-50/80"></div>
          )}
          <div 
            onClick={() => handleDateClick(calMonth, d)}
            className={`relative z-10 w-7 h-7 mx-auto flex items-center justify-center text-[13px] font-medium cursor-pointer rounded-full transition-all ${
              isSelected ? 'bg-blue-600 text-white' : 
              isInRange ? 'text-blue-800' : 'hover:bg-slate-100 text-slate-700'
            } ${isToday && !isSelected ? 'border border-slate-400' : ''}`}
          >
            {d}
          </div>
        </div>
      );
    }
    return days;
  };

  const rightMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);

  useEffect(() => {
    setTempYearLeft(currentMonth.getFullYear());
    setTempYearRight(rightMonth.getFullYear());
  }, [currentMonth]);

  const monthsID = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];

  const renderMonthSelector = (type: 'left' | 'right') => {
    const isLeft = type === 'left';
    const tempYear = isLeft ? tempYearLeft : tempYearRight;
    const setTempYear = isLeft ? setTempYearLeft : setTempYearRight;
    
    return (
      <div className="flex flex-col h-[280px]">
        <div className="flex items-center justify-between mb-6 px-2">
          <button onClick={() => setTempYear(tempYear - 1)} className="hover:bg-slate-100 p-1.5 rounded-md text-slate-500 transition-colors">
            <Icon name="chevron-left" size={16} />
          </button>
          <span className="text-[14px] font-bold text-slate-800">{tempYear}</span>
          <button onClick={() => setTempYear(tempYear + 1)} className="hover:bg-slate-100 p-1.5 rounded-md text-slate-500 transition-colors">
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 flex-1">
          {monthsID.map((m, i) => {
            const isActive = isLeft 
              ? currentMonth.getFullYear() === tempYear && currentMonth.getMonth() === i
              : rightMonth.getFullYear() === tempYear && rightMonth.getMonth() === i;
              
            return (
              <button 
                key={m}
                onClick={() => {
                  if (isLeft) {
                    setCurrentMonth(new Date(tempYear, i, 1));
                  } else {
                    setCurrentMonth(new Date(tempYear, i - 1, 1));
                  }
                  setSelectingMonth(null);
                }}
                className={`py-3 rounded-lg text-xs font-bold transition-all ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-blue-50 text-slate-700'}`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <div 
        onClick={toggleDropdown}
        className="flex items-center justify-between gap-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 hover:border-slate-300 w-full sm:w-auto min-w-[200px] cursor-pointer shadow-sm transition-all"
      >
        <span>
          {startDate || endDate ? `${formatDateLabel(startDate)}${endDate && endDate !== startDate ? ` - ${formatDateLabel(endDate)}` : ''}` : 'Semua Tanggal'}
        </span>
        <Icon name="chevron-down" size={14} className="text-slate-400" />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            ref={dropdownRef}
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="absolute bg-white border border-slate-200 rounded-xl shadow-2xl z-[9999] p-5 w-[calc(100vw-32px)] sm:w-[600px] flex flex-col top-full right-0 mt-2 origin-top-right"
          >
            <div className="flex flex-col sm:flex-row gap-8">
              {/* Left Calendar */}
              <div className="flex-1 min-h-[300px]">
                <div className="text-center text-[12px] font-medium text-slate-800 mb-4">
                  Tanggal Mulai
                </div>
                {selectingMonth === 'left' ? (
                  renderMonthSelector('left')
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4 px-1">
                      <div 
                        className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 py-1 px-2 -ml-2 rounded-md transition-colors"
                        onClick={() => setSelectingMonth('left')}
                      >
                        <span className="text-[13px] font-bold text-slate-700">{formatMonthYear(currentMonth)}</span>
                        <Icon name="chevron-down" size={14} className="text-slate-500" />
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="hover:bg-slate-100 p-1 rounded-md outline-none text-slate-700 transition-colors">
                          <Icon name="chevron-left" size={16} />
                        </button>
                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="hover:bg-slate-100 p-1 rounded-md outline-none text-slate-700 transition-colors">
                          <Icon name="chevron-right" size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400 mb-2 border-b border-slate-100 pb-2">
                      {['M','S','S','R','K','J','S'].map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1">
                      {renderDays(currentMonth)}
                    </div>
                  </>
                )}
              </div>

              {/* Right Calendar */}
              <div className="flex-1 min-h-[300px]">
                <div className="text-center text-[12px] font-medium text-slate-800 mb-4">
                  Tanggal Akhir
                </div>
                {selectingMonth === 'right' ? (
                  renderMonthSelector('right')
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4 px-1">
                      <div 
                        className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 py-1 px-2 -ml-2 rounded-md transition-colors"
                        onClick={() => setSelectingMonth('right')}
                      >
                        <span className="text-[13px] font-bold text-slate-700">{formatMonthYear(rightMonth)}</span>
                        <Icon name="chevron-down" size={14} className="text-slate-500" />
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="hover:bg-slate-100 p-1 rounded-md outline-none text-slate-700 transition-colors">
                          <Icon name="chevron-left" size={16} />
                        </button>
                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="hover:bg-slate-100 p-1 rounded-md outline-none text-slate-700 transition-colors">
                          <Icon name="chevron-right" size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400 mb-2 border-b border-slate-100 pb-2">
                      {['M','S','S','R','K','J','S'].map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1">
                      {renderDays(rightMonth)}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center mt-6 pt-4">
              <div className="text-xs font-semibold text-slate-500 w-[200px] truncate opacity-0 pointer-events-none">
                {/* Hidden placeholder to push buttons to right */}
              </div>
              <div className="flex gap-4 items-center pl-4 w-full justify-end">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleApply}
                  className="text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

