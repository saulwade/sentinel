"use client";
/**
 * PixelLoader — retro Game Boy 4-color palette loader.
 *
 * Pure CSS/SVG, no assets. Uses 8-bit pixel grid (pixelated rendering),
 * stepped keyframes so motion looks like sprite frames, not smooth tweens.
 *
 * Variants:
 *   - "knight": swordsman swinging (What-If, Red Team, Arena, Fork, surgery)
 *   - "scroll": quill writing on scroll (Committee, synthesize, report)
 *   - "spark": 8-bit rotating spark (generic/short)
 */

import React from "react";

type Variant = "knight" | "scroll" | "spark";

// Game Boy palette
const GB = {
  darkest: "#0f380f",
  dark: "#306230",
  light: "#8bac0f",
  lightest: "#9bbc0f",
};

export function PixelLoader({
  variant = "knight",
  label,
  sublabel,
  className = "",
}: {
  variant?: Variant;
  label?: string;
  sublabel?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-6 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className="pixel-sprite"
        style={{
          width: 64,
          height: 64,
          imageRendering: "pixelated" as React.CSSProperties["imageRendering"],
        }}
      >
        {variant === "knight" && <KnightSprite />}
        {variant === "scroll" && <ScrollSprite />}
        {variant === "spark" && <SparkSprite />}
      </div>
      {label && (
        <div
          className="font-mono text-xs tracking-wider uppercase"
          style={{ color: GB.lightest, textShadow: `0 0 4px ${GB.dark}` }}
        >
          {label}
          <span className="pixel-dots" aria-hidden>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </div>
      )}
      {sublabel && (
        <div className="font-mono text-[10px] opacity-60" style={{ color: GB.light }}>
          {sublabel}
        </div>
      )}
      <style jsx>{`
        .pixel-dots span {
          display: inline-block;
          animation: pixel-dot 1.2s steps(1, end) infinite;
          opacity: 0;
        }
        .pixel-dots span:nth-child(1) { animation-delay: 0s; }
        .pixel-dots span:nth-child(2) { animation-delay: 0.3s; }
        .pixel-dots span:nth-child(3) { animation-delay: 0.6s; }
        @keyframes pixel-dot {
          0%, 33% { opacity: 0; }
          34%, 100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ─── Knight: 4-frame sword swing (steps keep it snappy, sprite-like) ─── */
function KnightSprite() {
  return (
    <svg viewBox="0 0 16 16" width="64" height="64" shapeRendering="crispEdges">
      <style>{`
        .knight-swing { animation: knight-swing 0.9s steps(1, end) infinite; transform-origin: 8px 8px; }
        @keyframes knight-swing {
          0%   { transform: rotate(-25deg); }
          25%  { transform: rotate(0deg); }
          50%  { transform: rotate(45deg); }
          75%  { transform: rotate(15deg); }
          100% { transform: rotate(-25deg); }
        }
        .knight-body { animation: knight-bob 0.9s steps(1, end) infinite; }
        @keyframes knight-bob {
          0%, 49% { transform: translateY(0); }
          50%, 99% { transform: translateY(1px); }
        }
      `}</style>
      {/* Body (dark green) */}
      <g className="knight-body">
        {/* Helmet */}
        <rect x="6" y="2" width="4" height="3" fill={GB.darkest} />
        <rect x="7" y="3" width="2" height="1" fill={GB.lightest} />
        {/* Torso w/ armor highlight */}
        <rect x="5" y="5" width="6" height="5" fill={GB.dark} />
        <rect x="6" y="6" width="4" height="1" fill={GB.light} />
        <rect x="7" y="8" width="2" height="1" fill={GB.darkest} />
        {/* Legs */}
        <rect x="5" y="10" width="2" height="4" fill={GB.darkest} />
        <rect x="9" y="10" width="2" height="4" fill={GB.darkest} />
        {/* Feet */}
        <rect x="4" y="14" width="3" height="1" fill={GB.dark} />
        <rect x="9" y="14" width="3" height="1" fill={GB.dark} />
        {/* Shield (left arm) */}
        <rect x="3" y="6" width="2" height="4" fill={GB.light} />
        <rect x="3" y="7" width="1" height="2" fill={GB.dark} />
      </g>
      {/* Sword (right arm, swings) */}
      <g className="knight-swing">
        <rect x="11" y="3" width="1" height="7" fill={GB.lightest} />
        <rect x="10" y="9" width="3" height="1" fill={GB.dark} />
        <rect x="11" y="2" width="1" height="1" fill={GB.lightest} />
      </g>
    </svg>
  );
}

/* ─── Scroll: parchment with quill writing ─── */
function ScrollSprite() {
  return (
    <svg viewBox="0 0 16 16" width="64" height="64" shapeRendering="crispEdges">
      <style>{`
        .quill { animation: quill-write 0.8s steps(1, end) infinite; transform-origin: 11px 4px; }
        @keyframes quill-write {
          0%   { transform: translate(0, 0); }
          25%  { transform: translate(-1px, 1px); }
          50%  { transform: translate(-2px, 0); }
          75%  { transform: translate(-1px, -1px); }
          100% { transform: translate(0, 0); }
        }
        .ink-line { animation: ink-grow 0.8s steps(4, end) infinite; }
        @keyframes ink-grow {
          0%   { width: 0; }
          100% { width: 8px; }
        }
      `}</style>
      {/* Scroll body */}
      <rect x="2" y="3" width="12" height="10" fill={GB.lightest} />
      <rect x="2" y="3" width="12" height="1" fill={GB.light} />
      <rect x="2" y="12" width="12" height="1" fill={GB.light} />
      {/* Scroll rolls */}
      <rect x="1" y="2" width="2" height="12" fill={GB.dark} />
      <rect x="13" y="2" width="2" height="12" fill={GB.dark} />
      {/* Text lines (static) */}
      <rect x="4" y="5" width="7" height="1" fill={GB.dark} />
      <rect x="4" y="7" width="5" height="1" fill={GB.dark} />
      {/* Growing ink line */}
      <g>
        <rect x="4" y="9" width="8" height="1" fill={GB.darkest}>
          <animate attributeName="width" values="0;2;4;6;8;0" dur="0.8s" repeatCount="indefinite" calcMode="discrete" />
        </rect>
      </g>
      {/* Quill */}
      <g className="quill">
        <rect x="11" y="4" width="1" height="5" fill={GB.darkest} />
        <rect x="10" y="2" width="3" height="2" fill={GB.light} />
        <rect x="11" y="9" width="1" height="1" fill={GB.darkest} />
      </g>
    </svg>
  );
}

/* ─── Spark: rotating 8-bit spark ─── */
function SparkSprite() {
  return (
    <svg viewBox="0 0 16 16" width="64" height="64" shapeRendering="crispEdges">
      <style>{`
        .spark { animation: spark-rot 0.6s steps(4, end) infinite; transform-origin: 8px 8px; }
        @keyframes spark-rot {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <g className="spark">
        <rect x="7" y="2" width="2" height="3" fill={GB.lightest} />
        <rect x="7" y="11" width="2" height="3" fill={GB.lightest} />
        <rect x="2" y="7" width="3" height="2" fill={GB.lightest} />
        <rect x="11" y="7" width="3" height="2" fill={GB.lightest} />
        <rect x="4" y="4" width="2" height="2" fill={GB.light} />
        <rect x="10" y="4" width="2" height="2" fill={GB.light} />
        <rect x="4" y="10" width="2" height="2" fill={GB.light} />
        <rect x="10" y="10" width="2" height="2" fill={GB.light} />
        <rect x="6" y="6" width="4" height="4" fill={GB.dark} />
        <rect x="7" y="7" width="2" height="2" fill={GB.darkest} />
      </g>
    </svg>
  );
}
