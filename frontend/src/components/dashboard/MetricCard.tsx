import type { MetricSnapshot } from '@/types/email';

interface MetricCardProps {
  metric: MetricSnapshot;
}

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className={`card metric-card tone-${metric.tone}`}>
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <p>{metric.trend}</p>
    </article>
  );
}
