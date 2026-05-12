import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export function AsyncImage({ src, alt, className }: { src: string, alt?: string, className?: string }) {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!src) {
      setIsLoading(false);
      return;
    }
    
    if (src.startsWith('DB_STORED:')) {
      const docId = src.replace('DB_STORED:', '');
      getDoc(doc(db, 'fileContents', docId)).then(snap => {
        if (snap.exists()) {
          setDataUrl(snap.data().base64);
        }
        setIsLoading(false);
      }).catch(err => {
        console.error("Failed to load image", err);
        setIsLoading(false);
      });
    } else {
      setDataUrl(src);
      setIsLoading(false);
    }
  }, [src]);

  if (isLoading) {
    return <div className={`animate-pulse bg-slate-200 flex items-center justify-center ${className}`}><span className="text-xs text-slate-400">Loading...</span></div>;
  }
  
  if (!dataUrl) {
    return null;
  }

  return <img src={dataUrl} alt={alt || "Image"} className={className} />;
}
