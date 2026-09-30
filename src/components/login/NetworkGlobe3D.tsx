import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useLanguage } from '../../i18n';
import { Activity, Shield, Wifi, Globe2, Radio, Cpu } from 'lucide-react';

export type GlobeThemeType = 'obsidian' | 'emerald' | 'cobalt' | 'rose' | 'amber' | 'light';

interface NetworkNode {
  name: string;
  nameFa: string;
  lat: number; // -90 to 90
  lon: number; // -180 to 180
  type: 'core' | 'gateway' | 'edge';
  active: boolean;
}

const GLOBAL_NODES: NetworkNode[] = [
  { name: 'Tehran Core DC', nameFa: 'دیتاسنتر هسته تهران', lat: 35.6892, lon: 51.3890, type: 'core', active: true },
  { name: 'Dubai Gateway', nameFa: 'گیت‌وی دوبی', lat: 25.2048, lon: 55.2708, type: 'gateway', active: true },
  { name: 'Frankfurt IX', nameFa: 'مرکز تبادل فرانکفورت', lat: 50.1109, lon: 8.6821, type: 'core', active: true },
  { name: 'London Backbone', nameFa: 'بک‌بون لندن', lat: 51.5074, lon: -0.1278, type: 'core', active: true },
  { name: 'Amsterdam DC', nameFa: 'دیتاسنتر آمستردام', lat: 52.3676, lon: 4.9041, type: 'gateway', active: true },
  { name: 'New York Fiber Hub', nameFa: 'هاب فیبر نیویورک', lat: 40.7128, lon: -74.0060, type: 'core', active: true },
  { name: 'San Francisco Tech DC', nameFa: 'سن‌فرانسیسکو', lat: 37.7749, lon: -122.4194, type: 'core', active: true },
  { name: 'Tokyo FastRoute', nameFa: 'مسیر پرسرعت توکیو', lat: 35.6762, lon: 139.6503, type: 'core', active: true },
  { name: 'Singapore Transit', nameFa: 'ترانزیت سنگاپور', lat: 1.3521, lon: 103.8198, type: 'gateway', active: true },
  { name: 'Sydney Oceania Hub', nameFa: 'هاب سیدنی اقیانوسیه', lat: -33.8688, lon: 151.2093, type: 'edge', active: true },
  { name: 'Sao Paulo Relay', nameFa: 'رله سائوپائولو', lat: -23.5505, lon: -46.6333, type: 'edge', active: true },
  { name: 'Johannesburg Node', nameFa: 'نود ژوهانسبورگ', lat: -26.2041, lon: 28.0473, type: 'edge', active: true },
  { name: 'Mumbai Express', nameFa: 'اکسپرس بمبئی', lat: 19.0760, lon: 72.8777, type: 'gateway', active: true },
  { name: 'Stockholm North', nameFa: 'نوردیک استکهلم', lat: 59.3293, lon: 18.0686, type: 'edge', active: true },
  { name: 'Istanbul Crosslink', nameFa: 'پل ارتباطی استانبول', lat: 41.0082, lon: 28.9784, type: 'gateway', active: true },
];

interface NetworkArc {
  sourceIdx: number;
  targetIdx: number;
  packets: { progress: number; speed: number; color: string; size: number }[];
}

interface ContinentDot {
  lat: number;
  lon: number;
  size: number;
  pulseOffset: number;
  blink: boolean;
}

/**
 * Fast Geodetic Landmass Detection Algorithm
 * Evaluates whether a given lat/lon coordinate belongs to world continental landmasses
 */
function isPointInLand(lat: number, lon: number): boolean {
  // North America & Central America
  if (lat >= 14 && lat <= 72 && lon >= -170 && lon <= -52) {
    if (lat > 55 && lon < -130) return true; // Alaska
    if (lat >= 60 && lon >= -55 && lon <= -18) return true; // Greenland
    if (lat >= 24 && lat <= 60 && lon >= -126 && lon <= -65) {
      if (lat >= 52 && lat <= 64 && lon >= -94 && lon <= -78) return false; // Hudson Bay
      if (lat >= 20 && lat <= 29 && lon >= -95 && lon <= -83) return false; // Gulf of Mexico
      return true;
    }
    if (lat >= 14 && lat <= 32 && lon >= -117 && lon <= -86) return true; // Mexico
    if (lat >= 8 && lat <= 16 && lon >= -92 && lon <= -77) return true; // Central America
  }

  // South America
  if (lat >= -56 && lat <= 13 && lon >= -82 && lon <= -34) {
    if (lat < -20) {
      const taper = (-20 - lat) * 0.7;
      if (lon >= -75 + taper && lon <= -45 - taper * 0.4) return true;
      return false;
    }
    if (lon >= -80 && lon <= -35) {
      if (lat > 5 && lon > -50) return false;
      return true;
    }
  }

  // Europe
  if (lat >= 35 && lat <= 71 && lon >= -11 && lon <= 42) {
    if (lat >= 55 && lat <= 71 && lon >= 5 && lon <= 32) return true; // Scandinavia
    if (lat >= 50 && lat <= 59 && lon >= -10 && lon <= 2) return true; // UK & Ireland
    if (lat >= 36 && lat <= 44 && lon >= -10 && lon <= 4) return true; // Iberian peninsula
    if (lat >= 37 && lat <= 46 && lon >= 7 && lon <= 19) return true; // Italy
    if (lat >= 42 && lat <= 58 && lon >= -5 && lon <= 35) return true; // Continental Europe
    if (lat >= 36 && lat <= 42 && lon >= 19 && lon <= 28) return true; // Greece & Balkans
  }

  // Africa
  if (lat >= -35 && lat <= 37 && lon >= -18 && lon <= 52) {
    if (lat >= -26 && lat <= -12 && lon >= 43 && lon <= 51) return true; // Madagascar
    if (lat >= 4 && lat <= 37 && lon >= -17 && lon <= 40) {
      if (lat < 12 && lon > 42) return true; // Horn of Africa
      return true;
    }
    if (lat >= -35 && lat < 4 && lon >= 8 && lon <= 42) {
      if (lat < -15 && (lon < 12 || lon > 35)) return false;
      return true;
    }
  }

  // Asia & Russia / Middle East
  if (lat >= 1 && lat <= 78 && lon >= 26 && lon <= 180) {
    if (lat >= 50 && lon >= 30) return true; // Siberia / Russia
    if (lat >= 36 && lat <= 42 && lon >= 26 && lon <= 45) return true; // Turkey
    if (lat >= 24 && lat <= 40 && lon >= 44 && lon <= 64) return true; // Iran & Middle East
    if (lat >= 12 && lat <= 32 && lon >= 34 && lon <= 60) return true; // Arabian peninsula
    if (lat >= 35 && lat <= 55 && lon >= 45 && lon <= 88) return true; // Central Asia
    if (lat >= 8 && lat <= 35 && lon >= 67 && lon <= 92) {
      if (lat < 20 && (lon < 72 || lon > 87)) return false;
      return true;
    }
    if (lat >= 20 && lat <= 52 && lon >= 75 && lon <= 135) return true; // China, Mongolia, Korea
    if (lat >= 30 && lat <= 46 && lon >= 129 && lon <= 146) return true; // Japan
    if (lat >= 8 && lat <= 23 && lon >= 98 && lon <= 110) return true; // SE Asia
    if (lat >= -10 && lat <= 7 && lon >= 95 && lon <= 142) return true; // Indonesia / Malaysia
    if (lat >= 5 && lat <= 19 && lon >= 120 && lon <= 127) return true; // Philippines
  }

  // Australia & New Zealand
  if (lat >= -48 && lat <= -10 && lon >= 112 && lon <= 179) {
    if (lat >= -39 && lat <= -11 && lon >= 113 && lon <= 154) return true; // Australia
    if (lat >= -44 && lat <= -40 && lon >= 144 && lon <= 149) return true; // Tasmania
    if (lat >= -47 && lat <= -34 && lon >= 166 && lon <= 178) return true; // New Zealand
  }

  return false;
}

/**
 * Pre-generate high-density dot matrix points for continents
 */
function generateContinentDots(): ContinentDot[] {
  const dots: ContinentDot[] = [];
  const latStep = 2.4;
  const lonStep = 2.4;

  for (let lat = -58; lat <= 72; lat += latStep) {
    // Adjust lon step near poles to maintain uniform spatial dot density
    const cosFactor = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    const effectiveLonStep = lonStep / cosFactor;

    for (let lon = -180; lon <= 180; lon += effectiveLonStep) {
      // Add slight jitter for natural cyber matrix appearance
      const jitterLat = lat + (Math.random() - 0.5) * 0.4;
      const jitterLon = lon + (Math.random() - 0.5) * 0.4;

      if (isPointInLand(jitterLat, jitterLon)) {
        dots.push({
          lat: jitterLat,
          lon: jitterLon,
          size: 1.1 + Math.random() * 0.9, // 1.1px to 2.0px
          pulseOffset: Math.random() * Math.PI * 2,
          blink: Math.random() > 0.88,
        });
      }
    }
  }

  return dots;
}

// Statically pre-computed to avoid recurring recalculation
const CONTINENT_DOTS: ContinentDot[] = generateContinentDots();

interface NetworkGlobe3DProps {
  theme?: GlobeThemeType;
}

export const NetworkGlobe3D: React.FC<NetworkGlobe3DProps> = ({ theme = 'obsidian' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { isEn } = useLanguage();

  const isLight = theme === 'light';

  const [metrics, setMetrics] = useState({
    throughput: '894.2 Gbps',
    activeLinks: 28,
    latency: '14.2 ms',
    packetsSec: '1,420,800 pps',
  });

  // Dynamic telemetry jitter
  useEffect(() => {
    const interval = setInterval(() => {
      const tp = (850 + Math.random() * 80).toFixed(1);
      const lat = (13.5 + Math.random() * 2).toFixed(1);
      const pps = (1400000 + Math.floor(Math.random() * 50000)).toLocaleString();
      setMetrics({
        throughput: `${tp} Gbps`,
        activeLinks: 28 + Math.floor(Math.random() * 3),
        latency: `${lat} ms`,
        packetsSec: `${pps} pps`,
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = container.clientWidth);
    let height = (canvas.height = container.clientHeight);

    const handleResize = () => {
      if (!container || !canvas) return;
      width = canvas.width = container.clientWidth;
      height = canvas.height = container.clientHeight;
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    // 3D Globe Parameters
    let rotationY = 0.8;
    let rotationX = 0.22;
    const autoSpeed = 0.0032;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    // Build Network Arcs
    const arcs: NetworkArc[] = [
      { sourceIdx: 0, targetIdx: 1, packets: [] }, // Tehran -> Dubai
      { sourceIdx: 0, targetIdx: 14, packets: [] }, // Tehran -> Istanbul
      { sourceIdx: 14, targetIdx: 2, packets: [] }, // Istanbul -> Frankfurt
      { sourceIdx: 2, targetIdx: 3, packets: [] }, // Frankfurt -> London
      { sourceIdx: 2, targetIdx: 4, packets: [] }, // Frankfurt -> Amsterdam
      { sourceIdx: 3, targetIdx: 5, packets: [] }, // London -> New York
      { sourceIdx: 5, targetIdx: 6, packets: [] }, // New York -> San Francisco
      { sourceIdx: 6, targetIdx: 7, packets: [] }, // San Francisco -> Tokyo
      { sourceIdx: 7, targetIdx: 8, packets: [] }, // Tokyo -> Singapore
      { sourceIdx: 8, targetIdx: 9, packets: [] }, // Singapore -> Sydney
      { sourceIdx: 8, targetIdx: 12, packets: [] }, // Singapore -> Mumbai
      { sourceIdx: 12, targetIdx: 1, packets: [] }, // Mumbai -> Dubai
      { sourceIdx: 5, targetIdx: 10, packets: [] }, // New York -> Sao Paulo
      { sourceIdx: 4, targetIdx: 13, packets: [] }, // Amsterdam -> Stockholm
      { sourceIdx: 3, targetIdx: 11, packets: [] }, // London -> Johannesburg
      { sourceIdx: 0, targetIdx: 2, packets: [] }, // Tehran -> Frankfurt
      { sourceIdx: 0, targetIdx: 12, packets: [] }, // Tehran -> Mumbai
    ];

    // Seed packets with theme-aware colors
    const darkColors = ['#38bdf8', '#818cf8', '#34d399', '#f43f5e', '#a855f7', '#fbbf24'];
    const lightColors = ['#2563eb', '#7c3aed', '#059669', '#e11d48', '#d97706', '#0284c7'];
    const activePalette = isLight ? lightColors : darkColors;

    arcs.forEach((arc) => {
      const packetCount = Math.floor(Math.random() * 3) + 2;
      for (let i = 0; i < packetCount; i++) {
        arc.packets.push({
          progress: Math.random(),
          speed: 0.008 + Math.random() * 0.012,
          color: activePalette[Math.floor(Math.random() * activePalette.length)],
          size: isLight ? 2.8 : 2.2 + Math.random() * 1.5,
        });
      }
    });

    // Helper: 3D point rotation
    const latLonTo3D = (latDeg: number, lonDeg: number, radius: number) => {
      const lat = (latDeg * Math.PI) / 180;
      const lon = (lonDeg * Math.PI) / 180;

      // Base sphere coordinates
      const x = radius * Math.cos(lat) * Math.sin(lon);
      const y = -radius * Math.sin(lat);
      const z = radius * Math.cos(lat) * Math.cos(lon);

      // Rotate around X axis
      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);
      const y1 = y * cosX - z * sinX;
      const z1 = y * sinX + z * cosX;

      // Rotate around Y axis
      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);
      const x2 = x * cosY + z1 * sinY;
      const z2 = -x * sinY + z1 * cosY;

      return { x: x2, y: y1, z: z2 };
    };

    // Mouse drag interaction
    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      document.body.classList.add('is-canvas-dragging');
      canvas.style.cursor = 'grabbing';
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      rotationY += dx * 0.005;
      rotationX += dy * 0.005;
      rotationX = Math.max(-0.9, Math.min(0.9, rotationX));
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };
    const onMouseUp = () => {
      isDragging = false;
      document.body.classList.remove('is-canvas-dragging');
      canvas.style.cursor = '';
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Touch interaction
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
        document.body.classList.add('is-canvas-dragging');
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - lastMouseX;
      const dy = e.touches[0].clientY - lastMouseY;
      rotationY += dx * 0.006;
      rotationX += dy * 0.006;
      rotationX = Math.max(-0.9, Math.min(0.9, rotationX));
      lastMouseX = e.touches[0].clientX;
      lastMouseY = e.touches[0].clientY;
    };
    const onTouchEnd = () => {
      isDragging = false;
      document.body.classList.remove('is-canvas-dragging');
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    let frame = 0;

    // Theme-specific color parameters
    const getThemeColors = () => {
      switch (theme) {
        case 'emerald':
          return {
            glowA: 'rgba(16, 185, 129, 0.25)',
            glowB: 'rgba(6, 182, 212, 0.08)',
            rim: 'rgba(16, 185, 129, 0.4)',
            grid: 'rgba(16, 185, 129, 0.1)',
            gridEq: 'rgba(52, 211, 153, 0.3)',
            arc: 'rgba(16, 185, 129, 0.45)',
            nodeCore: '#10b981',
            nodeEdge: '#34d399',
            dotColor: '#10b981',
            dotHighlight: '#6ee7b7',
          };
        case 'cobalt':
          return {
            glowA: 'rgba(2, 132, 199, 0.25)',
            glowB: 'rgba(14, 165, 233, 0.08)',
            rim: 'rgba(2, 132, 199, 0.4)',
            grid: 'rgba(2, 132, 199, 0.1)',
            gridEq: 'rgba(56, 189, 248, 0.3)',
            arc: 'rgba(2, 132, 199, 0.45)',
            nodeCore: '#0284c7',
            nodeEdge: '#38bdf8',
            dotColor: '#0284c7',
            dotHighlight: '#7dd3fc',
          };
        case 'rose':
          return {
            glowA: 'rgba(244, 63, 94, 0.25)',
            glowB: 'rgba(251, 113, 133, 0.08)',
            rim: 'rgba(244, 63, 94, 0.4)',
            grid: 'rgba(244, 63, 94, 0.1)',
            gridEq: 'rgba(251, 113, 133, 0.3)',
            arc: 'rgba(244, 63, 94, 0.45)',
            nodeCore: '#f43f5e',
            nodeEdge: '#fb7185',
            dotColor: '#f43f5e',
            dotHighlight: '#fda4af',
          };
        case 'amber':
          return {
            glowA: 'rgba(245, 158, 11, 0.25)',
            glowB: 'rgba(251, 191, 36, 0.08)',
            rim: 'rgba(245, 158, 11, 0.4)',
            grid: 'rgba(245, 158, 11, 0.1)',
            gridEq: 'rgba(251, 191, 36, 0.3)',
            arc: 'rgba(245, 158, 11, 0.45)',
            nodeCore: '#f59e0b',
            nodeEdge: '#fbbf24',
            dotColor: '#f59e0b',
            dotHighlight: '#fde68a',
          };
        case 'light':
          return {
            glowA: 'rgba(79, 70, 229, 0.15)',
            glowB: 'rgba(148, 163, 184, 0.08)',
            rim: 'rgba(79, 70, 229, 0.45)',
            grid: 'rgba(148, 163, 184, 0.25)',
            gridEq: 'rgba(79, 70, 229, 0.4)',
            arc: 'rgba(79, 70, 229, 0.45)',
            nodeCore: '#4338ca',
            nodeEdge: '#2563eb',
            dotColor: '#3b82f6',
            dotHighlight: '#1d4ed8',
          };
        case 'obsidian':
        default:
          return {
            glowA: 'rgba(99, 102, 241, 0.25)',
            glowB: 'rgba(56, 189, 248, 0.08)',
            rim: 'rgba(99, 102, 241, 0.35)',
            grid: 'rgba(99, 102, 241, 0.1)',
            gridEq: 'rgba(56, 189, 248, 0.25)',
            arc: 'rgba(99, 102, 241, 0.4)',
            nodeCore: '#38bdf8',
            nodeEdge: '#818cf8',
            dotColor: '#6366f1',
            dotHighlight: '#38bdf8',
          };
      }
    };

    const themePalette = getThemeColors();

    const render = () => {
      frame++;
      if (!isDragging) {
        rotationY += autoSpeed;
      }

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.36;

      // 1. Atmosphere Radial Glow Behind Globe
      const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.35);
      glowGrad.addColorStop(0, themePalette.glowA);
      glowGrad.addColorStop(0.5, themePalette.glowB);
      glowGrad.addColorStop(1, isLight ? 'rgba(241, 245, 249, 0)' : 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
      ctx.fill();

      // 2. Outer Rim Ring
      ctx.strokeStyle = themePalette.rim;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 3. Latitude Circles (Parallels)
      const latSteps = [-60, -30, 0, 30, 60];
      latSteps.forEach((lat) => {
        ctx.beginPath();
        const steps = 64;
        let first = true;
        for (let i = 0; i <= steps; i++) {
          const lon = (i * 360) / steps - 180;
          const p = latLonTo3D(lat, lon, radius);
          const px = cx + p.x;
          const py = cy + p.y;
          if (first) {
            ctx.moveTo(px, py);
            first = false;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.strokeStyle = lat === 0 ? themePalette.gridEq : themePalette.grid;
        ctx.lineWidth = lat === 0 ? 1.2 : 0.8;
        ctx.stroke();
      });

      // 4. Longitude Meridians
      const lonSteps = [0, 45, 90, 135, 180, 225, 270, 315];
      lonSteps.forEach((lon) => {
        ctx.beginPath();
        const steps = 48;
        let first = true;
        for (let i = 0; i <= steps; i++) {
          const lat = (i * 180) / steps - 90;
          const p = latLonTo3D(lat, lon, radius);
          const px = cx + p.x;
          const py = cy + p.y;
          if (first) {
            ctx.moveTo(px, py);
            first = false;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.strokeStyle = themePalette.grid;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      });

      // -------------------------------------------------------------
      // 5. CONTINENTS DOT MATRIX (Small & Dense Pixel Dots)
      // -------------------------------------------------------------
      for (let i = 0; i < CONTINENT_DOTS.length; i++) {
        const dot = CONTINENT_DOTS[i];
        const p = latLonTo3D(dot.lat, dot.lon, radius);

        // Cull dots that are on the backside
        if (p.z < -radius * 0.15) continue;

        const screenX = cx + p.x;
        const screenY = cy + p.y;

        // Front-facing depth alpha (0.15 to 1.0)
        const depthRatio = (p.z + radius * 0.15) / (radius * 1.15);
        let alpha = Math.max(0.12, Math.min(1.0, depthRatio));

        // Subtle dynamic pulse for live matrix effect
        const pulse = Math.sin(frame * 0.05 + dot.pulseOffset);
        let dotSize = dot.size;

        if (dot.blink && pulse > 0.6) {
          alpha = Math.min(1.0, alpha + 0.35);
          dotSize *= 1.3;
        }

        ctx.fillStyle = isLight
          ? `rgba(37, 99, 235, ${alpha * 0.85})`
          : dot.blink && pulse > 0.6
          ? themePalette.dotHighlight
          : themePalette.dotColor;

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(screenX, screenY, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // 6. Network Arcs & Real-time Transit Packets
      arcs.forEach((arc) => {
        const p1 = latLonTo3D(GLOBAL_NODES[arc.sourceIdx].lat, GLOBAL_NODES[arc.sourceIdx].lon, radius);
        const p2 = latLonTo3D(GLOBAL_NODES[arc.targetIdx].lat, GLOBAL_NODES[arc.targetIdx].lon, radius);

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const midZ = (p1.z + p2.z) / 2;
        const midLen = Math.sqrt(midX * midX + midY * midY + midZ * midZ) || 1;
        const arcElevation = radius * 1.28;
        const cp = {
          x: (midX / midLen) * arcElevation,
          y: (midY / midLen) * arcElevation,
          z: (midZ / midLen) * arcElevation,
        };

        const avgZ = (p1.z + p2.z + cp.z) / 3;
        const alpha = Math.max(0.08, Math.min(0.85, (avgZ + radius) / (radius * 2)));

        const sx1 = cx + p1.x;
        const sy1 = cy + p1.y;
        const scx = cx + cp.x;
        const scy = cy + cp.y;
        const sx2 = cx + p2.x;
        const sy2 = cy + p2.y;

        // Draw Arc curve
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.quadraticCurveTo(scx, scy, sx2, sy2);
        ctx.strokeStyle = isLight
          ? `rgba(79, 70, 229, ${alpha * 0.4})`
          : `rgba(99, 102, 241, ${alpha * 0.4})`;
        ctx.lineWidth = isLight ? 1.4 : 1.2;
        ctx.stroke();

        // Update & Render Packets
        arc.packets.forEach((pkt) => {
          pkt.progress += pkt.speed;
          if (pkt.progress > 1) {
            pkt.progress = 0;
          }

          const t = pkt.progress;
          const bx = (1 - t) * (1 - t) * sx1 + 2 * (1 - t) * t * scx + t * t * sx2;
          const by = (1 - t) * (1 - t) * sy1 + 2 * (1 - t) * t * scy + t * t * sy2;
          const bz = (1 - t) * (1 - t) * p1.z + 2 * (1 - t) * t * cp.z + t * t * p2.z;

          const pktAlpha = Math.max(0.15, Math.min(1, (bz + radius) / (radius * 1.8)));

          ctx.fillStyle = pkt.color;
          ctx.shadowColor = pkt.color;
          ctx.shadowBlur = isLight ? 6 : 10;
          ctx.beginPath();
          ctx.arc(bx, by, pkt.size * (0.8 + pktAlpha * 0.5), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        });
      });

      // 7. Network Nodes (Datacenters / Gateways)
      GLOBAL_NODES.forEach((node, idx) => {
        const p = latLonTo3D(node.lat, node.lon, radius);
        const px = cx + p.x;
        const py = cy + p.y;

        const isFacingFront = p.z > -radius * 0.2;
        const depthAlpha = Math.max(0.1, Math.min(1, (p.z + radius) / (radius * 1.8)));

        const pulse = Math.sin(frame * 0.08 + idx) * 2;
        const outerRadius = 4.5 + pulse;

        ctx.strokeStyle = isLight
          ? node.type === 'core'
            ? `rgba(67, 56, 202, ${depthAlpha})`
            : `rgba(37, 99, 235, ${depthAlpha})`
          : node.type === 'core'
          ? `rgba(56, 189, 248, ${depthAlpha})`
          : `rgba(129, 140, 248, ${depthAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, outerRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = isLight
          ? node.type === 'core'
            ? '#4338ca'
            : '#2563eb'
          : node.type === 'core'
          ? themePalette.nodeCore
          : themePalette.nodeEdge;

        ctx.shadowColor = isLight ? '#4338ca' : '#38bdf8';
        ctx.shadowBlur = isFacingFront ? 8 : 0;
        ctx.beginPath();
        ctx.arc(px, py, node.type === 'core' ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label if facing camera directly
        if (p.z > radius * 0.25) {
          ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.88)' : 'rgba(241, 245, 249, 0.88)';
          ctx.font = '600 10px monospace';
          ctx.textAlign = 'left';
          const label = isEn ? node.name : node.nameFa;
          ctx.fillText(label, px + 8, py + 3);
        }
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      document.body.classList.remove('is-canvas-dragging');
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isEn, theme, isLight]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[480px] flex items-center justify-center overflow-hidden select-none transition-colors duration-500 ${
        isLight
          ? 'bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-50/60'
          : 'bg-gradient-to-br from-slate-950 via-[#0a0f1d] to-[#030712]'
      }`}
    >
      {/* Background Cyber Grid Matrix */}
      <div
        className={`absolute inset-0 pointer-events-none ${
          isLight
            ? 'bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:32px_32px] opacity-15'
            : 'bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:32px_32px] opacity-15'
        }`}
      />

      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing z-10" />

      {/* Header Telemetry Badge */}
      <div className="absolute top-6 left-6 right-6 flex flex-wrap items-center justify-between gap-4 z-20 pointer-events-none">
        <div
          className={`flex items-center gap-3 backdrop-blur-md px-4 py-2 rounded-2xl border shadow-xl ${
            isLight
              ? 'bg-white/80 border-slate-200 text-slate-800'
              : 'bg-white/5 border-white/10 text-white'
          }`}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <div>
            <div
              className={`text-[11px] font-bold font-mono tracking-wider flex items-center gap-1.5 ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
              <span>{isEn ? 'GLOBAL MESH TOPOLOGY' : 'توپولوژی یکپارچه شبکه جهانی'}</span>
            </div>
            <p className={`text-[9px] font-sans ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Real-time Autonomous Cisco & MikroTik Fabric' : 'فابریک هوشمند روتینگ سیسکو و میکروتیک'}
            </p>
          </div>
        </div>

        <div
          className={`hidden lg:flex items-center gap-2 backdrop-blur-md px-3 py-1.5 rounded-xl border text-[11px] font-mono ${
            isLight
              ? 'bg-white/80 border-slate-200 text-indigo-700'
              : 'bg-white/5 border-white/10 text-cyan-300'
          }`}
        >
          <Shield className="w-3.5 h-3.5 text-emerald-500" />
          <span>{isEn ? 'ENCRYPTED BACKBONE (TLS 1.3 / IPSEC)' : 'بک‌بون رمزنگاری شده (TLS 1.3 / IPsec)'}</span>
        </div>
      </div>

      {/* Footer Metrics Overlay */}
      <div className="absolute bottom-6 left-6 right-6 grid grid-cols-2 sm:grid-cols-4 gap-3 z-20 pointer-events-none">
        <div
          className={`backdrop-blur-md p-3 rounded-xl border shadow-lg ${
            isLight
              ? 'bg-white/85 border-slate-200 text-slate-800'
              : 'bg-slate-900/60 border-white/10 text-white'
          }`}
        >
          <div className={`flex items-center gap-1.5 text-[10px] uppercase font-mono mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            <Activity className="w-3 h-3 text-cyan-500" />
            <span>{isEn ? 'THROUGHPUT' : 'پهنای باند فعال'}</span>
          </div>
          <div className={`font-bold font-mono text-sm sm:text-base ${isLight ? 'text-cyan-700' : 'text-cyan-300'}`}>
            {metrics.throughput}
          </div>
        </div>

        <div
          className={`backdrop-blur-md p-3 rounded-xl border shadow-lg ${
            isLight
              ? 'bg-white/85 border-slate-200 text-slate-800'
              : 'bg-slate-900/60 border-white/10 text-white'
          }`}
        >
          <div className={`flex items-center gap-1.5 text-[10px] uppercase font-mono mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            <Wifi className="w-3 h-3 text-indigo-500" />
            <span>{isEn ? 'TRANSIT LATENCY' : 'میانگین تاخیر (Latency)'}</span>
          </div>
          <div className={`font-bold font-mono text-sm sm:text-base ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
            {metrics.latency}
          </div>
        </div>

        <div
          className={`backdrop-blur-md p-3 rounded-xl border shadow-lg ${
            isLight
              ? 'bg-white/85 border-slate-200 text-slate-800'
              : 'bg-slate-900/60 border-white/10 text-white'
          }`}
        >
          <div className={`flex items-center gap-1.5 text-[10px] uppercase font-mono mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            <Radio className="w-3 h-3 text-emerald-500" />
            <span>{isEn ? 'ACTIVE TRUNKS' : 'پیوندهای فعال'}</span>
          </div>
          <div className={`font-bold font-mono text-sm sm:text-base ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
            {metrics.activeLinks} {isEn ? 'Circuits' : 'ترانک فیبر'}
          </div>
        </div>

        <div
          className={`backdrop-blur-md p-3 rounded-xl border shadow-lg ${
            isLight
              ? 'bg-white/85 border-slate-200 text-slate-800'
              : 'bg-slate-900/60 border-white/10 text-white'
          }`}
        >
          <div className={`flex items-center gap-1.5 text-[10px] uppercase font-mono mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            <Cpu className="w-3 h-3 text-amber-500" />
            <span>{isEn ? 'PACKET FLOW' : 'سرعت بسته‌ها'}</span>
          </div>
          <div className={`font-bold font-mono text-sm sm:text-base ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
            {metrics.packetsSec}
          </div>
        </div>
      </div>
    </div>
  );
};
