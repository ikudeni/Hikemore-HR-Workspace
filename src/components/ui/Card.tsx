/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card = ({ children, className = "" }: CardProps) => (
  <div className={`bg-white rounded-3xl p-6 shadow-[0_2px_15px_-5px_rgba(0,0,0,0.03)] border border-slate-50 ${className}`}>
    {children}
  </div>
);
