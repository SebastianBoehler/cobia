import { useId } from "react";
import type { CSSProperties } from "react";

export function XStocksMark({ size = 40 }: { size?: number }) {
  const gradientId = useId();

  return (
    <span
      aria-label="xStocks"
      className="brand-mark brand-mark--xstocks"
      role="img"
      style={{ "--brand-mark-size": `${size}px` } as CSSProperties}
    >
      <svg aria-hidden="true" height="70%" viewBox="0 0 40 40" width="70%">
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#1fd59a" />
          <stop offset="1" stopColor="#5fcef0" />
        </linearGradient>
        <path
          d="M40 .291A.291.291 0 0 0 39.709 0H26.667L20 6.667 13.333 0H.291A.291.291 0 0 0 0 .291v13.042L6.667 20 0 26.667v13.042c0 .161.13.291.291.291h13.042L20 33.333 26.667 40h13.042c.161 0 .291-.13.291-.291V26.667L33.333 20 40 13.333V.291Z"
          fill={`url(#${gradientId})`}
        />
      </svg>
    </span>
  );
}
