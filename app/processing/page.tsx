"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  ArrowUpDown, 
  ChevronDown, 
  ChevronRight, 
  X, 
  Factory, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Filter,
  Layers,
  Award,
  Check,
  Minus,
  ArrowRight,
  Package,
  Home 
} from 'lucide-react';

// --- Types ---
interface DailyProcess {
  id: number;
  summary_id: number;
  processing_date: string;
  process_type: string;
  process_number: string;
  input_qty: number;
  output_qty: number;
  milling_loss: number;
  processing_loss_gain_qty: number;
  input_value: number;
  output_value: number;
  pnl: number;
  trade_variables_updated: boolean;
}

// Updated based on your DB Schema
interface StrategyProcessing {
  id: number;
  process_id: number;
  strategy: string;
  batch_number: string; 
  input_qty: number | string; 
  output_qty: number | string;
  processing_loss_gain_qty: number | string;
  batch_status?: string;
}

interface GradeProcessing {
  id: number;
  process_id: number;
  grade: string;
  input_qty: number | string;
  output_qty: number | string;
}

interface ProcessDetails {
  strategies: StrategyProcessing[];
  grades: GradeProcessing[];
}

// --- Helper Functions ---
const formatNumber = (num: number, decimals = 2) => {
  if (num === undefined || num === null || isNaN(num)) return "0.00";
  return new Intl.NumberFormat('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  }).format(num);
};

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
};

// --- Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-[#968C83]/20 ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, colorClass }: { children: React.ReactNode; colorClass: string }) => (
  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${colorClass}`}>
    {children}
  </span>
);

// Donut Chart with Legend Component
const MiniDonutChart = ({ data, size = 100 }: { data: { label: string; value: number; color: string }[]; size?: number }) => {
    const total = data.reduce((acc, cur) => acc + (cur.value || 0), 0);
    
    if (total === 0 || isNaN(total)) return (
        <div className={`rounded-full bg-gray-100 flex items-center justify-center text-[9px] text-gray-400`} style={{ width: size, height: size }}>
            N/A
        </div>
    );

    let cumulativePercent = 0;

    const getCoordinatesForPercent = (percent: number) => {
        const x = Math.cos(2 * Math.PI * percent);
        const y = Math.sin(2 * Math.PI * percent);
        return [x, y];
    };

    return (
        <div className="flex items-center gap-4">
            {/* Donut Graphic */}
            <div className="relative shrink-0" style={{ width: size, height: size }}>
                <svg viewBox="-1 -1 2 2" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                    {data.map((slice, i) => {
                        if (slice.value === 0) return null;
                        const startPercent = cumulativePercent;
                        const slicePercent = slice.value / total;
                        cumulativePercent += slicePercent;
                        const endPercent = cumulativePercent;

                        const [startX, startY] = getCoordinatesForPercent(startPercent);
                        const [endX, endY] = getCoordinatesForPercent(endPercent);
                        const largeArcFlag = slicePercent > 0.5 ? 1 : 0;

                        if (slicePercent >= 1) {
                            return (
                                <circle key={i} cx="0" cy="0" r="0.8" fill={slice.color} stroke="white" strokeWidth="0.02">
                                    <title>{`${slice.label}: ${Math.round(slicePercent * 100)}% (${formatNumber(slice.value, 0)})`}</title>
                                </circle>
                            );
                        }

                        const pathData = [
                            `M ${startX} ${startY}`,
                            `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                            `L 0 0`,
                        ].join(' ');
                        
                        return (
                            <path 
                                key={i} 
                                d={pathData} 
                                fill={slice.color} 
                                stroke="white" 
                                strokeWidth="0.02"
                                className="hover:opacity-80 transition-opacity cursor-pointer"
                            >
                                <title>{`${slice.label}: ${Math.round(slicePercent * 100)}% (${formatNumber(slice.value, 0)})`}</title>
                            </path>
                        );
                    })}
                    {/* Thicker Donut: Reduced inner radius from 0.6 to 0.5 */}
                    <circle cx="0" cy="0" r="0.5" fill="white" />
                </svg>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-1.5 min-w-0">
                {data.slice(0, 5).map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                            <span className="truncate text-[#51534a] font-medium" title={d.label}>{d.label}</span>
                        </div>
                        <span className="font-mono text-[#968C83] text-[9px]">{Math.round((d.value / total) * 100)}%</span>
                    </div>
                ))}
                {data.length > 5 && (
                    <div className="text-[9px] text-[#968C83] italic pl-4">+{data.length - 5} others</div>
                )}
            </div>
        </div>
    );
};

export default function ProcessingPage() {
  const router = useRouter();
  const [processes, setProcesses] = useState<DailyProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  
  const [selectedProcessType, setSelectedProcessType] = useState<string>('All');
  
  const [sortConfig, setSortConfig] = useState<{ key: keyof DailyProcess; direction: 'asc' | 'desc' }>({
    key: 'processing_date',
    direction: 'desc'
  });

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // 1. Fetch Process List
  useEffect(() => {
    async function fetchProcesses() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (fromDate) params.append('fromDate', fromDate);
        if (toDate) params.append('toDate', toDate);

        const res = await fetch(`/api/processes?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setProcesses(data);
        }
      } catch (error) {
        console.error("Failed to fetch processes", error);
      } finally {
        setLoading(false);
      }
    }
    fetchProcesses();
  }, [fromDate, toDate]);

  const processTypes = useMemo(() => {
    const types = new Set(processes.map(p => p.process_type));
    return ['All', ...Array.from(types)];
  }, [processes]);

  // 2. Filter & Sort Logic
  const processedData = useMemo(() => {
    let data = [...processes];

    if (search) {
      const lowerSearch = search.toLowerCase();
      data = data.filter(p => 
        p.process_number.toLowerCase().includes(lowerSearch) ||
        p.process_type.toLowerCase().includes(lowerSearch)
      );
    }

    if (selectedProcessType !== 'All') {
        data = data.filter(p => p.process_type === selectedProcessType);
    }

    data.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return data;
  }, [processes, search, sortConfig, selectedProcessType]);

  const stats = useMemo(() => {
    return processedData.reduce((acc, p) => ({
        totalPnl: acc.totalPnl + Number(p.pnl || 0),
        totalInput: acc.totalInput + Number(p.input_qty || 0),
        count: acc.count + 1
    }), { totalPnl: 0, totalInput: 0, count: 0 });
  }, [processedData]);

  const handleSort = (key: keyof DailyProcess) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column }: { column: keyof DailyProcess }) => {
    if (sortConfig.key !== column) return <ArrowUpDown size={14} className="ml-1 text-[#D6D2C4] opacity-50" />;
    return sortConfig.direction === 'asc' 
      ? <ChevronDown size={14} className="ml-1 text-[#007680] rotate-180" />
      : <ChevronDown size={14} className="ml-1 text-[#007680]" />;
  };

  const selectedProcess = processes.find(p => p.id === selectedProcessId);

  return (
    // Changed: h-screen and overflow-hidden to contain entire page in viewport
    <div className="h-screen bg-[#D6D2C4] font-sans text-[#51534a] p-4 md:p-8 flex justify-center overflow-hidden">
      {/* Changed: h-full to fill parent height */}
      <div className="w-full max-w-7xl flex gap-6 relative h-full">
      
      {/* LEFT PANE: LIST */}
      {/* Changed: h-full to Ensure column fills height */}
      <div className={`flex-1 flex flex-col gap-6 h-full transition-all duration-300 ${selectedProcessId ? 'w-1/2 hidden md:flex' : 'w-full'}`}>
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-[#51534a] flex items-center gap-2">
              <div className="w-8 h-8 bg-[#007680] rounded-lg flex items-center justify-center text-white">
                <Factory size={18} />
              </div>
              Daily Processing
            </h1>
            <p className="text-[#968C83] text-sm mt-1">Processes and P&L tracking</p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white border border-[#D6D2C4] rounded-lg px-3 py-1.5 shadow-sm">
                <Calendar size={14} className="text-[#007680]" />
                <input type="date" className="text-xs outline-none text-[#51534a] font-medium" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                <span className="text-[#D6D2C4]">-</span>
                <input type="date" className="text-xs outline-none text-[#51534a] font-medium" value={toDate} onChange={e => setToDate(e.target.value)} />
                
                {(fromDate || toDate) && (
                    <button 
                        onClick={() => { setFromDate(''); setToDate(''); }} 
                        className="ml-1 text-[#B9975B] hover:text-[#968C83] transition-colors p-1"
                        title="Clear dates"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            <button 
                onClick={() => router.push('/stacks')}
                className="bg-white p-2 rounded-lg border border-[#D6D2C4] shadow-sm text-[#51534a] hover:bg-[#F5F5F3] hover:text-[#007680] transition-all flex items-center justify-center"
                title="Go to Stacks"
            >
                <Home size={18} />
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
            <Card className="p-4 border-l-4 border-l-[#51534a] flex items-center justify-between">
                <div>
                    <div className="text-xs text-[#968C83] uppercase font-bold tracking-wider">Total processes</div>
                    <div className="text-xl font-bold text-[#51534a] mt-1">{stats.count}</div>
                </div>
                <div className="bg-[#51534a]/10 p-2 rounded-full text-[#51534a]">
                    <Factory size={20} />
                </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-[#007680] flex items-center justify-between">
                <div>
                    <div className="text-xs text-[#968C83] uppercase font-bold tracking-wider">Total Input</div>
                    <div className="text-xl font-bold text-[#007680] mt-1">{formatNumber(stats.totalInput, 0)} <span className="text-xs text-[#968C83]">kg</span></div>
                </div>
                 <div className="bg-[#007680]/10 p-2 rounded-full text-[#007680]">
                    <Layers size={20} />
                </div>
            </Card>
            <Card className={`p-4 border-l-4 flex items-center justify-between ${stats.totalPnl >= 0 ? 'border-l-[#97D700]' : 'border-l-[#B9975B]'}`}>
                <div>
                    <div className="text-xs text-[#968C83] uppercase font-bold tracking-wider">Net P&L</div>
                    <div className={`text-xl font-bold mt-1 ${stats.totalPnl >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>
                        {stats.totalPnl > 0 ? '+' : ''}{formatNumber(stats.totalPnl)} <span className="text-xs text-[#968C83] font-normal">USD</span>
                    </div>
                </div>
                <div className={`p-2 rounded-full ${stats.totalPnl >= 0 ? 'bg-[#97D700]/10 text-[#97D700]' : 'bg-[#B9975B]/10 text-[#B9975B]'}`}>
                    {stats.totalPnl >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                </div>
            </Card>
        </div>

        {/* Filters */}
        <Card className="p-4 flex flex-col sm:flex-row gap-4 items-center shrink-0">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" size={18} />
            <input 
              type="text"
              placeholder="Search Process #..."
              className="w-full pl-10 pr-4 py-2 border border-[#D6D2C4] rounded-lg focus:ring-2 focus:ring-[#007680] outline-none text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="relative w-full sm:w-48">
              <select 
                  className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm text-[#51534a] focus:ring-2 focus:ring-[#007680] outline-none appearance-none bg-white"
                  value={selectedProcessType}
                  onChange={(e) => setSelectedProcessType(e.target.value)}
              >
                  {processTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                  ))}
              </select>
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 text-[#968C83] pointer-events-none" size={14} />
          </div>

          <div className="text-xs text-[#968C83] font-mono whitespace-nowrap hidden sm:block">
            {processedData.length} Processes
          </div>
        </Card>

        {/* Table */}
        {/* flex-1 with overflow-hidden ensures this takes remaining space and scrolls internally */}
        <Card className="flex-1 overflow-hidden flex flex-col shadow-md border-none min-h-0">
          <div className="overflow-auto flex-1 custom-scrollbar">
            <table className="w-full text-sm text-left relative">
              <thead className="bg-[#51534a] text-white font-medium text-xs uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-4 cursor-pointer hover:bg-white/10" onClick={() => handleSort('processing_date')}>
                    <div className="flex items-center">Date <SortIcon column="processing_date" /></div>
                  </th>
                  <th className="py-3 px-4 cursor-pointer hover:bg-white/10" onClick={() => handleSort('process_number')}>
                    <div className="flex items-center">Process # <SortIcon column="process_number" /></div>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer hover:bg-white/10" onClick={() => handleSort('input_qty')}>
                    <div className="flex items-center justify-end">In Qty <SortIcon column="input_qty" /></div>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer hover:bg-white/10" onClick={() => handleSort('output_qty')}>
                    <div className="flex items-center justify-end">Out Qty <SortIcon column="output_qty" /></div>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-white/10" onClick={() => handleSort('trade_variables_updated')}>
                    <div className="flex items-center justify-center">Trade Vars <SortIcon column="trade_variables_updated" /></div>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer hover:bg-white/10" onClick={() => handleSort('pnl')}>
                    <div className="flex items-center justify-end">P&L ($) <SortIcon column="pnl" /></div>
                  </th>
                  <th className="py-3 px-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D6D2C4]">
                {loading ? (
                   <tr><td colSpan={7} className="p-8 text-center text-[#968C83]">Loading data...</td></tr>
                ) : processedData.length === 0 ? (
                   <tr><td colSpan={7} className="p-8 text-center text-[#968C83]">No processes found.</td></tr>
                ) : (
                  processedData.map((row) => {
                    const isSelected = selectedProcessId === row.id;
                    return (
                      <tr 
                        key={row.id} 
                        onClick={() => setSelectedProcessId(row.id)}
                        className={`cursor-pointer transition-colors border-l-4 ${
                          isSelected 
                            ? 'bg-[#007680]/5 border-l-[#007680]' 
                            : 'bg-white border-l-transparent hover:bg-[#F5F5F3] hover:border-l-[#D6D2C4]'
                        }`}
                      >
                        <td className="py-3 px-4 text-[#51534a] font-medium whitespace-nowrap">{formatDate(row.processing_date)}</td>
                        <td className="py-3 px-4 font-mono text-[#007680] text-xs font-bold">
                            {row.process_number}
                            <div className="text-[9px] text-[#968C83] font-sans font-normal uppercase">{row.process_type}</div>
                        </td>
                        <td className="py-3 px-4 text-right text-[#968C83] font-mono">{formatNumber(row.input_qty, 0)}</td>
                        <td className="py-3 px-4 text-right text-[#51534a] font-mono font-medium">{formatNumber(row.output_qty, 0)}</td>
                        
                        <td className="py-3 px-4 text-center">
                            {row.trade_variables_updated ? (
                                <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#97D700]/20 text-[#97D700]">
                                    <Check size={12} strokeWidth={3} />
                                </div>
                            ) : (
                                <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#D6D2C4]/30 text-[#968C83]">
                                    <Minus size={12} />
                                </div>
                            )}
                        </td>

                        <td className={`py-3 px-4 text-right font-bold font-mono ${
                          row.pnl > 0 ? 'text-[#97D700]' : row.pnl < 0 ? 'text-[#B9975B]' : 'text-[#968C83]'
                        }`}>
                          {row.pnl > 0 ? '+' : ''}{formatNumber(row.pnl)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <ChevronRight size={16} className={`text-[#D6D2C4] transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* RIGHT PANE: DETAILS MODAL / SLIDE-OVER */}
      {selectedProcessId && selectedProcess && (
        // Changed: Removed sticky and calc height, used h-full.
        <div className="w-full md:w-[60%] lg:w-[50%] flex flex-col gap-4 animate-in slide-in-from-right duration-300 h-full">
           <ProcessDetailsView process={selectedProcess} onClose={() => setSelectedProcessId(null)} />
        </div>
      )}

      </div>
    </div>
  );
}

// --- SUB-COMPONENT: DETAILS VIEW ---
function ProcessDetailsView({ process, onClose }: { process: DailyProcess; onClose: () => void }) {
  const [details, setDetails] = useState<ProcessDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetails() {
      setLoading(true);
      try {
        const res = await fetch(`/api/processes?id=${process.id}`);
        if (res.ok) {
          const data = await res.json();
          setDetails(data);
        }
      } catch (e) {
        console.error("Failed to fetch details", e);
      } finally {
        setLoading(false);
      }
    }
    fetchDetails();
  }, [process.id]);

  const pnlColor = process.pnl >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]';
  const pnlBg = process.pnl >= 0 ? 'bg-[#97D700]/10 border-[#97D700]/20' : 'bg-[#B9975B]/10 border-[#B9975B]/20';

  const { inputStrategyChart, outputStrategyChart, inputGradeChart, outputGradeChart, inputBatches, outputBatches } = useMemo(() => {
      if (!details) return { inputStrategyChart: [], outputStrategyChart: [], inputGradeChart: [], outputGradeChart: [], inputBatches: [], outputBatches: [] };

      const parse = (n: number | string) => Number(n || 0);

      const allBatches = details.strategies.map(s => ({
          ...s,
          input_qty: parse(s.input_qty),
          output_qty: parse(s.output_qty),
          processing_loss_gain_qty: parse(s.processing_loss_gain_qty)
      }));

      const inputBatches = allBatches
          .filter(s => s.input_qty > 0)
          .sort((a,b) => b.input_qty - a.input_qty);

      const outputBatches = allBatches
          .filter(s => s.output_qty > 0)
          .sort((a,b) => b.output_qty - a.output_qty);

      const groupByStrategy = (items: typeof allBatches, key: 'input_qty' | 'output_qty') => {
          const map = new Map<string, number>();
          items.forEach(item => {
              const val = item[key];
              if (val > 0) {
                  map.set(item.strategy, (map.get(item.strategy) || 0) + val);
              }
          });
          return Array.from(map.entries())
              .map(([strategy, value]) => ({ strategy, value }))
              .sort((a,b) => b.value - a.value);
      };

      const inputStrategyChart = groupByStrategy(inputBatches, 'input_qty');
      const outputStrategyChart = groupByStrategy(outputBatches, 'output_qty');

      const allGrades = details.grades.map(g => ({
          ...g,
          input_qty: parse(g.input_qty),
          output_qty: parse(g.output_qty)
      }));

      const inputGradeChart = allGrades.filter(g => g.input_qty > 0).sort((a,b) => b.input_qty - a.input_qty);
      const outputGradeChart = allGrades.filter(g => g.output_qty > 0).sort((a,b) => b.output_qty - a.output_qty);

      return { inputStrategyChart, outputStrategyChart, inputGradeChart, outputGradeChart, inputBatches, outputBatches };
  }, [details]);

  const COLORS = ['#007680', '#97D700', '#B9975B', '#5B3427', '#51534a', '#D6D2C4', '#A4DBE8'];
  
  const prepareChartData = (data: any[], valKey: string, labelKey: string) => {
      return data.map((item, idx) => ({
          label: item[labelKey],
          value: item[valKey],
          color: COLORS[idx % COLORS.length]
      }));
  };

  return (
    <div className="flex flex-col h-full bg-[#EFEFE9] rounded-xl shadow-2xl overflow-hidden border border-[#D6D2C4]">
      
      {/* Header */}
      <div className="bg-white p-4 border-b border-[#D6D2C4] flex justify-between items-start shrink-0">
        <div>
           <div className="flex items-center gap-2 mb-1">
             <h2 className="text-xl font-bold text-[#51534a] font-mono">{process.process_number}</h2>
             <Badge colorClass="bg-[#007680] text-white">{process.process_type}</Badge>
           </div>
           <p className="text-xs text-[#968C83] flex items-center gap-1">
             <Calendar size={12} /> {formatDate(process.processing_date)}
           </p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-[#F5F5F3] rounded-full text-[#968C83] transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-4 custom-scrollbar">
        
        {/* KPI Summary */}
        <div className={`p-4 rounded-xl border ${pnlBg} flex items-center justify-between shadow-sm bg-white`}>
           <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${process.pnl >= 0 ? 'bg-[#97D700]/20 text-[#97D700]' : 'bg-[#B9975B]/20 text-[#B9975B]'}`}>
                 {process.pnl >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
              </div>
              <div>
                 <div className="text-xs font-bold uppercase opacity-60">Theoretical P&L</div>
                 <div className={`text-2xl font-bold ${pnlColor}`}>
                    {process.pnl > 0 ? '+' : ''}{formatNumber(process.pnl)} <span className="text-xs text-[#51534a] font-normal">USD</span>
                 </div>
              </div>
           </div>
           <div className="text-right">
              <div className="text-xs text-[#968C83] mb-1">Processing Loss</div>
              <div className="font-mono font-bold text-[#51534a]">{formatNumber(process.processing_loss_gain_qty)} kg</div>
           </div>
        </div>

        {/* --- DETAILS SECTION --- */}
        {loading ? (
           <div className="py-12 text-center text-[#968C83] animate-pulse">Loading detailed breakdown...</div>
        ) : details ? (
           <div className="space-y-6">
              
              {/* SECTION 1: INPUTS */}
              <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#968C83] uppercase text-xs font-bold tracking-wider px-1">
                      <ArrowRight size={14} className="text-[#007680]" /> Inputs
                  </div>
                  
                  {/* BATCHES LIST (INPUT) */}
                  <Card className="p-3 bg-white">
                      <div className="text-[10px] text-[#968C83] uppercase font-bold mb-2 flex justify-between items-center border-b border-[#F5F5F3] pb-2">
                         <span className="flex items-center gap-1"><Package size={12}/> Input Batches</span>
                         <span className="font-mono text-[#007680]">{inputBatches.length} Items</span>
                      </div>
                      <div className="max-h-40 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-[#F5F5F3] text-[#968C83]">
                                <tr>
                                    <th className="py-1 px-2">Batch #</th>
                                    <th className="py-1 px-2">Strategy</th>
                                    <th className="py-1 px-2 text-right">Qty</th>
                                    <th className="py-1 px-2 text-right">Loss/Gain</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F3]">
                                {inputBatches.map(b => (
                                    <tr key={b.id}>
                                        <td className="py-1.5 px-2 font-mono text-[#007680] max-w-[100px] truncate" title={b.batch_number}>{b.batch_number}</td>
                                        <td className="py-1.5 px-2 text-[#51534a]">{b.strategy}</td>
                                        <td className="py-1.5 px-2 text-right font-medium">{formatNumber(b.input_qty as number, 0)}</td>
                                        <td className={`py-1.5 px-2 text-right font-medium ${Number(b.processing_loss_gain_qty) >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>
                                            {Number(b.processing_loss_gain_qty) > 0 ? '+' : ''}{formatNumber(Number(b.processing_loss_gain_qty), 2)}
                                        </td>
                                    </tr>
                                ))}
                                {inputBatches.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-[#968C83] italic">No input batch details</td></tr>}
                            </tbody>
                        </table>
                      </div>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Strategy Input */}
                      <Card className="p-3 bg-white">
                          <div className="text-[10px] text-[#968C83] uppercase font-bold mb-3 flex justify-between">
                              <span>Strategies (In)</span>
                              <span className="font-mono text-[#007680]">{formatNumber(process.input_qty, 0)} kg</span>
                          </div>
                          <div className="flex justify-center">
                              <MiniDonutChart data={prepareChartData(inputStrategyChart, 'value', 'strategy')} />
                          </div>
                      </Card>

                      {/* Grade Input - REPLACED WITH LIST */}
                      <Card className="p-3 bg-white flex flex-col h-full">
                          <div className="text-[10px] text-[#968C83] uppercase font-bold mb-3 flex justify-between">
                              <span>Grades (In)</span>
                              <span className="font-mono text-[#007680]">{formatNumber(process.input_qty, 0)} kg</span>
                          </div>
                          <div className="flex-1 overflow-y-auto custom-scrollbar max-h-32 space-y-1">
                              {inputGradeChart.length > 0 ? inputGradeChart.map((g, i) => (
                                  <div key={i} className="flex justify-between items-center text-xs py-1 border-b border-[#F5F5F3] last:border-0">
                                      <span className="text-[#51534a] font-medium truncate pr-2">{g.grade}</span>
                                      <span className="font-mono text-[#968C83] whitespace-nowrap">{formatNumber(g.input_qty as number, 0)}</span>
                                  </div>
                              )) : (
                                  <div className="text-center text-[#968C83] italic text-xs py-4">No grade data</div>
                              )}
                          </div>
                      </Card>
                  </div>
              </div>

              {/* SECTION 2: OUTPUTS */}
              <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#968C83] uppercase text-xs font-bold tracking-wider px-1">
                      <Layers size={14} className="text-[#B9975B]" /> Outputs
                  </div>

                  {/* BATCHES LIST (OUTPUT) */}
                  <Card className="p-3 bg-white">
                      <div className="text-[10px] text-[#968C83] uppercase font-bold mb-2 flex justify-between items-center border-b border-[#F5F5F3] pb-2">
                         <span className="flex items-center gap-1"><Package size={12}/> Output Batches</span>
                         <span className="font-mono text-[#B9975B]">{outputBatches.length} Items</span>
                      </div>
                      <div className="max-h-40 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-[#F5F5F3] text-[#968C83]">
                                <tr>
                                    <th className="py-1 px-2">Batch #</th>
                                    <th className="py-1 px-2">Strategy</th>
                                    <th className="py-1 px-2 text-right">Qty</th>
                                    <th className="py-1 px-2 text-right">Loss/Gain</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F3]">
                                {outputBatches.map(b => (
                                    <tr key={b.id}>
                                        <td className="py-1.5 px-2 font-mono text-[#B9975B] max-w-[100px] truncate" title={b.batch_number}>{b.batch_number}</td>
                                        <td className="py-1.5 px-2 text-[#51534a]">{b.strategy}</td>
                                        <td className="py-1.5 px-2 text-right font-medium">{formatNumber(b.output_qty as number, 0)}</td>
                                        <td className={`py-1.5 px-2 text-right font-medium ${Number(b.processing_loss_gain_qty) >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>
                                            {Number(b.processing_loss_gain_qty) > 0 ? '+' : ''}{formatNumber(Number(b.processing_loss_gain_qty), 2)}
                                        </td>
                                    </tr>
                                ))}
                                {outputBatches.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-[#968C83] italic">No output batch details</td></tr>}
                            </tbody>
                        </table>
                      </div>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Strategy Output */}
                      <Card className="p-3 bg-white">
                          <div className="text-[10px] text-[#968C83] uppercase font-bold mb-3 flex justify-between">
                              <span>Strategies (Out)</span>
                              <span className="font-mono text-[#B9975B]">{formatNumber(process.output_qty, 0)} kg</span>
                          </div>
                          <div className="flex justify-center">
                              <MiniDonutChart data={prepareChartData(outputStrategyChart, 'value', 'strategy')} />
                          </div>
                      </Card>

                      {/* Grade Output - REPLACED WITH LIST */}
                      <Card className="p-3 bg-white flex flex-col h-full">
                          <div className="text-[10px] text-[#968C83] uppercase font-bold mb-3 flex justify-between">
                              <span>Grades (Out)</span>
                              <span className="font-mono text-[#B9975B]">{formatNumber(process.output_qty, 0)} kg</span>
                          </div>
                          <div className="flex-1 overflow-y-auto custom-scrollbar max-h-32 space-y-1">
                              {outputGradeChart.length > 0 ? outputGradeChart.map((g, i) => (
                                  <div key={i} className="flex justify-between items-center text-xs py-1 border-b border-[#F5F5F3] last:border-0">
                                      <span className="text-[#51534a] font-medium truncate pr-2">{g.grade}</span>
                                      <span className="font-mono text-[#968C83] whitespace-nowrap">{formatNumber(g.output_qty as number, 0)}</span>
                                  </div>
                              )) : (
                                  <div className="text-center text-[#968C83] italic text-xs py-4">No grade data</div>
                              )}
                          </div>
                      </Card>
                  </div>
              </div>

           </div>
        ) : (
           <div className="py-8 text-center text-[#B9975B]">Failed to load details</div>
        )}

      </div>
    </div>
  );
}