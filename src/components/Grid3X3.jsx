// components/Grid3X3.jsx
const Grid3X3 = ({ size = 24, color = 'currentColor', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M3 3h7v7H3z"></path>
    <path d="M14 3h7v7h-7z"></path>
    <path d="M14 14h7v7h-7z"></path>
    <path d="M3 14h7v7H3z"></path>
  </svg>
);

export default Grid3X3;


