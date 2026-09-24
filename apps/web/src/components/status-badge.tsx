import React, { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Ban, CheckCircle2, Clock, FileCheck, FileText, Lock, LockOpen, RotateCcw, Send, ShoppingBag, Sliders, Truck, XCircle } from 'lucide-react';
import { getSystemStatuses, SystemStatusDefinition } from '../api';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Truck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Ban,
  LockOpen,
  Lock,
  FileText,
  Send,
  Clock,
  FileCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Sliders,
  ShoppingBag,
};

export interface DynamicStatusBadgeProps {
  domain: string;
  code: string;
  fallbackLabel?: string;
  fallbackColor?: string;
  fallbackBg?: string;
  style?: CSSProperties;
  className?: string;
}

export function DynamicStatusBadge({
  domain,
  code,
  fallbackLabel,
  fallbackColor,
  fallbackBg,
  style,
  className,
}: DynamicStatusBadgeProps) {
  const { data: statuses } = useQuery({
    queryKey: ['system-statuses', domain],
    queryFn: () => getSystemStatuses(domain),
    staleTime: 60_000,
  });

  const matched = statuses?.find(
    (s: SystemStatusDefinition) =>
      s.domain.toUpperCase() === domain.toUpperCase() && s.code.toUpperCase() === code.toUpperCase()
  );

  const label = matched?.label || fallbackLabel || code;
  const color = matched?.color || fallbackColor || '#475569';
  const bgColor = matched?.bgColor || fallbackBg || '#f1f5f9';
  const IconComponent = matched?.icon ? ICON_MAP[matched.icon] : null;

  return (
    <span
      className={`status ${className || ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        fontWeight: 600,
        borderRadius: '999px',
        padding: '3px 9px',
        color,
        background: bgColor,
        border: `1px solid ${color}20`,
        lineHeight: 1.2,
        ...style,
      }}
    >
      {IconComponent && <IconComponent size={12} />}
      {label}
    </span>
  );
}
