/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Card } from './Card';

interface RadialData {
  label: string;
  count: number;
  percentage: number;
  color: string;
}

interface RadialOrbitChartProps {
  title: string;
  data: RadialData[];
  selectedValue?: string | null;
  onItemClick?: (label: string) => void;
}

export const RadialOrbitChart = React.memo(({ title, data, selectedValue, onItemClick }: RadialOrbitChartProps) => {
  // Take top 4 items to keep it clean like the reference, or handle dynamic concentric rings
  const displayData = data.slice(0, 4);
  const total = data.reduce((acc, curr) => acc + curr.count, 0);
  
  // Base SVG size and center
  const size = 200;
  const center = size / 2;
  
  // Calculate radii for concentric circles
  const getRadius = (index: number) => 65 - (index * 14);

  return (
    <Card className="h-full flex flex-col p-6 overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-bold text-[15px] text-slate-800">{title}</h3>
      </div>

      <div className="flex flex-1 items-center gap-6">
        {/* Legend Left */}
        <div className="flex flex-col gap-6 min-w-[110px]">
          {displayData.map((item, i) => (
            <div 
              key={i} 
              className={`flex flex-col cursor-pointer transition-all ${selectedValue === item.label ? 'scale-105' : selectedValue ? 'opacity-30' : 'opacity-100 hover:scale-105'}`}
              onClick={() => onItemClick && onItemClick(item.label)}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]" style={{ backgroundColor: item.color }}></div>
                <span className="text-[11px] font-bold tracking-tight" style={{ color: item.color }}>{item.label}</span>
              </div>
              <span className="text-3xl font-black text-slate-800 tracking-tighter leading-none">{item.count}</span>
            </div>
          ))}
        </div>

        {/* Visual Right */}
        <div className="flex-1 flex justify-center items-center relative py-4">
          <svg viewBox={`0 0 ${size} ${size}`} className="w-52 h-52 overflow-visible transform -rotate-90">
            {/* Concentric Background Orbits */}
            {displayData.map((_, i) => (
              <circle
                key={`bg-${i}`}
                cx={center}
                cy={center}
                r={getRadius(i)}
                fill="none"
                stroke="#F1F5F9"
                strokeWidth="1.5"
                strokeDasharray="1 5"
              />
            ))}

            {/* Active Segments */}
            {displayData.map((item, i) => {
              const radius = getRadius(i);
              const circumference = 2 * Math.PI * radius;
              // Limit max dash to avoid overlapping fully or looking weird, but standard is percentage
              const dashLength = (item.percentage / 100) * circumference;
              
              const angleInDegrees = (item.percentage / 100) * 360;
              const angleInRadians = (angleInDegrees * Math.PI) / 180;
              const fx = center + radius * Math.cos(angleInRadians);
              const fy = center + radius * Math.sin(angleInRadians);

              return (
                <g key={`seg-${i}`} className="cursor-pointer group" onClick={() => onItemClick && onItemClick(item.label)} style={{ opacity: selectedValue && selectedValue !== item.label ? 0.2 : 1 }}>
                  <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={item.color}
                    strokeWidth="7"
                    strokeDasharray={`${Math.max(1, dashLength)} ${circumference}`}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-in-out"
                  />
                  
                  {/* The Bubble at the end */}
                  <g className="transition-all duration-1000 ease-in-out" transform={`translate(${fx}, ${fy})`}>
                    <circle
                      r="18"
                      fill={item.color}
                      className="shadow-xl group-hover:scale-110 transition-transform"
                    />
                    <text
                      textAnchor="middle"
                      dy="4"
                      className="text-[10px] font-black fill-white select-none pointer-events-none"
                      style={{ transform: 'rotate(90deg)' }}
                    >
                      {Math.round(item.percentage)}%
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-50">
        <p className="text-[11px] text-slate-500 font-medium">
          Lulusan <span className="font-bold text-primary px-1.5 py-0.5 bg-primary/10 rounded-md">{displayData[0]?.label}</span> mendominasi sebesar <span className="font-bold text-slate-800">{Math.round(displayData[0]?.percentage)}%</span> dari total personil.
        </p>
      </div>
    </Card>
  );
});
