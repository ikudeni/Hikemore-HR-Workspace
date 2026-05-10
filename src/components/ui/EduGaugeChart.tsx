/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './Card';

interface EduData {
  label: string;
  count: number;
  percentage: number;
  color: string;
}

interface EduGaugeChartProps {
  title: string;
  subtitle?: string;
  data: EduData[];
  onItemClick?: (label: string) => void;
  selectedValue?: string | null;
}

export const EduGaugeChart = React.memo(({ title, subtitle, data, onItemClick, selectedValue }: EduGaugeChartProps) => {
  const [tooltip, setTooltip] = useState<{ show: boolean, x: number, y: number, data: EduData | null }>({ show: false, x: 0, y: 0, data: null });
  
  const total = data.reduce((acc, curr) => acc + curr.count, 0);
  
  // Take top 4 or all relevant to keep it clean like the image
  const displayData = data.slice(0, 5).filter(d => d.count > 0);
  const totalPercentage = displayData.reduce((acc, curr) => acc + curr.percentage, 0);
  
  let currentOffset = 0;

  const handleMouseMove = (e: React.MouseEvent, item: EduData) => {
    setTooltip({ show: true, x: e.clientX, y: e.clientY, data: item });
  };

  const handleMouseLeave = () => {
    setTooltip(prev => ({ ...prev, show: false }));
  };

  return (
    <Card className="h-full flex flex-col p-6 min-h-[376px] overflow-hidden">
      <div className="mb-4">
        <h3 className="font-bold text-lg text-slate-800 leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 font-medium mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex-1 flex flex-col justify-center items-center relative py-2">
        <div className="relative w-44 h-44 flex items-center justify-center">
          <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90 overflow-visible">
            {/* Background circle */}
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="#F8FAFC" strokeWidth="5"></circle>
            
            {/* Segments */}
            {displayData.map((item, i) => {
              const offset = currentOffset;
              // Adjust percentage to fit if we only show top ones, but usually we show all
              const itemPercent = (item.percentage / 100) * 100; 
              currentOffset += itemPercent;
              
              const isFaded = selectedValue && selectedValue !== item.label;
              const gap = 1.5; // Gap between segments
              const dashVal = Math.max(0, itemPercent - gap);

              return (
                <circle 
                  key={i} 
                  cx="21" cy="21" r="15.915" 
                  fill="none" 
                  stroke={item.color} 
                  strokeWidth="5"
                  strokeDasharray={`${dashVal} 100`} 
                  strokeDashoffset={-offset} 
                  strokeLinecap="round" 
                  className="transition-all duration-500 cursor-pointer hover:stroke-[6px]"
                  style={{ pointerEvents: 'stroke', opacity: isFaded ? 0.3 : 1 }}
                  onMouseMove={(e) => handleMouseMove(e, item)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => onItemClick && onItemClick(item.label)}
                />
              );
            })}
          </svg>
          
          {/* Central Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-3xl font-black text-slate-800 tracking-tighter">{total}</span>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Personel</span>
          </div>
        </div>
      </div>

      {/* Legend Styled like reference */}
      <div className="mt-6 flex flex-col gap-2.5">
        {displayData.map((item, i) => {
          const isFaded = selectedValue && selectedValue !== item.label;
          return (
            <div 
              key={i} 
              className={`flex items-center justify-between group cursor-pointer transition-all ${isFaded ? 'opacity-30 grayscale-[0.5]' : 'opacity-100'}`}
              onClick={() => onItemClick && onItemClick(item.label)}
            >
              <div className="flex items-center gap-3">
                <div className="w-1 h-4 rounded-full" style={{ backgroundColor: item.color }}></div>
                <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">{item.label}</span>
              </div>
              <span className="text-[11px] font-black text-slate-800 bg-slate-50 px-2 py-0.5 rounded-md min-w-[28px] text-center border border-slate-100">{item.count}</span>
            </div>
          );
        })}
      </div>

      {tooltip.show && tooltip.data && createPortal(
        <div className="fixed z-[9999] bg-slate-900 text-white px-3 py-2 rounded-xl shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full flex flex-col items-center min-w-max border border-slate-700 transition-opacity duration-150 ease-out" style={{ left: tooltip.x, top: tooltip.y - 15 }}>
          <span className="text-[10px] text-slate-300 font-medium mb-0.5">{tooltip.data.label}</span>
          <div className="flex items-end gap-1.5">
            <span className="font-bold text-sm">{tooltip.data.count} <span className="text-[10px] font-normal text-slate-400">Orang</span></span>
            <span className="text-[10px] font-bold text-white bg-white/20 px-1.5 py-0.5 rounded-md">{tooltip.data.percentage.toFixed(1)}%</span>
          </div>
          <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45 border-r border-b border-slate-700"></div>
        </div>,
        document.body
      )}
    </Card>
  );
});
