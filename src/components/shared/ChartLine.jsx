// src/components/shared/ChartLine.jsx
const ChartLine = ({ data, width = 480, height = 200, color = '#2563eb', xLabel, yLabel }) => {
  if (!data || data.length === 0) {
    return <div className="bg-gray-100 rounded-lg h-48 flex items-center justify-center text-gray-500">Aucune donnÃ©e</div>;
  }
  const minY = Math.min(...data.map(d => d.y));
  const maxY = Math.max(...data.map(d => d.y));
  const pad = 24;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const x = (_, i) => pad + (i / (data.length - 1)) * innerW;
  const y = (val) => pad + innerH - ((val - minY) / Math.max(1, maxY - minY)) * innerH;
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d, i)},${y(d.y)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[200px]">
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#e5e7eb" />
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#e5e7eb" />
      <path d={path} stroke={color} fill="none" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={i} cx={x(d, i)} cy={y(d.y)} r="2.5" fill={color} />
      ))}
      {xLabel && <text x={width - pad} y={height - 6} textAnchor="end" fontSize="10" fill="#6b7280">{xLabel}</text>}
      {yLabel && <text x="8" y={pad} textAnchor="start" fontSize="10" fill="#6b7280">{yLabel}</text>}
    </svg>
  );
};

export default ChartLine;
