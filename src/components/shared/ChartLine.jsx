// src/components/shared/ChartLine.jsx
const ChartLine = ({
  data,
  width = 480,
  height = 220,
  color = "#2563eb",
  xLabel,
  yLabel,
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-100 rounded-lg h-48 flex items-center justify-center text-gray-500">
        Aucune donnée
      </div>
    );
  }
  const minY = Math.min(...data.map((d) => d.y));
  const maxY = Math.max(...data.map((d) => d.y));
  const midY = (minY + maxY) / 2;
  const pad = 40; // agrandi pour laisser la place aux graduations
  const bottomPad = 36; // espace supplémentaire pour les labels de l'axe X
  const innerW = width - pad * 2;
  const innerH = height - pad - bottomPad;
  const x = (_, i) =>
    data.length === 1 ? pad + innerW / 2 : pad + (i / (data.length - 1)) * innerW;
  const y = (val) =>
    pad + innerH - ((val - minY) / Math.max(1, maxY - minY)) * innerH;
  const path = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(d, i)},${y(d.y)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[220px]">
      {/* Axes */}
      <line x1={pad} y1={pad} x2={pad} y2={pad + innerH} stroke="#e5e7eb" />
      <line
        x1={pad}
        y1={pad + innerH}
        x2={width - pad}
        y2={pad + innerH}
        stroke="#e5e7eb"
      />

      {/* Graduations de l'axe Y (min / milieu / max) */}
      {[minY, midY, maxY].map((val, i) => (
        <g key={`y-${i}`}>
          <line
            x1={pad - 4}
            y1={y(val)}
            x2={pad}
            y2={y(val)}
            stroke="#9ca3af"
          />
          <text
            x={pad - 8}
            y={y(val)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="12"
            fill="#374151"
          >
            {Math.round(val)}
          </text>
        </g>
      ))}

      {/* Ligne et points */}
      <path d={path} stroke={color} fill="none" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={i} cx={x(d, i)} cy={y(d.y)} r="3" fill={color} />
      ))}

      {/* Graduations de l'axe X (une par point de donnée) */}
      {data.map((d, i) => (
        <text
          key={`x-${i}`}
          x={x(d, i)}
          y={pad + innerH + 18}
          textAnchor="middle"
          fontSize="12"
          fill="#374151"
        >
          {d.x}
        </text>
      ))}

      {/* Labels d'axes */}
      {xLabel && (
        <text
          x={width - pad}
          y={height - 4}
          textAnchor="end"
          fontSize="12"
          fontWeight="600"
          fill="#6b7280"
        >
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={8}
          y={pad - 12}
          textAnchor="start"
          fontSize="12"
          fontWeight="600"
          fill="#6b7280"
        >
          {yLabel}
        </text>
      )}
    </svg>
  );
};

export default ChartLine;
