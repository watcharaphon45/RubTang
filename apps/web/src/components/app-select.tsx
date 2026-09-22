import { ChevronDown } from 'lucide-react';
import { ReactNode, SelectHTMLAttributes } from 'react';

type AppSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  icon?: ReactNode;
  wrapperClassName?: string;
};

/** Shared native select: keeps accessibility and mobile behavior while applying one RubTang design. */
export function AppSelect({ icon, wrapperClassName = '', className = '', children, ...props }: AppSelectProps) {
  return <span className={`app-select ${icon ? 'has-icon' : ''} ${wrapperClassName}`}>
    {icon && <span className="app-select-icon" aria-hidden="true">{icon}</span>}
    <select className={className} {...props}>{children}</select>
    <ChevronDown className="app-select-arrow" size={16} aria-hidden="true" />
  </span>;
}
