export function StatStrip({ stats }: { stats: Array<{ label: string; value: string }> }) {
  return (
    <div className="em-stats" aria-label="Summary">
      {stats.map((stat) => (
        <div className="em-stat" key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong></div>
      ))}
    </div>
  );
}
