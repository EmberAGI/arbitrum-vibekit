'use client';

import React, { useState, useRef } from 'react';

interface PriceChartProps {
  data: {
    prices: [number, number][];
  };
  width?: number;
  height?: number;
}

export const PriceChart = ({
  data,
  width = 600,
  height = 300,
}: PriceChartProps) => {
  console.log('Line number 14:', data);
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    price: number;
    timestamp: number;
  } | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const svgRef = useRef<SVGSVGElement>(null);

  if (!data || !data.prices || data.prices.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '12px',
          color: 'white',
          fontSize: '16px',
          fontWeight: '500',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        }}
        data-testid="price-chart-no-data"
        role="img"
        aria-label="No price data available"
      >
        No price data available.
      </div>
    );
  }

  const prices = data.prices.map((p) => p[1]);
  const timestamps = data.prices.map((p) => p[0]);

  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);

  const padding = 60;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;

  const getX = (timestamp: number) => {
    return (
      padding +
      ((timestamp - minTimestamp) / (maxTimestamp - minTimestamp)) * chartWidth
    );
  };

  const getY = (price: number) => {
    return (
      padding +
      chartHeight -
      ((price - minPrice) / (maxPrice - minPrice)) * chartHeight
    );
  };

  const pathData = data.prices
    .map(([timestamp, price], index) => {
      const x = getX(timestamp);
      const y = getY(price);
      return `${index === 0 ? 'M' : 'L'} ${x},${y}`;
    })
    .join(' ');

  // Create area path for gradient fill
  const areaPath =
    `${pathData} L ${getX(maxTimestamp)},${padding + chartHeight} L ${getX(minTimestamp)},${padding + chartHeight} Z`;

  // Generate Y-axis labels
  const yAxisLabels = [];
  const numYLabels = 5;
  for (let i = 0; i <= numYLabels; i++) {
    const price = minPrice + (i / numYLabels) * (maxPrice - minPrice);
    yAxisLabels.push({
      price: price.toFixed(2),
      y: getY(price),
    });
  }

  // Generate X-axis labels
  const xAxisLabels = [];
  const numXLabels = 5;
  for (let i = 0; i <= numXLabels; i++) {
    const timestamp =
      minTimestamp + (i / numXLabels) * (maxTimestamp - minTimestamp);
    xAxisLabels.push({
      date: new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      x: getX(timestamp),
    });
  }

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    setMousePosition({ x: event.clientX, y: event.clientY });

    // Find the closest data point
    let closestPoint = null;
    let minDistance = Number.POSITIVE_INFINITY;

    data.prices.forEach(([timestamp, price]) => {
      const x = getX(timestamp);
      const y = getY(price);
      const distance = Math.sqrt(
        Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2),
      );

      if (distance < minDistance && distance < 30) {
        minDistance = distance;
        closestPoint = { x, y, price, timestamp };
      }
    });

    setHoveredPoint(closestPoint);
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      data-testid="price-chart"
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        data-testid="chart-svg"
        style={{
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
          cursor: 'crosshair',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="img"
        aria-label={`Price chart for ${data.prices.length} data points`}
      >
        {/* Gradient definitions */}
        <defs>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#667eea" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#667eea" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#667eea" />
            <stop offset="100%" stopColor="#764ba2" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Y-axis grid lines and labels */}
        {yAxisLabels.map((label) => (
          <g key={`y-${label.price}`}>
            <line
              x1={padding}
              y1={label.y}
              x2={width - padding}
              y2={label.y}
              stroke="#e0e6ed"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <text
              x={padding - 15}
              y={label.y}
              dy="0.3em"
              textAnchor="end"
              fontSize="11"
              fill="#64748b"
              fontWeight="500"
            >
              ${label.price}
            </text>
          </g>
        ))}

        {/* X-axis grid lines and labels */}
        {xAxisLabels.map((label) => (
          <g key={`x-${label.x}`}>
            <line
              x1={label.x}
              y1={padding}
              x2={label.x}
              y2={height - padding}
              stroke="#e0e6ed"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <text
              x={label.x}
              y={height - padding + 20}
              textAnchor="middle"
              fontSize="11"
              fill="#64748b"
              fontWeight="500"
            >
              {label.date}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#areaGradient)" />

        {/* Chart path */}
        <path
          d={pathData}
          fill="none"
          stroke="url(#lineGradient)"
          strokeWidth="3"
          style={{
            filter: hoveredPoint ? 'url(#glow)' : 'none',
            transition: 'filter 0.2s ease',
          }}
          data-testid="chart-path"
        />

        {/* Data points */}
        {data.prices.map(([timestamp, price]) => {
          const x = getX(timestamp);
          const y = getY(price);
          const isHovered =
            hoveredPoint && hoveredPoint.x === x && hoveredPoint.y === y;

          return (
            <g key={timestamp}>
              <circle
                cx={x}
                cy={y}
                r={isHovered ? '6' : '4'}
                fill="#667eea"
                stroke="white"
                strokeWidth="2"
                data-testid={`data-point-${timestamp}`}
                style={{
                  transition: 'r 0.2s ease, filter 0.2s ease',
                  filter: isHovered ? 'url(#glow)' : 'none',
                  cursor: 'pointer',
                }}
              />
              {isHovered && (
                <circle
                  cx={x}
                  cy={y}
                  r="12"
                  fill="rgba(102, 126, 234, 0.2)"
                  stroke="rgba(102, 126, 234, 0.4)"
                  strokeWidth="1"
                />
              )}
            </g>
          );
        })}

        {/* Hover line */}
        {hoveredPoint && (
          <g>
            <line
              x1={hoveredPoint.x}
              y1={padding}
              x2={hoveredPoint.x}
              y2={height - padding}
              stroke="#667eea"
              strokeWidth="1"
              strokeDasharray="4,4"
              opacity="0.6"
            />
            <line
              x1={padding}
              y1={hoveredPoint.y}
              x2={width - padding}
              y2={hoveredPoint.y}
              stroke="#667eea"
              strokeWidth="1"
              strokeDasharray="4,4"
              opacity="0.6"
            />
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {hoveredPoint && (
        <div
          style={{
            position: 'fixed',
            left: mousePosition.x + 15,
            top: mousePosition.y - 80,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(102, 126, 234, 0.2)',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '14px',
            color: '#334155',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            pointerEvents: 'none',
            minWidth: '180px',
          }}
        >
          <div
            style={{ fontWeight: '600', color: '#667eea', marginBottom: '4px' }}
          >
            {formatPrice(hoveredPoint.price)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {formatDate(hoveredPoint.timestamp)}
          </div>
        </div>
      )}
    </div>
  );
};
