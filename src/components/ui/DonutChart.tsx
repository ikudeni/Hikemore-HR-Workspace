/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './Card';

interface DonutData {
  label: string;
  count: number;
  percentage: number;
  color: string;
  subText?: string;
}

interface DonutChartProps {
  title: string;
  data: DonutData[];
  action?: React.ReactNode;
  onItemClick?: (label: string) => void;
  selectedValue?: string | null;
  unit?: string;
}

export const CustomDonutChartWidget = React.memo(({ title, data, action, onItemClick, selectedValue, unit = 'Orang' }: DonutChartProps) => {
  const [tooltip, setTooltip] = useState<{ show: boolean, x: number, y: number, data: DonutData | null }>({ show: false, x: 0, y: 0, data: null });
  let currentOffset = 0;

  const handleMouseMove = (e: React.MouseEvent, item: DonutData) => {
    setTooltip({ show: true, x: e.clientX, y: e.clientY, data: item });
  };

  const handleMouseLeave = () => {
    setTooltip(prev => ({ ...prev, show: false }));
  };

  return (
    <Card className="h-full flex flex-col p-6 min-h-[376px] overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-bold text-lg text-slate-800 leading-tight">{title}</h3>
        {action}
      </div>
      {data.length > 0 ? (
        <>
          <div className="flex flex-col items-center flex-1 justify-center py-2 relative">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90 drop-shadow-sm overflow-visible">
                <circle cx="21" cy="21" r="15.915" fill="none" stroke="#F1F5F9" strokeWidth="5.5"></circle>
                {data.map((item, i) => {
                  const offset = currentOffset;
                  currentOffset += item.percentage;
                  const visibleDash = Math.max(0, item.percentage - 1);
                  const isFaded = selectedValue && selectedValue !== item.label;
                  
                  return (
                    <circle key={i} cx="21" cy="21" r="15.915" fill="none" stroke={item.color} strokeWidth="5.5"
                      strokeDasharray={`${visibleDash} 100`} strokeDashoffset={-offset} strokeLinecap="butt" 
                      className="transition-all duration-300 cursor-pointer hover:stroke-[7.5px]"
                      style={{ pointerEvents: 'stroke', opacity: isFaded ? 0.3 : 1 }}
                      onMouseMove={(e) => handleMouseMove(e, item)}
                      onMouseLeave={handleMouseLeave}
                      onClick={() => onItemClick && onItemClick(item.label)}> 
                    </circle>
                  );
                })}
              </svg>
            </div>
            
            {tooltip.show && tooltip.data && createPortal(
              <div className="fixed z-[9999] bg-slate-900 text-white px-3 py-2 rounded-xl shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full flex flex-col items-center min-w-max border border-slate-700 transition-opacity duration-150 ease-out" style={{ left: tooltip.x, top: tooltip.y - 15 }}>
                <span className="text-[10px] text-slate-300 font-medium mb-0.5">{tooltip.data.label}</span>
                <div className="flex items-end gap-1.5">
                  <span className="font-bold text-sm block">
                    {tooltip.data.count} <span className="text-[10px] font-normal text-slate-400">{unit}</span>
                    {tooltip.data.subText && (
                      <span className="text-[10px] ml-1 font-normal text-slate-300">({tooltip.data.subText})</span>
                    )}
                  </span>
                  <span className="text-[10px] font-bold text-white bg-white/20 px-1.5 py-0.5 rounded-md">{tooltip.data.percentage.toFixed(1)}%</span>
                </div>
                <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45 border-r border-b border-slate-700"></div>
              </div>,
              document.body
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-2 mt-4 text-[11px] font-medium text-slate-500">
            {data.map((item, i) => {
              const isFaded = selectedValue && selectedValue !== item.label;
              return (
                <div key={i} className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800 transition-transp duration-300" style={{ opacity: isFaded ? 0.4 : 1 }} onMouseMove={(e) => handleMouseMove(e, item)} onMouseLeave={handleMouseLeave} onClick={() => onItemClick && onItemClick(item.label)}>
                  <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{backgroundColor: item.color}}></span>
                  {item.label} <span className="font-bold ml-0.5">{item.percentage.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 h-full text-slate-400">
          <svg className="w-12 h-12 mb-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-semibold">Tidak ada data</span>
        </div>
      )}
    </Card>
  );
});
