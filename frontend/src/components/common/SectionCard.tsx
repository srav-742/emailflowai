import type { ReactNode } from 'react';

interface SectionCardProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function SectionCard({ eyebrow, title, subtitle, children }: SectionCardProps) {
  return (
    <section className="card section-card">
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p className="section-copy">{subtitle}</p>
      {children}
    </section>
  );
}
