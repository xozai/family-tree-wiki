import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as d3 from 'd3';
import api from '../lib/api';

interface TreeNode {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  deathYear: number | null;
  photo: string | null;
  children: TreeNode[];
}

type Mode = 'descendants' | 'ancestors';

const NODE_W = 160;
const NODE_H = 72;
const VGAP = 60;
const HGAP = 20;

function drawTree(
  svgEl: SVGSVGElement,
  data: TreeNode,
  mode: Mode,
  onNodeClick: (id: string) => void,
  apiBase: string,
) {
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const width = svgEl.clientWidth || 900;
  const height = svgEl.clientHeight || 600;

  // D3 hierarchy — for ancestors mode we flip the y-axis so root is at bottom
  const root = d3.hierarchy<TreeNode>(data);

  const treeLayout = d3
    .tree<TreeNode>()
    .nodeSize([NODE_W + HGAP, NODE_H + VGAP]);

  treeLayout(root);

  // Compute bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  root.each((d) => {
    const x = d.x ?? 0;
    const y = d.y ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

  const treeW = maxX - minX + NODE_W + 40;
  const treeH = maxY - minY + NODE_H + 40;

  const g = svg
    .append('g')
    .attr('transform', `translate(${width / 2 - (minX + maxX) / 2}, ${
      mode === 'ancestors'
        ? height - NODE_H - 40 - minY
        : 40 - minY
    })`);

  // Zoom & pan
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.15, 3])
    .on('zoom', (event) => g.attr('transform', event.transform.toString()));

  svg.call(zoom);

  // Initial centering transform
  const initialX = width / 2 - (minX + maxX) / 2;
  const initialY = mode === 'ancestors'
    ? height - NODE_H - 40 - minY
    : 40 - minY;
  svg.call(zoom.transform, d3.zoomIdentity.translate(initialX, initialY));

  // Fit to screen button helper stored externally
  (svgEl as unknown as { fitFn?: () => void }).fitFn = () => {
    const scale = Math.min(0.9, Math.min(width / treeW, height / treeH));
    const tx = width / 2 - (minX + maxX) / 2 * scale;
    const ty = mode === 'ancestors'
      ? height / 2 + (treeH / 2 - maxY) * scale
      : height / 2 - (treeH / 2 - minY + minY) * scale + 20;
    svg.transition().duration(400).call(
      zoom.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale),
    );
  };

  // ── Links ──────────────────────────────────────────────────────────────────
  const linkGen = d3.linkVertical<d3.HierarchyLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
    .x((d) => d.x ?? 0)
    .y((d) => mode === 'ancestors' ? -(d.y ?? 0) : (d.y ?? 0));

  g.selectAll<SVGPathElement, d3.HierarchyLink<TreeNode>>('.link')
    .data(root.links())
    .join('path')
    .attr('fill', 'none')
    .attr('stroke', '#d4c4a8')
    .attr('stroke-width', 1.5)
    .attr('d', (d) =>
      linkGen({
        source: d.source as d3.HierarchyPointNode<TreeNode>,
        target: d.target as d3.HierarchyPointNode<TreeNode>,
      }) ?? '',
    );

  // ── Nodes ──────────────────────────────────────────────────────────────────
  const node = g
    .selectAll<SVGGElement, d3.HierarchyPointNode<TreeNode>>('.node')
    .data(root.descendants() as d3.HierarchyPointNode<TreeNode>[])
    .join('g')
    .attr('class', 'node')
    .attr('cursor', 'pointer')
    .attr('transform', (d) =>
      `translate(${(d.x ?? 0) - NODE_W / 2}, ${
        mode === 'ancestors' ? -(d.y ?? 0) - NODE_H / 2 : (d.y ?? 0) - NODE_H / 2
      })`,
    )
    .on('click', (_, d) => onNodeClick(d.data.id));

  // Drop shadow filter
  const defs = svg.append('defs');
  const filter = defs.append('filter').attr('id', 'shadow');
  filter.append('feDropShadow')
    .attr('dx', '0').attr('dy', '1')
    .attr('stdDeviation', '2')
    .attr('flood-color', '#00000018');

  // Card background
  node
    .append('rect')
    .attr('width', NODE_W)
    .attr('height', NODE_H)
    .attr('rx', 10)
    .attr('fill', (d) => (d.depth === 0 ? '#7c5c38' : '#ffffff'))
    .attr('stroke', (d) => (d.depth === 0 ? '#5a4028' : '#e5ddd0'))
    .attr('stroke-width', 1)
    .attr('filter', 'url(#shadow)');

  // Photo circle clip
  const clipId = (d: d3.HierarchyPointNode<TreeNode>) => `clip-${d.data.id}`;
  node.append('clipPath')
    .attr('id', (d) => clipId(d))
    .append('circle')
    .attr('cx', 28).attr('cy', NODE_H / 2).attr('r', 20);

  // Photo or avatar background
  node.append('circle')
    .attr('cx', 28).attr('cy', NODE_H / 2).attr('r', 20)
    .attr('fill', (d) => (d.depth === 0 ? '#a07850' : '#f5ede0'));

  // Photo image (only if available)
  node.filter((d) => !!d.data.photo)
    .append('image')
    .attr('x', 8).attr('y', NODE_H / 2 - 20)
    .attr('width', 40).attr('height', 40)
    .attr('clip-path', (d) => `url(#${clipId(d)})`)
    .attr('preserveAspectRatio', 'xMidYMid slice')
    .attr('href', (d) => `${apiBase.replace('/api', '')}${d.data.photo}`);

  // Avatar icon for no photo
  node.filter((d) => !d.data.photo)
    .append('text')
    .attr('x', 28).attr('y', NODE_H / 2 + 6)
    .attr('text-anchor', 'middle')
    .attr('font-size', 18)
    .text('👤');

  // Name
  node
    .append('text')
    .attr('x', 56).attr('y', 22)
    .attr('font-size', 11)
    .attr('font-weight', '600')
    .attr('fill', (d) => (d.depth === 0 ? '#ffffff' : '#3d2e1a'))
    .text((d) => d.data.firstName);

  node
    .append('text')
    .attr('x', 56).attr('y', 36)
    .attr('font-size', 11)
    .attr('font-weight', '600')
    .attr('fill', (d) => (d.depth === 0 ? '#ffe8c0' : '#3d2e1a'))
    .text((d) => d.data.lastName);

  // Years
  node
    .append('text')
    .attr('x', 56).attr('y', 52)
    .attr('font-size', 9.5)
    .attr('fill', (d) => (d.depth === 0 ? '#f0d5a0' : '#9e8a72'))
    .text((d) => {
      const b = d.data.birthYear ?? '?';
      const dd = d.data.deathYear ?? '';
      return dd ? `${b} – ${dd}` : `b. ${b}`;
    });

  // Hover highlight
  node
    .on('mouseenter', function () {
      d3.select(this).select('rect')
        .attr('stroke', '#b07840')
        .attr('stroke-width', 2);
    })
    .on('mouseleave', function (_, d) {
      d3.select(this).select('rect')
        .attr('stroke', d.depth === 0 ? '#5a4028' : '#e5ddd0')
        .attr('stroke-width', 1);
    });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FamilyTreePage() {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [rootId, setRootId] = useState<string>(routeId ?? '');
  const [rootName, setRootName] = useState('');
  const [mode, setMode] = useState<Mode>('descendants');
  const [depth, setDepth] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const apiBase = import.meta.env.VITE_API_URL || '/api';
  const isTouch = useMemo(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0, []);

  const loadTree = useCallback(async (id: string, m: Mode, d: number) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/members/${id}/tree`, { params: { mode: m, depth: d } });
      setTreeData(data.root);
      setRootName(`${data.root.firstName} ${data.root.lastName}`);
    } catch {
      setError('Could not load tree. Member not found or no relationships exist.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rootId) loadTree(rootId, mode, depth);
  }, [rootId, mode, depth, loadTree]);

  // Render D3 tree whenever data or container size changes
  useEffect(() => {
    if (!treeData || !svgRef.current) return;
    drawTree(svgRef.current, treeData, mode, (id) => navigate(`/members/${id}`), apiBase);
  }, [treeData, mode, navigate, apiBase]);

  // Re-draw on container resize (handles orientation change on mobile)
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (treeData && svgRef.current) {
        drawTree(svgRef.current, treeData, mode, (id) => navigate(`/members/${id}`), apiBase);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [treeData, mode, navigate, apiBase]);

  // Member search for root selection
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await api.get('/members', { params: { search, limit: 8 } });
      setSearchResults(data.members);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  function handleFit() {
    const el = svgRef.current as (SVGSVGElement & { fitFn?: () => void }) | null;
    el?.fitFn?.();
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 130px)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 overflow-x-auto pb-4 border-b border-stone-200 mb-4 min-w-0 scrollbar-hide">
        <h1 className="font-serif text-xl font-semibold text-stone-800 mr-2">Family Tree</h1>

        {/* Root person selector */}
        <div className="relative">
          <button
            onClick={() => setShowSearch((s) => !s)}
            className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm bg-white hover:bg-stone-50 flex items-center gap-2"
          >
            <span className="text-stone-500">Root:</span>
            <span className="font-medium text-stone-700 max-w-[120px] truncate">
              {rootName || 'Select person…'}
            </span>
            <span className="text-stone-400 text-xs">▼</span>
          </button>

          {showSearch && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-stone-200 rounded-xl shadow-lg z-20">
              <div className="p-2">
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name…"
                  className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {searchResults.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setRootId(m.id);
                      setSearch('');
                      setShowSearch(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-stone-50 text-stone-700"
                  >
                    {m.firstName} {m.lastName}
                  </button>
                ))}
                {search && searchResults.length === 0 && (
                  <div className="px-4 py-3 text-sm text-stone-400">No results</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex border border-stone-300 rounded-lg overflow-hidden text-sm">
          {(['descendants', 'ancestors'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                mode === m ? 'bg-amber-700 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Depth */}
        <div className="flex items-center gap-2 text-sm text-stone-600">
          <span>Depth:</span>
          {[2, 3, 4, 5].map((d) => (
            <button
              key={d}
              onClick={() => setDepth(d)}
              className={`w-8 h-8 rounded-lg text-sm transition-colors ${
                depth === d ? 'bg-amber-700 text-white' : 'border border-stone-300 hover:bg-stone-50'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={handleFit}
            className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm hover:bg-stone-50 text-stone-600"
            title="Fit to screen"
          >
            ⊡ Fit
          </button>
          {rootId && (
            <Link
              to={`/members/${rootId}`}
              className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm hover:bg-stone-50 text-stone-600"
            >
              View Profile →
            </Link>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 bg-stone-50 rounded-xl border border-stone-200 overflow-hidden relative">
        {!rootId && (
          <div className="absolute inset-0 flex items-center justify-center text-stone-400">
            <div className="text-center">
              <div className="text-5xl mb-3">🌳</div>
              <p className="font-medium">Select a family member to start</p>
              <p className="text-sm mt-1">Use the Root selector above</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-50/80 z-10">
            <div className="text-stone-400 text-center">
              <div className="text-3xl mb-2 animate-pulse">🌳</div>
              <p>Building tree…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-sm">
              <p className="text-red-600 text-sm">{error}</p>
              <p className="text-stone-400 text-xs mt-2">
                Make sure this member has relationships set up.
              </p>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{ display: treeData && !loading ? 'block' : 'none', touchAction: 'none' }}
        />

        {/* Legend */}
        {treeData && !loading && (
          <div className="absolute bottom-4 right-4 bg-white/90 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-500 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-4 h-3 rounded bg-amber-800" />
              <span>Root person</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded border border-stone-300 bg-white" />
              <span>Related member</span>
            </div>
            <div className="mt-1.5 text-stone-400">
            {isTouch ? 'Pinch to zoom · Drag to pan · Tap to profile' : 'Scroll to zoom · Drag to pan · Click to profile'}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
