import React, { useCallback, useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';
import { getDiagramIconRegistry } from '@sabbour/adaptive-ui-core';

// Register ELK layout engine for better node distribution
mermaid.registerLayoutLoaders(elkLayouts);

// Initialize mermaid with a polished, modern look
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    // Node colors
    primaryColor: '#EEF2FF',
    primaryBorderColor: '#818CF8',
    primaryTextColor: '#1E1B4B',
    // Edge colors
    lineColor: '#94A3B8',
    // Group/subgraph colors
    secondaryColor: '#F8FAFC',
    secondaryBorderColor: '#CBD5E1',
    tertiaryColor: '#FFFFFF',
    // Typography
    fontSize: '14px',
    fontFamily: '"Segoe UI", "Segoe UI Semibold", "Segoe UI Light", system-ui, -apple-system, sans-serif',
    // Background
    background: '#FFFFFF',
    mainBkg: '#EEF2FF',
    nodeBorder: '#818CF8',
    clusterBkg: '#F8FAFC',
    clusterBorder: '#CBD5E1',
    titleColor: '#1E293B',
    edgeLabelBackground: '#FFFFFF',
  },
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
    padding: 12,
    nodeSpacing: 80,
    rankSpacing: 90,
    useMaxWidth: false,
    defaultRenderer: 'elk',
  },
  securityLevel: 'loose',
});

interface ArchitectureDiagramProps {
  /** Mermaid diagram definition string */
  diagram: string;
  /** Title shown above the diagram */
  title?: string;
}

let diagramCounter = 0;

/** Move cluster labels to the end of the SVG so they paint above edges/arrows. */
function raiseClusterLabels(svg: Element) {
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  overlay.setAttribute('class', 'cluster-label-overlay');
  overlay.setAttribute('pointer-events', 'none');
  svg.appendChild(overlay);

  svg.querySelectorAll('.cluster-label').forEach((el) => {
    overlay.appendChild(el);
  });
}

/** Scale diagram to fit container (never upscale past 1x). */
function autoFitDiagram(
  container: HTMLElement,
  setScale: (fn: (s: number) => number) => void,
  setTranslate: (t: { x: number; y: number }) => void,
) {
  const svgEl = container.querySelector('svg');
  if (!svgEl) return;
  const svgW = svgEl.getAttribute('width') ? parseFloat(svgEl.getAttribute('width')!) : svgEl.getBoundingClientRect().width;
  const svgH = svgEl.getAttribute('height') ? parseFloat(svgEl.getAttribute('height')!) : svgEl.getBoundingClientRect().height;
  if (svgW <= 0 || svgH <= 0) return;
  const pad = 48;
  const rect = container.getBoundingClientRect();
  const fit = Math.min((rect.width - pad) / svgW, (rect.height - pad) / svgH, 1);
  if (fit > 0 && fit < 10) {
    setScale(() => fit);
    setTranslate({ x: 0, y: 0 });
  }
}

export function ArchitectureDiagram({ diagram, title }: ArchitectureDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const idRef = useRef(`arch-diagram-${++diagramCounter}`);

  // Pan & zoom state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!diagram || !containerRef.current) return;

    let cancelled = false;

    async function renderDiagram() {
      try {
        setError(null);

        let processedDiagram = diagram;

        // Escape parentheses inside bracket labels so Mermaid doesn't misparse them
        processedDiagram = processedDiagram.replace(
          /\[([^\]"]*\([^\]]*)\]/g,
          (_match, label) => `["${label}"]`
        );

        const { svg } = await mermaid.render(idRef.current, processedDiagram);

        if (!cancelled) {
          let enrichedSvg = svg;

          // Replace %%icon:name%% placeholders with <img> tags
          const iconRegistry = getDiagramIconRegistry();
          iconRegistry.forEach((url, name) => {
            const placeholder = `%%icon:${name}%%`;
            if (enrichedSvg.includes(placeholder)) {
              enrichedSvg = enrichedSvg.split(placeholder).join(
                `<img src="${url}" width="20" height="20" style="vertical-align:middle;margin-right:6px;flex-shrink:0;" />`
              );
            }
          });

          const diagramCSS = `<style>
            .architecture-diagram-svg svg { max-width: 100%; height: auto; }
            .architecture-diagram-svg .node rect,
            .architecture-diagram-svg .node circle,
            .architecture-diagram-svg .node polygon {
              rx: 8; ry: 8;
              filter: drop-shadow(0 1px 2px rgba(0,0,0,0.06));
              stroke-width: 1.5;
            }
            .architecture-diagram-svg .cluster rect {
              rx: 12 !important; ry: 12 !important;
              stroke-dasharray: none !important;
              fill: #F1F5F9 !important;
              stroke: #94A3B8 !important;
              stroke-width: 2 !important;
            }
            .architecture-diagram-svg .cluster-label,
            .architecture-diagram-svg .cluster .label {
              overflow: visible !important;
            }
            .architecture-diagram-svg .cluster-label foreignObject,
            .architecture-diagram-svg .cluster .label foreignObject {
              overflow: visible !important;
              width: 200% !important;
              margin-left: -50% !important;
            }
            .architecture-diagram-svg .cluster-label foreignObject div,
            .architecture-diagram-svg .cluster .label foreignObject div {
              overflow: visible !important;
              white-space: nowrap !important;
              width: auto !important;
              padding-top: 13px !important;
              font-family: 'Segoe UI', system-ui, sans-serif !important;
              font-weight: 600 !important;
              font-size: 15px !important;
              color: #475569 !important;
            }
            .architecture-diagram-svg .edgePath .path { stroke-width: 1.5; stroke: #94A3B8; }
            .architecture-diagram-svg .edgePath marker path { fill: #94A3B8; }
            .architecture-diagram-svg .edgeLabel {
              font-family: 'Segoe UI Light', 'Segoe UI', system-ui, sans-serif;
              font-size: 13px; background-color: #fff;
              padding: 2px 6px; border-radius: 4px;
            }
            .architecture-diagram-svg .nodeLabel {
              font-family: 'Segoe UI', system-ui, sans-serif;
              font-weight: 500; text-align: center;
              line-height: normal !important;
            }
            .architecture-diagram-svg .label foreignObject {
              text-align: center; overflow: visible !important;
            }
            .architecture-diagram-svg .label foreignObject div {
              display: flex; align-items: center; justify-content: center;
              text-align: center; line-height: normal !important; gap: 0;
            }
            .architecture-diagram-svg .label foreignObject div img { flex-shrink: 0; }
            .architecture-diagram-svg .node .label foreignObject div { overflow: visible !important; }
            .architecture-diagram-svg .node .label { text-align: center; }
          </style>`;

          enrichedSvg = diagramCSS + enrichedSvg;

          setSvgContent(enrichedSvg);

          requestAnimationFrame(() => {
            if (!containerRef.current) return;
            const diagramSvg = containerRef.current.querySelector('svg');
            if (diagramSvg) {
              raiseClusterLabels(diagramSvg);
            }
            autoFitDiagram(containerRef.current, setScale, setTranslate);
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || 'Failed to render diagram');
        }
      }
    }

    renderDiagram();
    return () => { cancelled = true; };
  }, [diagram]);

  // Wheel zoom — use native listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale(prev => Math.min(Math.max(prev * delta, 0.2), 5));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  }, [translate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setTranslate({
      x: translateStart.current.x + (e.clientX - panStart.current.x),
      y: translateStart.current.y + (e.clientY - panStart.current.y),
    });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    isPanning.current = false;
    (e.currentTarget as HTMLElement).style.cursor = 'grab';
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#FAFBFC',
      borderRight: '1px solid var(--adaptive-border, #E2E8F0)',
    } as React.CSSProperties,
  },
    // Title bar
    React.createElement('div', {
      style: {
        padding: '14px 20px',
        borderBottom: '1px solid var(--adaptive-border, #E2E8F0)',
        fontSize: '13px',
        fontWeight: 600,
        color: '#1E293B',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
        backgroundColor: '#FFFFFF',
        letterSpacing: '0.01em',
        justifyContent: 'space-between',
      } as React.CSSProperties,
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('span', { style: { fontSize: '16px' } }, '🏗️'),
        title || 'Solution Architecture'
      ),
      // Zoom controls
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: '4px' } as React.CSSProperties,
      },
        React.createElement('button', {
          onClick: () => setScale(s => Math.max(s * 0.8, 0.2)),
          title: 'Zoom out',
          style: {
            width: '28px', height: '28px', border: '1px solid #E2E8F0',
            borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer',
            fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748B',
          },
        }, '−'),
        React.createElement('span', {
          style: { fontSize: '11px', color: '#94A3B8', fontFamily: 'monospace', minWidth: '36px', textAlign: 'center' as const },
        }, `${Math.round(scale * 100)}%`),
        React.createElement('button', {
          onClick: () => setScale(s => Math.min(s * 1.2, 5)),
          title: 'Zoom in',
          style: {
            width: '28px', height: '28px', border: '1px solid #E2E8F0',
            borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer',
            fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748B',
          },
        }, '+'),
        React.createElement('button', {
          onClick: resetView,
          title: 'Reset view',
          style: {
            width: '28px', height: '28px', border: '1px solid #E2E8F0',
            borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer',
            fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748B', marginLeft: '4px',
          },
        }, '⟲')
      )
    ),

    // Diagram area (pannable + zoomable)
    React.createElement('div', {
      ref: containerRef,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      style: {
        flex: 1,
        overflow: 'hidden',
        padding: '24px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        cursor: 'grab',
        userSelect: 'none',
      } as React.CSSProperties,
    },
      error
        ? React.createElement('div', {
            style: {
              padding: '16px 20px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '10px',
              fontSize: '12px',
              color: '#991B1B',
              maxWidth: '360px',
              lineHeight: 1.5,
            },
          }, 'Diagram error: ', error)
        : svgContent
          ? React.createElement('div', {
              style: {
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                transition: isPanning.current ? 'none' : 'transform 0.1s ease-out',
              } as React.CSSProperties,
            },
              React.createElement('div', {
                dangerouslySetInnerHTML: { __html: svgContent },
                className: 'architecture-diagram-svg',
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  minHeight: '200px',
                  padding: '16px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
                },
              })
            )
          : React.createElement('div', {
              style: {
                color: 'var(--adaptive-text-secondary, #6b7280)',
                fontSize: '13px',
                textAlign: 'center',
                padding: '40px',
              } as React.CSSProperties,
            },
              React.createElement('div', {
                style: { fontSize: '32px', marginBottom: '12px' },
              }, '📐'),
              'Architecture diagram will appear here as you design your solution.'
            )
    )
  );
}
