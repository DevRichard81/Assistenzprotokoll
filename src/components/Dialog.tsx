import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

export type DialogMode = 'auto' | 'desktop' | 'mobile';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  mode?: DialogMode;
}

function usePrefersMobile(mode: DialogMode) {
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobileViewport(media.matches);
    update();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  const storedMode = typeof window !== 'undefined' ? (window.localStorage.getItem('uiMode') as DialogMode | null) : null;
  const effectiveMode = mode === 'auto' ? (storedMode || 'auto') : mode;

  if (effectiveMode === 'mobile') return true;
  if (effectiveMode === 'desktop') return false;
  return isMobileViewport;
}

export default function Dialog({ isOpen, onClose, title, children, className, mode = 'auto' }: DialogProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isMobile = usePrefersMobile(mode);

  const containerClasses = useMemo(() => {
    if (isMobile) {
      return 'fixed inset-0 z-50 flex h-dvh w-full flex-col bg-white';
    }

    return 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
  }, [isMobile]);

  const panelClasses = useMemo(() => {
    const base = 'flex h-full w-full flex-col bg-white shadow-xl outline-none';
    if (isMobile) return `${base} rounded-none`;
    return `${base} max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl`;
  }, [isMobile]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      const focusable = contentRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = contentRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      if (!focusableElements || focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    window.setTimeout(focusFirst, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
      aria-label="Close dialog"
    >
      <X size={20} />
    </button>
  );

  return (
    <div className={containerClasses} role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget && mode !== 'desktop') onClose();
    }}>
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`${panelClasses} ${className || ''}`}
      >
        <div className={`flex items-center justify-between border-b border-gray-200 px-4 sm:px-6 ${isMobile ? 'sticky top-0 z-10 bg-white' : ''}`}>
          <div className="min-w-0 py-4">
            <h2 id="dialog-title" className="truncate text-lg font-semibold text-gray-900 sm:text-xl">
              {title}
            </h2>
          </div>
          {closeButton}
        </div>

        <div className={`flex-1 overflow-y-auto ${isMobile ? 'px-4 py-4' : 'px-6 py-6'}`}>
          {children}
        </div>
      </div>
    </div>
  );
}



