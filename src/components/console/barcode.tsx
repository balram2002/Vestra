import { barcodeGeometry } from '@/lib/barcode';

/**
 * A scannable Code 128 symbol.
 *
 * Rendered as inline SVG rather than an image so it stays crisp at whatever
 * resolution the thermal printer runs at, and needs no network round trip on a
 * page that is often printed from a warehouse tablet on poor wifi.
 *
 * `shape-rendering: crispEdges` matters: with anti-aliasing the module edges
 * blur and narrow bars scan unreliably.
 */
export function Barcode({
  value,
  height = 56,
  className,
  showText = true,
}: {
  value: string;
  height?: number;
  className?: string;
  showText?: boolean;
}) {
  const geometry = barcodeGeometry(value);

  // An unencodable value prints as text rather than as a symbol that would
  // fail at the scanner.
  if (!geometry) {
    return (
      <p className={className}>
        <span className="font-mono text-sm tracking-widest">{value}</span>
      </p>
    );
  }

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${geometry.totalModules} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Barcode ${value}`}
      >
        {geometry.bars.map((bar) => (
          <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={height} fill="#000" />
        ))}
      </svg>
      {showText ? (
        <p className="mt-1 text-center font-mono text-xs tracking-[0.2em]">{value}</p>
      ) : null}
    </div>
  );
}
