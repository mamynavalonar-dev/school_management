// src/components/shared/ChartBar.jsx
const ChartBar = ({
  data,
  width = 480,
  height = 220,
  color = "#16a34a",
  valueSuffix = "",
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
  const padLeft = 36; // agrandi pour laisser la place aux graduations Y
  const padRight = 24;
  const topPad = yLabel ? 56 : 24;
  const bottomPad = xLabel ? 44 : 24;
  const innerW = width - padLeft - padRight;
  const innerH = height - topPad - bottomPad;
  const maxV = Math.max(...data.map((d) => d.value), 1);
  const midV = maxV / 2;
  const barW = (innerW / data.length) * 0.7;
  const yFromValue = (val) => topPad + innerH - (val / maxV) * innerH;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[220px]">
      <line
        x1={padLeft}
        y1={topPad}
        x2={padLeft}
        y2={topPad + innerH}
        stroke="#e5e7eb"
      />
      <line
        x1={padLeft}
        y1={topPad + innerH}
        x2={width - padRight}
        y2={topPad + innerH}
        stroke="#e5e7eb"
      />

      {/* Graduations de l'axe Y (0 / milieu / max) */}
      {[0, midV, maxV].map((val, i) => (
        <g key={`y-${i}`}>
          <line
            x1={padLeft - 4}
            y1={yFromValue(val)}
            x2={padLeft}
            y2={yFromValue(val)}
            stroke="#9ca3af"
          />
          <text
            x={padLeft - 8}
            y={yFromValue(val)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="12"
            fill="#374151"
          >
            {Math.round(val)}
          </text>
        </g>
      ))}

      {data.map((d, i) => {
        const h = (d.value / maxV) * innerH;
        const x =
          padLeft +
          i * (innerW / data.length) +
          (innerW / data.length - barW) / 2;
        const y = topPad + innerH - h;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={h} fill={color} rx="3" />
            <text
              x={x + barW / 2}
              y={topPad + innerH + 20}
              textAnchor="middle"
              fontSize="12"
              fill="#374151"
            >
              {d.label}
            </text>
            <text
              x={x + barW / 2}
              y={y - 6}
              textAnchor="middle"
              fontSize="12"
              fontWeight="600"
              fill="#111827"
            >
              {d.value}
              {valueSuffix}
            </text>
          </g>
        );
      })}

      {/* Labels d'axes */}
      {xLabel && (
        <text
          x={width - padRight}
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
          y={20}
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

export default ChartBar;
