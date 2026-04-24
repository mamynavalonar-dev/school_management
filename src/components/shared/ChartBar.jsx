// src/components/shared/ChartBar.jsx
const ChartBar = ({ data, width = 480, height = 200, color = '#16a34a', valueSuffix = '' }) => {
  if (!data || data.length === 0) {
    return <div className="bg-gray-100 rounded-lg h-48 flex items-center justify-center text-gray-500">Aucune donnÃ©e</div>;
  }
  const pad = 24;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const maxV = Math.max(...data.map(d => d.value), 1);
  const barW = innerW / data.length * 0.7;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[200px]">
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#e5e7eb" />
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#e5e7eb" />
      {data.map((d, i) => {
        const h = ((d.value) / maxV) * innerH;
        const x = pad + i * (innerW / data.length) + ((innerW / data.length) - barW) / 2;
        const y = height - pad - h;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={h} fill={color} rx="3" />
            <text x={x + barW / 2} y={height - pad + 12} textAnchor="middle" fontSize="10" fill="#6b7280">{d.label}</text>
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#374151">{d.value}{valueSuffix}</text>
          </g>
        );
      })}
    </svg>
  );
};

export default ChartBar;
