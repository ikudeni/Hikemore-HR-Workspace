import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './Icon';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const TimePicker = ({ value, onChange, placeholder }: TimePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hourScrollRef = useRef<HTMLDivElement>(null);
  const minuteScrollRef = useRef<HTMLDivElement>(null);
  
  const [hStr, mStr] = value ? (value.includes('.') ? value.split('.') : value.split(':')) : ['', ''];

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  // Triple the arrays to simulate infinite scroll
  const repeatedHours = [...hours, ...hours, ...hours];
  const repeatedMinutes = [...minutes, ...minutes, ...minutes];

  const ITEM_HEIGHT = 36; // Approx height of each time item

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle infinite scroll looping
  const handleScroll = (ref: React.RefObject<HTMLDivElement>, totalItems: number) => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    const totalHeight = totalItems * ITEM_HEIGHT;

    if (scrollTop < ITEM_HEIGHT * 2) {
      ref.current.scrollTop = scrollTop + totalHeight;
    } else if (scrollTop > scrollHeight - clientHeight - ITEM_HEIGHT * 2) {
      ref.current.scrollTop = scrollTop - totalHeight;
    }
  };

  // Scroll to selected values when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (hourScrollRef.current) {
          const index = hStr ? parseInt(hStr) : 0;
          // Target the middle section (index + 24)
          hourScrollRef.current.scrollTop = (index + 24) * ITEM_HEIGHT - 100; 
        }
        if (minuteScrollRef.current) {
          const index = mStr ? parseInt(mStr) : 0;
          // Target the middle section (index + 60)
          minuteScrollRef.current.scrollTop = (index + 60) * ITEM_HEIGHT - 100;
        }
      }, 50);
    }
  }, [isOpen, hStr, mStr]);

  const handleSelect = (h: string, m: string) => {
    onChange(`${h}.${m}`);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none hover:border-blue-400 focus-within:bg-white focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100/50 transition-all text-slate-800 cursor-pointer flex items-center justify-between"
      >
        <span className={value ? 'text-slate-800' : 'text-slate-400'}>
          {value ? value.replace('.', ':') : placeholder}
        </span>
        <Icon name="clock" size={16} className="text-slate-400" />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full mt-2 left-0 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden flex h-60 min-w-[140px]"
          >
            <div 
              ref={hourScrollRef}
              onScroll={() => handleScroll(hourScrollRef, 24)}
              className="flex-1 overflow-y-auto py-2 border-r border-slate-100 scrollbar-hide no-scrollbar"
              style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
            >
              {repeatedHours.map((h, i) => (
                <button
                  key={`${h}-${i}`}
                  onClick={() => handleSelect(h, mStr || '00')}
                  className={`w-full text-center py-2 text-sm font-bold transition-colors ${hStr === h ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  {h}
                </button>
              ))}
            </div>
            <div 
              ref={minuteScrollRef}
              onScroll={() => handleScroll(minuteScrollRef, 60)}
              className="flex-1 overflow-y-auto py-2 scrollbar-hide no-scrollbar"
              style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
            >
              {repeatedMinutes.map((m, i) => (
                <button
                  key={`${m}-${i}`}
                  onClick={() => handleSelect(hStr || '00', m)}
                  className={`w-full text-center py-2 text-sm font-bold transition-colors ${mStr === m ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
