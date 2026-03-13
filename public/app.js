const { useState, useEffect, useRef, useCallback } = React;

    const DARK = {
      bg:"#04060f", bgCard:"#090e1c", bgCardHover:"#0d1428",
      bgGlass:"rgba(255,255,255,0.03)",
      cyan:"#38bdf8", cyanGlow:"#0ea5e9",
      green:"#34d399", greenGlow:"#10b981",
      purple:"#a78bfa", purpleGlow:"#8b5cf6",
      red:"#f87171", yellow:"#fbbf24",
      border:"#1a2840", borderBright:"#243550",
      text:"#e8edf5", textMuted:"#5a7090", textDim:"#1e2e44",
      logoBlue:"#38bdf8",
      accent1:"#38bdf8", accent2:"#a78bfa",
      navBg:"#04060f", cardShadow:"0 2px 16px rgba(0,0,0,0.5)",
      inputBg:"rgba(255,255,255,0.04)", inputBorder:"#1a2840",
    };
    const LIGHT = {
      bg:"#f0f4fa", bgCard:"#ffffff", bgCardHover:"#f5f8ff",
      bgGlass:"rgba(0,0,0,0.02)",
      cyan:"#0369a1", cyanGlow:"#0284c7",
      green:"#047857", greenGlow:"#059669",
      purple:"#6d28d9", purpleGlow:"#7c3aed",
      red:"#dc2626", yellow:"#d97706",
      border:"#dde5f0", borderBright:"#c8d5e8",
      text:"#0f1629", textMuted:"#556070", textDim:"#b0bdd0",
      logoBlue:"#0369a1",
      accent1:"#0369a1", accent2:"#6d28d9",
      navBg:"#ffffff", cardShadow:"0 2px 12px rgba(0,0,0,0.08)",
      inputBg:"rgba(0,0,0,0.03)", inputBorder:"#dde5f0",
    };

    // Base portfolio — prices get overwritten by live data
    const BASE_PORTFOLIO = [
      { symbol:"NVDA",  name:"NVIDIA Corp",    shares:12, avg:485.2,  sector:"Tech"     },
      { symbol:"AAPL",  name:"Apple Inc",      shares:25, avg:172.5,  sector:"Tech"     },
      { symbol:"MSFT",  name:"Microsoft Corp", shares:8,  avg:380.0,  sector:"Tech"     },
      { symbol:"AMZN",  name:"Amazon.com",     shares:15, avg:148.3,  sector:"Consumer" },
      { symbol:"TSLA",  name:"Tesla Inc",      shares:20, avg:215.0,  sector:"Auto"     },
      { symbol:"GOOGL", name:"Alphabet Inc",   shares:10, avg:140.0,  sector:"Tech"     },
    ];

    const PERF_DATA = [
      38.2,38.8,37.9,39.1,40.3,39.7,41.2,42.0,41.5,43.1,
      44.2,43.8,45.0,46.1,45.3,47.2,46.8,48.0,47.4,49.1,
      48.6,50.2,49.8,51.3,50.7,52.1,51.6,53.0,52.4,54.18,
    ];

    const NEWS = [
      { time:"2m ago",  ticker:"NVDA",  headline:"NVIDIA surges on AI chip demand exceeding analyst expectations", sentiment:"bullish" },
      { time:"14m ago", ticker:"AAPL",  headline:"Apple Vision Pro sales disappoint in Q1 but services revenue hits record", sentiment:"neutral" },
      { time:"31m ago", ticker:"GOOGL", headline:"Alphabet beats on cloud revenue, AI search integration drives engagement", sentiment:"bullish" },
      { time:"1h ago",  ticker:"TSLA",  headline:"Tesla misses delivery targets amid price war intensification in China", sentiment:"bearish" },
      { time:"2h ago",  ticker:"MSFT",  headline:"Microsoft Azure AI revenue up 45% YoY, Copilot adoption crosses 1M seats", sentiment:"bullish" },
    ];

    const INIT_ALERTS = [
      { id:1, symbol:"NVDA", type:"price",  condition:"above", value:900,  active:true  },
      { id:2, symbol:"TSLA", type:"change", condition:"below", value:-3,   active:true  },
      { id:3, symbol:"AAPL", type:"price",  condition:"above", value:210,  active:false },
    ];

    const FALLBACK = {
      nvda:      "**NVDA Analysis** ↗\n\nNVIDIA is a leading AI infrastructure play. Check current price vs your average for real gain/loss. Key risk: high P/E valuation sensitive to rate changes. Consensus target: ~$950.",
      rebalance: "**Portfolio Rebalance Suggestion** ⚖\n\nTech concentration may exceed recommended 40-50%.\n\n• Consider trimming top gainers\n• Add healthcare or dividend exposure\n• Reduces volatility by ~18% historically.",
      tsla:      "**TSLA Risk Assessment** ⚠\n\nTesla faces margin compression and BYD competition. FSD licensing and Energy division show promise. Consider a stop-loss strategy if holding.",
      default:   "I can analyze your portfolio, suggest rebalancing strategies, explain market trends, or help research specific stocks. What would you like to explore?",
    };

    function getFallback(msg) {
      const l = msg.toLowerCase();
      if (l.includes("nvda")||l.includes("nvidia")) return FALLBACK.nvda;
      if (l.includes("rebalanc")) return FALLBACK.rebalance;
      if (l.includes("tsla")||l.includes("tesla")) return FALLBACK.tsla;
      return FALLBACK.default;
    }

    const AI_LIMIT = 9999;

    // ── API helpers ──────────────────────────────────────────────────────────────
    async function fetchQuote(symbol, finnhubKey) {
      const r = await fetch(`/api/finnhub?endpoint=quote&symbol=${encodeURIComponent(symbol)}`);
      if (!r.ok) throw new Error(`Finnhub ${r.status}`);
      return r.json(); // { c: currentPrice, d: change, dp: changePct, o, h, l, pc }
    }

    async function fetchMarketIndices(finnhubKey) {
      const symbols = ["^GSPC","^IXIC","^DJI"];
      const results = await Promise.allSettled(symbols.map(s => fetchQuote(s, finnhubKey)));
      return results.map((r, i) => ({
        symbol: symbols[i],
        data: r.status === "fulfilled" ? r.value : null,
      }));
    }

    async function callClaude({ system, messages, max_tokens = 1000 }) {
      const resp = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens, system, messages }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      return data.content?.map(b => b.text || "").join("") || "";
    }

    // ── Small UI helpers ─────────────────────────────────────────────────────────
    function Spinner({ color }) {
      return <div style={{ width:12, height:12, border:`2px solid ${color}44`, borderTop:`2px solid ${color}`, borderRadius:"50%", animation:"spin 0.8s linear infinite", display:"inline-block" }} />;
    }

    function Sparkline({ positive, C }) {
      const pts = positive
        ? "0,20 10,18 20,15 30,17 40,12 50,8 60,10 70,6 80,4 90,7 100,2"
        : "0,4 10,6 20,3 30,8 40,10 50,7 60,12 70,15 80,11 90,17 100,19";
      const color = positive ? C.green : C.red;
      const gid = `sg${positive?"p":"n"}`;
      return (
        <svg width="100" height="24" viewBox="0 0 100 24" style={{ overflow:"visible", pointerEvents:"none" }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
              <stop offset="100%" stopColor={color} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polygon points={`0,20 ${pts} 100,24 0,24`} fill={`url(#${gid})`}/>
          <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    }

    const RANGE_TABS = [
      { label:"1D",  days:1,    resolution:"5",  maxPts:78  },
      { label:"5D",  days:5,    resolution:"60", maxPts:40  },
      { label:"1M",  days:30,   resolution:"D",  maxPts:30  },
      { label:"6M",  days:180,  resolution:"D",  maxPts:130 },
      { label:"1Y",  days:365,  resolution:"D",  maxPts:252 },
      { label:"ALL", days:1825, resolution:"W",  maxPts:260 },
    ];

    function PerformanceGraph({ C, portfolio, finnhubKey }) {
      const W=580, H=110, PAD=10;
      const [range, setRange]     = useState("1M");
      const [cache, setCache]     = useState({});   // range → data array
      const [loading, setLoading] = useState(false);
      const [hover, setHover]     = useState(null);
      const svgRef = useRef(null);

      const todayValue = portfolio.reduce((s,h) => s + h.shares*(h.price||h.avg), 0);

      const buildEstimated = (days, holdings) => {
        const startValue = holdings.reduce((s,h) => s + h.shares * h.avg, 0);
        const endValue   = holdings.reduce((s,h) => s + h.shares * (h.price||h.avg), 0);
        const pts = Math.min(days, 60);
        return Array.from({length: pts}, (_,i) => {
          const t = i/(pts-1);
          const noise = Math.sin(i*2.3)*0.013 + Math.sin(i*0.7)*0.009 + Math.sin(i*4.1)*0.005;
          const val = startValue + (endValue-startValue)*t + startValue*noise;
          const d = new Date(Date.now() - (pts-1-i)*24*60*60*1000*(days/pts));
          return { date: d.toISOString().slice(0,10), val: i===pts-1 ? endValue : Math.max(0,val) };
        });
      };

      // Portfolio signature for cache invalidation — includes shares+avg so ADD MORE triggers refresh
      const portfolioSig = portfolio.map(h=>`${h.symbol}:${h.shares}:${h.avg}:${h.price||0}`).join(",");

      useEffect(() => {
        if (!finnhubKey || !portfolio.length) return;

        const tab = RANGE_TABS.find(t => t.label === range);
        const now  = Math.floor(Date.now()/1000);
        const from = now - tab.days*24*60*60;

        const rangeStartDate = new Date((now - tab.days*24*60*60)*1000).toISOString().slice(0,10);
        const earliest = portfolio.reduce((min,h) => h.dateAdded && h.dateAdded < min ? h.dateAdded : min, rangeStartDate);
        const fromTs = range==="ALL" ? Math.floor(new Date(earliest).getTime()/1000) : from;

        const stockHoldings  = portfolio.filter(h => !h.symbol.includes(":"));
        const cryptoHoldings = portfolio.filter(h => h.symbol.includes(":"));

        setLoading(true);

        Promise.allSettled(
          stockHoldings.map(h =>
            fetch(`/api/finnhub?endpoint=candle&symbol=${encodeURIComponent(h.symbol)}&resolution=${tab.resolution}&from=${fromTs}&to=${now}`)
              .then(r => r.json())
              .then(d => ({ symbol:h.symbol, shares:h.shares, price:h.price, dateAdded:h.dateAdded, candles:d }))
          )
        ).then(results => {
          const dayMap = {};
          let anySuccess = false;

          results.forEach(r => {
            if (r.status!=="fulfilled") return;
            const { shares, candles, dateAdded } = r.value;
            if (!candles || candles.s!=="ok" || !candles.t || !candles.t.length) return;
            anySuccess = true;
            candles.t.forEach((ts,i) => {
              const key = range==="1D"
                ? new Date(ts*1000).toISOString().slice(0,16)
                : new Date(ts*1000).toISOString().slice(0,10);
              const dayStr = new Date(ts*1000).toISOString().slice(0,10);
              if (dateAdded && dayStr < dateAdded) return;
              dayMap[key] = (dayMap[key]||0) + shares * candles.c[i];
            });
          });

          cryptoHoldings.forEach(h => {
            Object.keys(dayMap).forEach(k => {
              const dayStr = k.slice(0,10);
              if (h.dateAdded && dayStr < h.dateAdded) return;
              dayMap[k] = (dayMap[k]||0) + h.shares*(h.price||h.avg);
            });
          });

          let sorted = Object.entries(dayMap)
            .sort((a,b) => a[0].localeCompare(b[0]))
            .slice(-tab.maxPts)
            .map(([date,val]) => ({date,val}));

          if (anySuccess && sorted.length >= 2) {
            sorted[sorted.length-1].val = todayValue;
            setCache(c => ({...c, [range]: sorted}));
          } else {
            // Candles unavailable (free tier) — use estimated curve
            setCache(c => ({...c, [range]: buildEstimated(tab.days, portfolio)}));
          }
          setLoading(false);
        }).catch(() => {
          setCache(c => ({...c, [range]: buildEstimated(tab.days, portfolio)}));
          setLoading(false);
        });
      }, [range, finnhubKey, portfolioSig]);

      // Clear cache when portfolio composition changes
      useEffect(() => { setCache({}); }, [portfolioSig]);

      const tab = RANGE_TABS.find(t => t.label===range);
      const data = cache[range] || (portfolio.length ? buildEstimated(tab.days, portfolio) : null);

      if (!data) {
        return (
          <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:16, padding:"14px 16px", marginBottom:18 }}>
            <div style={{ fontSize:10, color:C.textMuted, textAlign:"center", padding:"30px 0" }}>
              Add stocks to your portfolio to see performance
            </div>
          </div>
        );
      }

      const vals    = data.map(d => d.val);
      const minV    = Math.min(...vals)*0.997;
      const maxV    = Math.max(...vals)*1.003;
      const range_  = maxV-minV||1;
      const toX     = i => PAD+(i/(data.length-1))*(W-PAD*2);
      const toY     = v => H-PAD-((v-minV)/range_)*(H-PAD*2);
      const pts     = data.map((d,i)=>`${toX(i)},${toY(d.val)}`).join(" ");
      const positive= vals[vals.length-1]>=vals[0];
      const color   = positive?C.green:C.red;
      const gainAbs = vals[vals.length-1]-vals[0];
      const gainPct = ((gainAbs/vals[0])*100).toFixed(2);
      const hVal    = hover!=null ? data[hover]?.val : null;

      const handleMouseMove = e => {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const xRatio = (e.clientX-rect.left)/rect.width;
        setHover(Math.min(data.length-1, Math.max(0, Math.round(xRatio*(data.length-1)))));
      };

      const fmtLabel = d => {
        if (!d) return "";
        if (range==="1D") return d.date?.slice(11,16)||d.date?.slice(5)||"";
        if (range==="5D") return d.date?.slice(5)||"";
        return d.date?.slice(5)||"";
      };

      return (
        <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:16, padding:"14px 16px", marginBottom:18, position:"relative" }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, height:2, borderRadius:"16px 16px 0 0", background:`linear-gradient(90deg,transparent,${color},transparent)` }}/>

          {/* Header row */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            {/* Range tabs */}
            <div style={{ display:"flex", gap:2, alignItems:"center" }}>
              {RANGE_TABS.map(t => (
                <button key={t.label} onClick={()=>{setRange(t.label);setHover(null);}}
                  style={{ background:range===t.label?`${C.cyan}20`:"none", border:`1px solid ${range===t.label?C.cyan:C.border}`, borderRadius:6, padding:"3px 8px", fontSize:9, fontWeight:700, color:range===t.label?C.cyan:C.textMuted, fontFamily:"'Space Mono',monospace", cursor:"pointer", transition:"all 0.15s" }}>
                  {t.label}
                </button>
              ))}
              {loading && <span style={{ fontSize:9, color:C.cyan, marginLeft:4 }}>···</span>}
              {!loading && !cache[range] && finnhubKey && <span style={{ fontSize:8, color:C.textDim, marginLeft:4, fontFamily:"'Space Mono',monospace" }}>EST</span>}
              {!finnhubKey && <span style={{ fontSize:8, color:C.yellow, marginLeft:4 }}>no key — estimated</span>}
            </div>

            {/* Stats */}
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {hover!=null && hVal ? (
                <>
                  <span style={{ fontSize:10, color:C.textMuted, fontFamily:"'DM Mono',monospace" }}>{data[hover]?.date}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:C.text, fontFamily:"'DM Mono',monospace" }}>${hVal.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:hVal>=vals[0]?C.green:C.red, fontFamily:"'DM Mono',monospace" }}>
                    {hVal>=vals[0]?"+":""}{((hVal-vals[0])/vals[0]*100).toFixed(2)}%
                  </span>
                </>
              ) : (
                <>
                  <span style={{ fontSize:12, fontWeight:700, color, fontFamily:"'Space Mono',monospace" }}>{positive?"▲":"▼"} {Math.abs(gainPct)}%</span>
                  <span style={{ fontSize:11, color, fontFamily:"'Space Mono',monospace" }}>{positive?"+":"-"}${Math.abs(gainAbs).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:C.text, fontFamily:"'DM Mono',monospace" }}>${todayValue.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                </>
              )}
            </div>
          </div>

          {/* Chart */}
          <div style={{ position:"relative" }} onMouseLeave={()=>setHover(null)}>
            <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
              style={{ display:"block", height:110, cursor:"crosshair" }}
              onMouseMove={handleMouseMove}>
              <defs>
                <linearGradient id="perfGradX" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.28"/>
                  <stop offset="100%" stopColor={color} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {[0.25,0.5,0.75].map(f=>(
                <line key={f} x1={PAD} y1={PAD+f*(H-PAD*2)} x2={W-PAD} y2={PAD+f*(H-PAD*2)} stroke={C.border} strokeWidth="0.5"/>
              ))}
              <polygon points={`${PAD},${H} ${pts} ${W-PAD},${H}`} fill="url(#perfGradX)"/>
              <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              {hover!=null && (
                <>
                  <line x1={toX(hover)} y1={PAD} x2={toX(hover)} y2={H-PAD} stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity="0.5"/>
                  <circle cx={toX(hover)} cy={toY(data[hover]?.val||0)} r="4" fill={color} stroke={C.bgCard} strokeWidth="2"/>
                </>
              )}
              {hover==null && <circle cx={toX(data.length-1)} cy={toY(vals[vals.length-1])} r="4" fill={color} style={{ filter:`drop-shadow(0 0 4px ${color})` }}/>}
            </svg>
          </div>

          {/* X-axis labels */}
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
            {[data[0], data[Math.floor(data.length/3)], data[Math.floor(2*data.length/3)], data[data.length-1]].map((d,i)=>(
              <span key={i} style={{ fontSize:8, color:C.textDim, fontFamily:"'Space Mono',monospace" }}>{fmtLabel(d)}</span>
            ))}
          </div>
        </div>
      );
    }

    function TabBtn({ label, active, onClick, badge, C }) {
      return (
        <button onClick={onClick} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"'Space Mono',monospace", fontSize:11, letterSpacing:"0.1em", color:active?C.cyan:C.textMuted, padding:"10px 14px", position:"relative", transition:"color 0.2s", whiteSpace:"nowrap" }}>
          {label}
          {badge && <span style={{ marginLeft:5, background:C.purple, color:"#fff", fontSize:9, padding:"1px 5px", borderRadius:8 }}>{badge}</span>}
          {active && <span style={{ position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)", width:"60%", height:2, background:C.cyan, boxShadow:`0 0 8px ${C.cyan}`, borderRadius:1 }}/>}
        </button>
      );
    }

    // ── Add Stock Inline Panel ───────────────────────────────────────────────────
    function AddStockPanel({ C, onSave, onClose, finnhubKey }) {
      const [symbol,    setSymbol]    = useState("");
      const [shares,    setShares]    = useState("");
      const [dateAdded, setDateAdded] = useState(new Date().toISOString().slice(0,10));
      const [avg,       setAvg]       = useState("");
      const [error,     setError]     = useState("");
      const [looking,   setLooking]   = useState(false);

      const inputStyle = {
        background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, borderRadius:8,
        padding:"10px 12px", color:C.text, fontFamily:"'Space Mono',monospace",
        fontSize:11, outline:"none", width:"100%", transition:"border-color 0.2s", boxSizing:"border-box",
      };

      const handleSubmit = async () => {
        const sym = symbol.trim().toUpperCase();
        const sh  = parseFloat(shares);
        const av  = parseFloat(avg);
        if (!sym)             { setError("Enter a ticker symbol"); return; }
        if (isNaN(sh)||sh<=0) { setError("Enter number of shares"); return; }
        if (isNaN(av)||av<=0) { setError("Enter average buy price"); return; }
        setLooking(true);
        const data = { symbol:sym, name:sym, shares:sh, avg:av, sector:"Other", dateAdded };
        await onSave(data);
        setLooking(false);
      };

      return (
        <div style={{ background:C.bgCard, border:`1px solid ${C.cyan}44`, borderRadius:14, padding:"18px 20px", marginBottom:16, animation:"fadeIn 0.2s both", position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${C.cyan},${C.purple},transparent)` }}/>

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:C.text, letterSpacing:"0.08em" }}>ADD STOCK</div>
              <div style={{ fontSize:9, color:C.textMuted, marginTop:2 }}>Enter the details of your position</div>
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", color:C.textMuted, fontSize:18, cursor:"pointer", lineHeight:1, padding:4 }}>✕</button>
          </div>

          {error && (
            <div style={{ background:C.red+"18", border:`1px solid ${C.red}44`, borderRadius:6, padding:"7px 12px", marginBottom:12, fontSize:10, color:C.red }}>⚠ {error}</div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.12em", marginBottom:6 }}>TICKER *</div>
              <input value={symbol} onChange={e=>{setSymbol(e.target.value.toUpperCase());setError("");}}
                placeholder="e.g. AAPL" style={inputStyle}
                onFocus={e=>e.target.style.borderColor=C.cyan}
                onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
            <div>
              <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.12em", marginBottom:6 }}>SHARES *</div>
              <input value={shares} onChange={e=>{setShares(e.target.value);setError("");}} type="number" min="0" placeholder="e.g. 10"
                style={inputStyle}
                onFocus={e=>e.target.style.borderColor=C.cyan}
                onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
            <div>
              <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.12em", marginBottom:6 }}>AVG BUY PRICE *</div>
              <input value={avg} onChange={e=>{setAvg(e.target.value);setError("");}} type="number" min="0" placeholder="e.g. 185.50"
                style={inputStyle}
                onFocus={e=>e.target.style.borderColor=C.cyan}
                onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
          </div>

          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.12em", marginBottom:6 }}>DATE PURCHASED</div>
            <input type="date" value={dateAdded} onChange={e=>setDateAdded(e.target.value)}
              max={new Date().toISOString().slice(0,10)}
              style={{ ...inputStyle, width:"auto", minWidth:180, colorScheme:"dark" }}
              onFocus={e=>e.target.style.borderColor=C.cyan}
              onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>

          {shares && avg && !isNaN(parseFloat(shares)) && !isNaN(parseFloat(avg)) && (
            <div style={{ fontSize:10, color:C.textMuted, marginBottom:14 }}>
              Cost basis: <span style={{ color:C.cyan, fontFamily:"'Space Mono',monospace", fontWeight:700 }}>${(parseFloat(shares)*parseFloat(avg)).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
            </div>
          )}

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={onClose} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 20px", color:C.textMuted, fontFamily:"'Space Mono',monospace", fontSize:10, cursor:"pointer" }}>CANCEL</button>
            <button onClick={handleSubmit} disabled={looking} style={{ flex:1, background:`linear-gradient(135deg,${C.cyan},${C.purple})`, border:"none", borderRadius:8, padding:"10px", color:"#000", fontWeight:700, fontFamily:"'Space Mono',monospace", fontSize:11, cursor:looking?"wait":"pointer", opacity:looking?0.7:1 }}>
              {looking ? "ADDING···" : "+ ADD TO PORTFOLIO"}
            </button>
          </div>
        </div>
      );
    }

    // ── Edit Holding Modal (kept for editing existing) ───────────────────────────
    function HoldingModal({ C, existing, onSave, onClose }) {
      const isEdit = !!existing;
      const [symbol,    setSymbol]    = useState(existing?.symbol    || "");
      const [name,      setName]      = useState(existing?.name      || "");
      const [shares,    setShares]    = useState(existing?.shares    != null ? String(existing.shares) : "");
      const [avg,       setAvg]       = useState(existing?.avg       != null ? String(existing.avg)    : "");
      const [sector,    setSector]    = useState(existing?.sector    || "Tech");
      const [dateAdded, setDateAdded] = useState(existing?.dateAdded || new Date().toISOString().slice(0,10));
      const [error,     setError]     = useState("");

      const SECTORS = ["Tech","Consumer","Auto","Finance","Healthcare","Energy","Industrial","Other"];

      const inputStyle = {
        background:C.bg, border:`1px solid ${C.border}`, borderRadius:6,
        padding:"8px 10px", color:C.text, fontFamily:"'Space Mono',monospace",
        fontSize:11, outline:"none", width:"100%", transition:"border-color 0.2s",
      };

      const submit = () => {
        const sym = symbol.trim().toUpperCase();
        const nm  = name.trim() || sym;
        const sh  = parseFloat(shares);
        const av  = parseFloat(avg);
        if (!sym)          { setError("Ticker symbol required"); return; }
        if (isNaN(sh)||sh<=0) { setError("Enter valid number of shares"); return; }
        if (isNaN(av)||av<=0) { setError("Enter valid average price"); return; }
        onSave({ symbol:sym, name:nm, shares:sh, avg:av, sector, dateAdded });
      };

      return (
        <div style={{ position:"fixed", inset:0, zIndex:200, background:"#00000088", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={onClose}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%", maxWidth:360, background:C.bgCard, border:`1px solid ${C.borderBright}`, borderRadius:14, padding:22, boxShadow:`0 0 60px ${C.cyan}22`, animation:"fadeIn 0.2s both", position:"relative", overflow:"hidden" }}>
            {/* top accent */}
            <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${C.cyan},${C.purple},transparent)` }}/>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:C.text, letterSpacing:"0.1em" }}>{isEdit?"EDIT HOLDING":"ADD HOLDING"}</div>
                <div style={{ fontSize:9, color:C.textMuted, marginTop:2 }}>{isEdit?`Editing ${existing.symbol}`:"Add a new position to your portfolio"}</div>
              </div>
              <button onClick={onClose} style={{ background:"none", border:"none", color:C.textMuted, fontSize:18, cursor:"pointer", lineHeight:1 }}>✕</button>
            </div>

            {error && (
              <div style={{ background:C.red+"22", border:`1px solid ${C.red}44`, borderRadius:6, padding:"7px 10px", marginBottom:12, fontSize:10, color:C.red }}>⚠ {error}</div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.12em", marginBottom:5 }}>TICKER *</div>
                  <input value={symbol} onChange={e=>{setSymbol(e.target.value.toUpperCase());setError("");}} placeholder="NVDA" disabled={isEdit}
                    style={{ ...inputStyle, ...(isEdit?{opacity:0.5,cursor:"not-allowed"}:{}) }}
                    onFocus={e=>e.target.style.borderColor=C.cyan}
                    onBlur={e=>e.target.style.borderColor=C.border}/>
                </div>
                <div>
                  <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.12em", marginBottom:5 }}>SECTOR</div>
                  <select value={sector} onChange={e=>setSector(e.target.value)}
                    style={{ ...inputStyle, cursor:"pointer" }}>
                    {SECTORS.map(s=><option key={s} value={s} style={{ background:C.bgCard }}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.12em", marginBottom:5 }}>COMPANY NAME</div>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="NVIDIA Corporation (optional)"
                  style={inputStyle}
                  onFocus={e=>e.target.style.borderColor=C.cyan}
                  onBlur={e=>e.target.style.borderColor=C.border}/>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.12em", marginBottom:5 }}>SHARES *</div>
                  <input value={shares} onChange={e=>{setShares(e.target.value);setError("");}} placeholder="10" type="number" min="0"
                    style={inputStyle}
                    onFocus={e=>e.target.style.borderColor=C.cyan}
                    onBlur={e=>e.target.style.borderColor=C.border}/>
                </div>
                <div>
                  <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.12em", marginBottom:5 }}>AVG PRICE * ($)</div>
                  <input value={avg} onChange={e=>{setAvg(e.target.value);setError("");}} placeholder="485.20" type="number" min="0"
                    style={inputStyle}
                    onFocus={e=>e.target.style.borderColor=C.cyan}
                    onBlur={e=>e.target.style.borderColor=C.border}/>
                </div>
              </div>

              {/* Cost basis preview */}
              {shares && avg && !isNaN(parseFloat(shares)) && !isNaN(parseFloat(avg)) && (
                <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:6, padding:"8px 10px", fontSize:10, color:C.textMuted }}>
                  Cost basis: <span style={{ color:C.cyan, fontFamily:"'Space Mono',monospace" }}>${(parseFloat(shares)*parseFloat(avg)).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
                </div>
              )}

              <div>
                <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.12em", marginBottom:5 }}>DATE PURCHASED</div>
                <input type="date" value={dateAdded} onChange={e=>setDateAdded(e.target.value)} max={new Date().toISOString().slice(0,10)}
                  style={{ ...inputStyle, colorScheme: "dark" }}
                  onFocus={e=>e.target.style.borderColor=C.cyan}
                  onBlur={e=>e.target.style.borderColor=C.border}/>
              </div>

              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <button onClick={onClose} style={{ flex:1, background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px", color:C.textMuted, fontFamily:"'Space Mono',monospace", fontSize:10, cursor:"pointer" }}>CANCEL</button>
                <button onClick={submit} style={{ flex:2, background:`linear-gradient(135deg,${C.cyan},${C.purple})`, border:"none", borderRadius:8, padding:"10px", color:"#000", fontWeight:700, fontFamily:"'Space Mono',monospace", fontSize:10, cursor:"pointer" }}>
                  {isEdit?"SAVE CHANGES":"ADD TO PORTFOLIO"}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── Portfolio Tab ────────────────────────────────────────────────────────────
    function PortfolioTab({ C, portfolio, setPortfolio, loadingPrices, priceError, onRefresh, finnhubKey }) {
      const [showAdd,       setShowAdd]       = useState(false);
      const [editTarget,    setEditTarget]    = useState(null);
      const [confirmDel,    setConfirmDel]    = useState(null);
      const [expandedSymbol, setExpandedSymbol] = useState(null);

      const totalValue = portfolio.reduce((s,h) => s + h.shares * (h.price||0), 0);
      const totalCost  = portfolio.reduce((s,h) => s + h.shares * h.avg, 0);
      const totalGain  = totalValue - totalCost;
      const totalPct   = totalCost > 0 ? ((totalGain/totalCost)*100).toFixed(2) : "0.00";

      const handleAdd = async (data) => {
        const newH = { ...data, price: data.avg, change: 0, live: false };
        // Try to get live price if finnhubKey exists
        if (finnhubKey) {
          try {
            const q = await fetchQuote(data.symbol, finnhubKey);
            if (q.c > 0) { newH.price = q.c; newH.change = q.dp || 0; newH.live = true; }
          } catch {}
        }
        setPortfolio(prev => [...prev, newH]);
        setShowAdd(false);
      };

      const handleEdit = (data) => {
        setPortfolio(prev => prev.map(h =>
          h.symbol === data.symbol ? { ...h, shares: data.shares, avg: data.avg, name: data.name, sector: data.sector, dateAdded: data.dateAdded } : h
        ));
        setEditTarget(null);
      };

      const handleRemove = (symbol) => {
        setPortfolio(prev => prev.filter(h => h.symbol !== symbol));
        setConfirmDel(null);
      };

      return (
        <div>
          {editTarget && <HoldingModal C={C} existing={editTarget} onSave={handleEdit} onClose={()=>setEditTarget(null)}/>}

          {/* Confirm delete */}
          {confirmDel && (
            <div style={{ position:"fixed", inset:0, zIndex:200, background:"#00000088", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={()=>setConfirmDel(null)}>
              <div onClick={e=>e.stopPropagation()} style={{ background:C.bgCard, border:`1px solid ${C.red}44`, borderRadius:12, padding:22, maxWidth:300, width:"100%", animation:"fadeIn 0.15s both", textAlign:"center" }}>
                <div style={{ fontSize:24, marginBottom:10 }}>⚠</div>
                <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:6 }}>Remove {confirmDel}?</div>
                <div style={{ fontSize:11, color:C.textMuted, marginBottom:16 }}>This will remove the position from your portfolio.</div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>setConfirmDel(null)} style={{ flex:1, background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"8px", color:C.textMuted, fontFamily:"'Space Mono',monospace", fontSize:10, cursor:"pointer" }}>CANCEL</button>
                  <button onClick={()=>handleRemove(confirmDel)} style={{ flex:1, background:C.red+"22", border:`1px solid ${C.red}44`, borderRadius:6, padding:"8px", color:C.red, fontFamily:"'Space Mono',monospace", fontSize:10, fontWeight:700, cursor:"pointer" }}>REMOVE</button>
                </div>
              </div>
            </div>
          )}

          <PerformanceGraph C={C} portfolio={portfolio} finnhubKey={finnhubKey}/>

          {/* Summary cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:18 }}>
            {[
              { label:"Portfolio Value", value: loadingPrices ? "···" : `$${(totalValue/1000).toFixed(1)}K`, color:C.cyan  },
              { label:"Total Gain",      value: loadingPrices ? "···" : `${totalGain>=0?"+":"-"}$${(Math.abs(totalGain)/1000).toFixed(1)}K`, color:totalGain>=0?C.green:C.red },
              { label:"Return",          value: loadingPrices ? "···" : `${totalGain>=0?"+":""}${totalPct}%`, color:totalGain>=0?C.green:C.red },
            ].map(({label,value,color}) => (
              <div key={label} style={{ background:`linear-gradient(135deg,${color}08,${C.bgCard})`, border:`1px solid ${color}25`, borderRadius:14, padding:"14px 16px", position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${color}80,transparent)` }}/>
                <div style={{ fontSize:10, color:C.textMuted, fontWeight:500, marginBottom:6 }}>{label}</div>
                <div style={{ fontSize:20, fontWeight:700, color, fontFamily:"'DM Mono',monospace", letterSpacing:"-0.02em" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Price status + refresh row */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {loadingPrices && (
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:10, color:C.textMuted }}>
                  <Spinner color={C.cyan}/> Fetching live prices...
                </div>
              )}
              {priceError && <div style={{ fontSize:10, color:C.yellow }}>⚠ {priceError}</div>}
              {!loadingPrices && !priceError && portfolio.length > 0 && (
                <div style={{ fontSize:9, color:C.green }}>● Live prices</div>
              )}
            </div>
            <button onClick={onRefresh} disabled={loadingPrices} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 12px", color:loadingPrices?C.textDim:C.textMuted, fontSize:9, fontFamily:"'Space Mono',monospace", cursor:loadingPrices?"not-allowed":"pointer" }}>↻ REFRESH</button>
          </div>

          {/* Holdings */}
          {portfolio.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", border:`1px dashed ${C.border}`, borderRadius:8 }}>
              <div style={{ fontSize:28, marginBottom:10 }}>📊</div>
              <div style={{ fontSize:12, color:C.textMuted, fontFamily:"'Space Mono',monospace", marginBottom:6 }}>No holdings yet</div>
              <div style={{ fontSize:10, color:C.textDim }}>Go to the SEARCH tab to find and add stocks</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {portfolio.map((h,i) => {
                const price    = h.price || h.avg;
                const value    = h.shares * price;
                const cost     = h.shares * h.avg;
                const gain     = value - cost;
                const gainPct  = ((price - h.avg)/h.avg*100);
                const pos      = (h.change||0) >= 0;
                const totalPos = gain >= 0;
                const weight   = totalValue > 0 ? ((value/totalValue)*100).toFixed(1) : "0";
                const isOpen   = expandedSymbol === h.symbol;
                const dayGain  = h.shares * price * ((h.change||0)/100);

                return (
                  <div key={h.symbol} style={{ background:C.bgCard, border:`1px solid ${isOpen?C.cyan+"55":C.border}`, borderRadius:14, overflow:"hidden", transition:"border-color 0.2s", animation:`fadeIn 0.3s ${i*0.05}s both`, position:"relative" }}>

                    {/* Main row — clickable */}
                    <div style={{ padding:"13px 16px", display:"grid", gridTemplateColumns:"auto 1fr auto auto", gap:12, alignItems:"center", cursor:"pointer", position:"relative" }}
                      onClick={()=>setExpandedSymbol(isOpen?null:h.symbol)}
                      onMouseEnter={e=>{e.currentTarget.style.background=C.bgCardHover;e.currentTarget.querySelector(".row-actions").style.opacity="1";}}
                      onMouseLeave={e=>{e.currentTarget.style.background="";e.currentTarget.querySelector(".row-actions").style.opacity="0";}}
                    >
                      {/* Hover actions */}
                      <div className="row-actions" style={{ position:"absolute", top:7, right:8, display:"flex", gap:4, opacity:0, transition:"opacity 0.15s", zIndex:2 }}>
                        <button onClick={e=>{e.stopPropagation();setEditTarget(h);}} style={{ background:C.bgCard, border:`1px solid ${C.cyan}44`, borderRadius:4, padding:"2px 8px", color:C.cyan, fontSize:9, fontFamily:"'Space Mono',monospace", cursor:"pointer" }}>EDIT</button>
                        <button onClick={e=>{e.stopPropagation();setConfirmDel(h.symbol);}} style={{ background:C.bgCard, border:`1px solid ${C.red}44`, borderRadius:4, padding:"2px 8px", color:C.red, fontSize:9, fontFamily:"'Space Mono',monospace", cursor:"pointer" }}>✕</button>
                      </div>

                      {/* Logo */}
                      <div style={{ width:38, height:38, borderRadius:8, background:`linear-gradient(135deg,${C.bg},${C.bgCardHover})`, border:`1px solid ${pos?C.green+"44":C.red+"44"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:pos?C.green:C.red, fontFamily:"'Space Mono',monospace" }}>{h.symbol.slice(0,2)}</div>

                      {/* Name + meta */}
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:C.text, fontFamily:"'Space Mono',monospace" }}>{h.symbol}</span>
                          <span style={{ fontSize:9, color:C.textMuted, border:`1px solid ${C.border}`, padding:"1px 5px", borderRadius:4 }}>{h.sector}</span>
                          {h.live && <span style={{ fontSize:8, color:C.green, border:`1px solid ${C.green}33`, padding:"1px 4px", borderRadius:3 }}>LIVE</span>}
                        </div>
                        <div style={{ fontSize:10, color:C.textMuted }}>
                          <span style={{ fontFamily:"'Space Mono',monospace" }}>{h.shares} shares</span>
                          <span style={{ margin:"0 5px", opacity:0.4 }}>·</span>
                          <span>avg ${h.avg}</span>
                          {h.dateAdded && <>
                            <span style={{ margin:"0 5px", opacity:0.4 }}>·</span>
                            <span style={{ color:C.cyan, fontSize:9 }}>since {new Date(h.dateAdded).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"})}</span>
                          </>}
                        </div>
                        <div style={{ marginTop:4, background:C.bg, borderRadius:2, height:3, width:100 }}>
                          <div style={{ background:C.purple+"88", height:3, width:`${weight}%`, borderRadius:2 }}/>
                        </div>
                      </div>

                      <Sparkline positive={pos} C={C}/>

                      {/* Price + today's change */}
                      <div style={{ textAlign:"right", minWidth:80 }}>
                        {loadingPrices && !h.price
                          ? <div style={{ display:"flex", justifyContent:"flex-end" }}><Spinner color={C.cyan}/></div>
                          : <>
                              <div style={{ fontSize:12, fontWeight:700, color:C.text, fontFamily:"'Space Mono',monospace" }}>${price.toFixed(2)}</div>
                              <div style={{ fontSize:11, color:pos?C.green:C.red, marginTop:2 }}>{pos?"▲":"▼"} {Math.abs(h.change||0).toFixed(2)}%</div>
                              <div style={{ fontSize:10, color:totalPos?C.green+"99":C.red+"99" }}>{gain>=0?"+":""}{gain.toFixed(0)}</div>
                            </>
                        }
                      </div>
                    </div>

                    {/* Expanded stats panel */}
                    {isOpen && (
                      <div style={{ borderTop:`1px solid ${C.border}`, padding:"14px 16px", background:`linear-gradient(135deg,${C.cyan}04,${C.purple}04)`, animation:"fadeIn 0.2s both" }}>

                        {/* Big headline numbers */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
                          {[
                            { label:"TOTAL RETURN",   value: `${totalPos?"+":""}${gainPct.toFixed(2)}%`,          color: totalPos?C.green:C.red,  big:true },
                            { label:"TOTAL P&L",      value: `${gain>=0?"+":""}$${Math.abs(gain).toLocaleString(undefined,{maximumFractionDigits:0})}`, color: totalPos?C.green:C.red, big:true },
                            { label:"TODAY'S GAIN",   value: `${dayGain>=0?"+":""}$${Math.abs(dayGain).toFixed(0)}`, color: dayGain>=0?C.green:C.red },
                            { label:"PORTFOLIO WT",   value: `${weight}%`,                                          color: C.purple },
                          ].map(s => (
                            <div key={s.label} style={{ background:C.bgCard, border:`1px solid ${s.color}22`, borderRadius:10, padding:"10px 12px", position:"relative", overflow:"hidden" }}>
                              <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${s.color}60,transparent)` }}/>
                              <div style={{ fontSize:8, color:C.textMuted, letterSpacing:"0.12em", marginBottom:5 }}>{s.label}</div>
                              <div style={{ fontSize:s.big?16:14, fontWeight:700, color:s.color, fontFamily:"'DM Mono',monospace", letterSpacing:"-0.02em" }}>{s.value}</div>
                            </div>
                          ))}
                        </div>

                        {/* Secondary stats */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                          {[
                            { label:"CURRENT PRICE",  value:`$${price.toFixed(2)}`,                                         color:C.cyan },
                            { label:"AVG BUY PRICE",  value:`$${h.avg.toFixed(2)}`,                                          color:C.textMuted },
                            { label:"POSITION SIZE",  value:`$${value.toLocaleString(undefined,{maximumFractionDigits:0})}`, color:C.cyan },
                            { label:"SHARES HELD",    value:String(h.shares),                                                color:C.textMuted },
                            { label:"COST BASIS",     value:`$${cost.toLocaleString(undefined,{maximumFractionDigits:0})}`,  color:C.textMuted },
                            { label:"PRICE CHANGE",   value:`${(price-h.avg)>=0?"+":""}$${(price-h.avg).toFixed(2)}/sh`,    color:(price-h.avg)>=0?C.green:C.red },
                          ].map(s => (
                            <div key={s.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${C.border}22` }}>
                              <span style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.08em" }}>{s.label}</span>
                              <span style={{ fontSize:11, fontWeight:600, color:s.color, fontFamily:"'DM Mono',monospace" }}>{s.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // ── AI Advisor Tab ───────────────────────────────────────────────────────────
    function AIAdvisorTab({ C, aiUsed, setAiUsed, anthropicKey, portfolio }) {
      const [messages, setMessages] = useState([{ role:"ai", text:FALLBACK.default }]);
      const [input, setInput]       = useState("");
      const [loading, setLoading]   = useState(false);
      const [apiError, setApiError] = useState("");
      const endRef = useRef(null);
      const remaining = AI_LIMIT - aiUsed;
      const hasKey = true;

      useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

      const portfolioSummary = portfolio.map(h =>
        `${h.symbol}(${h.shares}@avg$${h.avg}→$${(h.price||h.avg).toFixed(2)},${((((h.price||h.avg)-h.avg)/h.avg)*100).toFixed(1)}%)`
      ).join(", ");

      const send = async (text) => {
        const msg = (text || input).trim();
        if (!msg) return;
        if (!hasKey) { setApiError("Add your Anthropic API key in Settings ⚙ to use AI features."); return; }
        if (remaining === 0) return;
        setInput(""); setApiError("");
        setMessages(prev => [...prev, { role:"user", text:msg }]);
        setAiUsed(u => u+1);
        setLoading(true);
        try {
          const aiText = await callClaude({
            system: `You are Stockr AI's Financial Companion — a sharp, intelligent assistant built into a personal portfolio intelligence dashboard. You have deep knowledge of financial markets, investing strategy, macroeconomics, and portfolio management.

## Personality
- Confident but not arrogant. Direct but not cold.
- Talk like a smart friend who happens to be a financial analyst — not a stiff corporate advisor.
- Brief by default. Go deep only when asked.
- Never start a response with "I", "Great question", or "Sure!".
- Don't repeat the user's question back before answering.

## Portfolio Context
The user's current portfolio: ${portfolioSummary}

Use this data actively — synthesize it into insight rather than dumping raw numbers back. For example, instead of "You have 12 shares of NVDA", say "NVDA is your biggest position — worth watching if AI sentiment shifts."

## What You Help With
- Portfolio analysis: concentration risk, sector exposure, winners/losers
- Explaining why a stock or market is moving
- Comparing stocks or ETFs the user is considering
- Honest takes on earnings, macro events, Fed decisions, sector trends
- Financial concepts explained clearly (P/E, market cap, options, etc.)

## Format Rules
- Under 180 words unless the user asks to go deep
- Use **bold** for the single most important figure or term per response
- Bullet points only for 3+ items
- Frame analysis as insight, not financial advice`,
            messages: [
              ...messages.map(m => ({ role:m.role==="ai"?"assistant":"user", content:m.text })),
              { role:"user", content:msg },
            ],
          });
          setMessages(prev => [...prev, { role:"ai", text:aiText || getFallback(msg) }]);
        } catch(e) {
          setAiUsed(u => u-1);
          setApiError(e.message === "NO_KEY" ? "Add your Anthropic API key in Settings ⚙." : `Error: ${e.message}`);
          setMessages(prev => prev.slice(0,-1));
        }
        setLoading(false);
      };

      const renderText = (text) => text.split("\n").map((line,i) => (
        <div key={i} style={{ marginBottom:line===""?6:2 }}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((p,j) =>
            p.startsWith("**") ? <span key={j} style={{ color:C.cyan, fontWeight:700 }}>{p.slice(2,-2)}</span> : p
          )}
        </div>
      ));

      return (
        <div style={{ display:"flex", flexDirection:"column", height:480 }}>
          {/* Status — compact row with small query dots */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, paddingBottom:10, borderBottom:`1px solid ${C.border}` }}>
            {hasKey
              ? <span style={{ fontSize:10, color:C.green }}>● AI Connected</span>
              : <span style={{ fontSize:10, color:C.yellow }}>⚙ Add Anthropic key in Settings</span>
            }
            {hasKey && (
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ display:"flex", gap:2 }}>
                  {Array.from({length:10}).map((_,i) => (
                    <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:i<(aiUsed%10)?C.cyan:`${C.cyan}25`, transition:"background 0.3s" }}/>
                  ))}
                </div>
                <span style={{ fontSize:9, color:C.textMuted, fontFamily:"'DM Mono',monospace" }}>{aiUsed}</span>
              </div>
            )}
          </div>

          {apiError && (
            <div style={{ background:C.red+"22", border:`1px solid ${C.red}44`, borderRadius:6, padding:"7px 12px", marginBottom:8, fontSize:10, color:C.red, fontFamily:"'Space Mono',monospace" }}>⚠ {apiError}</div>
          )}

          {/* Messages */}
          <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:12, paddingBottom:8 }}>
            {messages.map((m,i) => (
              <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:m.role==="user"?"flex-end":"flex-start", animation:"fadeIn 0.3s both" }}>
                {m.role==="ai" && (
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                    <div style={{ width:18, height:18, borderRadius:4, background:`linear-gradient(135deg,${C.purple},${C.cyan})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:700, color:"#fff" }}>AI</div>
                    <span style={{ fontSize:9, color:C.textMuted }}>STOCKR AI</span>
                  </div>
                )}
                <div style={{ maxWidth:"85%", padding:"10px 14px", borderRadius:m.role==="user"?"12px 12px 4px 12px":"4px 12px 12px 12px", background:m.role==="user"?`linear-gradient(135deg,${C.purple}33,${C.cyan}22)`:"rgba(255,255,255,0.06)", border:`1px solid ${m.role==="user"?C.purple+"44":C.border}`, fontSize:12, lineHeight:1.6, color:C.text, fontFamily:"'Space Mono',monospace" }}>
                  {renderText(m.text)}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display:"flex", gap:4, padding:"8px 12px" }}>
                {[0,1,2].map(i=><div key={i} style={{ width:6, height:6, borderRadius:"50%", background:C.cyan, animation:`bounce 1s ${i*0.2}s infinite` }}/>)}
              </div>
            )}
            <div ref={endRef}/>
          </div>

          {/* Quick prompts — 2x2 grid */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, margin:"8px 0" }}>
            {["Analyze portfolio","Rebalance advice","Biggest risk","Best performer"].map(s=>(
              <button key={s} onClick={()=>send(s)} disabled={!hasKey||remaining<=0} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", fontSize:10, color:(hasKey&&remaining>0)?C.textMuted:C.textDim, cursor:(hasKey&&remaining>0)?"pointer":"not-allowed", fontFamily:"'Space Mono',monospace", transition:"all 0.2s", textAlign:"left" }}
                onMouseEnter={e=>{if(hasKey&&remaining>0){e.currentTarget.style.borderColor=C.cyan;e.currentTarget.style.color=C.cyan;e.currentTarget.style.background=`${C.cyan}10`;}}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=(hasKey&&remaining>0)?C.textMuted:C.textDim;e.currentTarget.style.background="none";}}
              >{s}</button>
            ))}
          </div>

          {/* Input */}
          <div style={{ display:"flex", gap:8, background:"rgba(255,255,255,0.06)", border:`1px solid ${(!hasKey||remaining<=0)?C.red+"44":C.border}`, borderRadius:10, padding:"8px 12px", alignItems:"center" }}>
            <span style={{ fontSize:12, color:C.cyan }}>›</span>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} disabled={!hasKey||remaining<=0}
              placeholder={!hasKey?"Add API key in Settings...":remaining>0?"Ask about your portfolio...":"Query limit reached"}
              style={{ flex:1, background:"none", border:"none", outline:"none", color:(hasKey&&remaining>0)?C.text:C.textDim, fontFamily:"'Space Mono',monospace", fontSize:12, cursor:(hasKey&&remaining>0)?"text":"not-allowed" }}/>
            <button onClick={()=>send()} disabled={!hasKey||remaining<=0} style={{ background:(hasKey&&remaining>0)?`linear-gradient(135deg,${C.purple},${C.cyan})`:C.border, border:"none", borderRadius:6, padding:"5px 12px", color:(hasKey&&remaining>0)?"#fff":C.textDim, fontWeight:700, fontFamily:"'Space Mono',monospace", fontSize:10, cursor:(hasKey&&remaining>0)?"pointer":"not-allowed" }}>SEND</button>
          </div>
        </div>
      );
    }

    // ── News Tab ─────────────────────────────────────────────────────────────────
    function NewsTab({ C, newsKey, finnhubKey, portfolio, onArticleCount }) {
      const [articles, setArticles] = useState([]);
      const [loading, setLoading]   = useState(false);
      const [filter, setFilter]     = useState("general");
      const [error, setError]       = useState("");
      const [source, setSource]     = useState(""); // "alphavantage" | "finnhub"

      const portfolioSymbols = portfolio.map(h => h.symbol);

      const timeAgo = (ts) => {
        const diff = Date.now() - ts;
        const m = Math.floor(diff / 60000);
        if (m < 1)  return "just now";
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h/24)}d ago`;
      };

      const fetchNews = async (category) => {
        setLoading(true); setError(""); setArticles([]);

        // ── Alpha Vantage skipped — using Finnhub ────────────────────────────

        // ── Finnhub fallback (free, no sentiment) ─────────────────────────────
        try {
          const today = new Date().toISOString().slice(0,10);
          const weekAgo = new Date(Date.now()-7*86400000).toISOString().slice(0,10);
          let endpoint;
          let newsUrl;
          if (category === "general" || category === "forex") {
            newsUrl = `/api/finnhub?endpoint=news&category=${category==="forex"?"forex":"general"}`;
          } else {
            newsUrl = `/api/finnhub?endpoint=company-news&symbol=${category}&from=${weekAgo}&to=${today}`;
          }
          const r = await fetch(newsUrl);
          if (!r.ok) throw new Error(`${r.status}`);
          const data = await r.json();
          const feed = Array.isArray(data) ? data : [];
          const items = feed.slice(0, 8).map((a, i) => ({
            id: i, headline: a.headline||"", source: a.source||"", url: a.url||"#",
            image: a.image||"",
            time: a.datetime ? timeAgo(a.datetime * 1000) : "",
            ticker: category==="general"?"MKT":category==="forex"?"FX":category,
            sentiment: "",
          }));
          setArticles(items);
          setSource("finnhub");
          if (onArticleCount) onArticleCount(items.length);
        } catch(e) {
          setError(`Could not load news: ${e.message}`);
        }
        setLoading(false);
      };

      useEffect(() => { fetchNews(filter); }, [newsKey, finnhubKey, filter]);

      const pill = (active) => ({
        background: active ? `${C.cyan}20` : "none",
        border: `1px solid ${active ? C.cyan+"60" : C.border}`,
        borderRadius: 20, padding: "4px 14px",
        color: active ? C.cyan : C.textMuted,
        fontSize: 11, fontWeight: active ? 600 : 400,
        cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
        fontFamily: "'DM Sans',sans-serif",
      });

      return (
        <div>
          <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:2 }}>
            <button style={pill(filter==="general")} onClick={()=>setFilter("general")}>🌐 Market</button>
            <button style={pill(filter==="forex")} onClick={()=>setFilter("forex")}>💱 Forex</button>
            {portfolioSymbols.map(sym => (
              <button key={sym} style={pill(filter===sym)} onClick={()=>setFilter(sym)}>{sym}</button>
            ))}
          </div>

          {!newsKey && !finnhubKey ? (
            <div style={{ textAlign:"center", padding:"50px 20px", border:`1px dashed ${C.border}`, borderRadius:14 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📰</div>
              <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:8 }}>No API keys connected</div>
              <div style={{ fontSize:11, color:C.textMuted, lineHeight:1.6, marginBottom:6 }}>
                News is powered by <span style={{color:C.cyan}}>Finnhub</span>
              </div>
            </div>
          ) : (
            <>
              {source === "finnhub" && !newsKey && (
                <div style={{ background:`${C.cyan}10`, border:`1px solid ${C.cyan}25`, borderRadius:10, padding:"8px 12px", marginBottom:10, fontSize:10, color:C.textMuted, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span>Showing Finnhub news · <span style={{color:C.cyan}}>no sentiment data</span></span>
                  <span style={{color:C.textDim}}>Add Alpha Vantage key for sentiment</span>
                </div>
              )}
              {error && (
                <div style={{ background:C.red+"18", border:`1px solid ${C.red}35`, borderRadius:12, padding:"12px 16px", fontSize:12, color:C.red, marginBottom:12 }}>⚠ {error}</div>
              )}
              {loading && (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:14, height:80, animation:`pulse 1.5s ${i*0.1}s infinite` }}/>
                  ))}
                </div>
              )}
              {!loading && (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {articles.map((a, i) => (
                    <a key={a.id||i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
                      <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:14, padding:"14px 16px", display:"flex", gap:14, alignItems:"flex-start", cursor:"pointer", transition:"all 0.2s", animation:`fadeIn 0.25s ${Math.min(i,10)*0.05}s both` }}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.borderBright;e.currentTarget.style.background=C.bgCardHover;}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.bgCard;}}
                      >
                        {a.image ? (
                          <img src={a.image} alt="" style={{ width:56, height:56, borderRadius:10, objectFit:"cover", flexShrink:0 }} onError={e=>e.target.style.display="none"}/>
                        ) : (
                          <div style={{ width:56, height:56, borderRadius:10, flexShrink:0, background:`linear-gradient(135deg,${C.cyan}20,${C.purple}20)`, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:C.cyan }}>{(a.ticker||"MKT").slice(0,4)}</div>
                        )}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, color:C.text, lineHeight:1.45, marginBottom:6 }}>{a.headline}</div>
                          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                            <span style={{ fontSize:10, fontWeight:600, color:C.cyan, background:`${C.cyan}15`, padding:"2px 8px", borderRadius:10 }}>{a.ticker}</span>
                            <span style={{ fontSize:10, color:C.textMuted }}>{a.source}</span>
                            {a.sentiment && <span style={{ fontSize:10, fontWeight:600, color: a.sentiment.includes("Bullish")?C.green:a.sentiment.includes("Bearish")?C.red:C.yellow, background: a.sentiment.includes("Bullish")?`${C.green}15`:a.sentiment.includes("Bearish")?`${C.red}15`:`${C.yellow}15`, padding:"2px 8px", borderRadius:10 }}>{a.sentiment}</span>}
                            <span style={{ fontSize:10, color:C.textDim }}>{a.time}</span>
                          </div>
                        </div>
                      </div>
                    </a>
                  ))}
                  {articles.length === 0 && !error && (
                    <div style={{ textAlign:"center", padding:"40px 0", color:C.textMuted, fontSize:13 }}>No news found</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      );
    }
    // ── Search Tab ───────────────────────────────────────────────────────────────
    // Popular stocks & crypto shown by default, Finnhub symbol search for queries
    const POPULAR_STOCKS = [
      { symbol:"AAPL",  name:"Apple Inc",           type:"stock",  sector:"Tech"       },
      { symbol:"MSFT",  name:"Microsoft Corp",       type:"stock",  sector:"Tech"       },
      { symbol:"NVDA",  name:"NVIDIA Corp",           type:"stock",  sector:"Tech"       },
      { symbol:"GOOGL", name:"Alphabet Inc",          type:"stock",  sector:"Tech"       },
      { symbol:"AMZN",  name:"Amazon.com",            type:"stock",  sector:"Consumer"   },
      { symbol:"META",  name:"Meta Platforms",        type:"stock",  sector:"Tech"       },
      { symbol:"TSLA",  name:"Tesla Inc",             type:"stock",  sector:"Auto"       },
      { symbol:"BRK.B", name:"Berkshire Hathaway",    type:"stock",  sector:"Finance"    },
      { symbol:"JPM",   name:"JPMorgan Chase",        type:"stock",  sector:"Finance"    },
      { symbol:"V",     name:"Visa Inc",              type:"stock",  sector:"Finance"    },
      { symbol:"JNJ",   name:"Johnson & Johnson",     type:"stock",  sector:"Healthcare" },
      { symbol:"WMT",   name:"Walmart Inc",           type:"stock",  sector:"Consumer"   },
      { symbol:"XOM",   name:"Exxon Mobil",           type:"stock",  sector:"Energy"     },
      { symbol:"UNH",   name:"UnitedHealth Group",    type:"stock",  sector:"Healthcare" },
      { symbol:"MA",    name:"Mastercard Inc",        type:"stock",  sector:"Finance"    },
      { symbol:"PG",    name:"Procter & Gamble",      type:"stock",  sector:"Consumer"   },
      { symbol:"HD",    name:"Home Depot",            type:"stock",  sector:"Consumer"   },
      { symbol:"COST",  name:"Costco Wholesale",      type:"stock",  sector:"Consumer"   },
      { symbol:"NFLX",  name:"Netflix Inc",           type:"stock",  sector:"Tech"       },
      { symbol:"AMD",   name:"Advanced Micro Devices",type:"stock",  sector:"Tech"       },
    ];

    const POPULAR_CRYPTO = [
      { symbol:"BINANCE:BTCUSDT",  name:"Bitcoin",       displaySymbol:"BTC",  type:"crypto", sector:"Crypto" },
      { symbol:"BINANCE:ETHUSDT",  name:"Ethereum",      displaySymbol:"ETH",  type:"crypto", sector:"Crypto" },
      { symbol:"BINANCE:BNBUSDT",  name:"BNB",           displaySymbol:"BNB",  type:"crypto", sector:"Crypto" },
      { symbol:"BINANCE:SOLUSDT",  name:"Solana",        displaySymbol:"SOL",  type:"crypto", sector:"Crypto" },
      { symbol:"BINANCE:XRPUSDT",  name:"XRP",           displaySymbol:"XRP",  type:"crypto", sector:"Crypto" },
      { symbol:"BINANCE:ADAUSDT",  name:"Cardano",       displaySymbol:"ADA",  type:"crypto", sector:"Crypto" },
      { symbol:"BINANCE:DOGEUSDT", name:"Dogecoin",      displaySymbol:"DOGE", type:"crypto", sector:"Crypto" },
      { symbol:"BINANCE:AVAXUSDT", name:"Avalanche",     displaySymbol:"AVAX", type:"crypto", sector:"Crypto" },
      { symbol:"BINANCE:DOTUSDT",  name:"Polkadot",      displaySymbol:"DOT",  type:"crypto", sector:"Crypto" },
      { symbol:"BINANCE:LINKUSDT", name:"Chainlink",     displaySymbol:"LINK", type:"crypto", sector:"Crypto" },
    ];

    function SearchTab({ C, finnhubKey, portfolio, setPortfolio }) {
      const [query, setQuery]               = useState("");
      const [browseTab, setBrowseTab]       = useState("stocks");
      const [displayList, setDisplayList]   = useState([]);
      const [loading, setLoading]           = useState(false);
      const [loadingPrices, setLoadingPrices] = useState(false);
      const [apiError, setApiError]         = useState("");
      const [prices, setPrices]             = useState({});
      const [expandedKey, setExpandedKey]   = useState(null); // which card is open
      const [panelShares, setPanelShares]   = useState("");
      const [panelDate, setPanelDate]       = useState(new Date().toISOString().slice(0,10));
      const [panelAvg, setPanelAvg]         = useState(null);   // fetched historical price
      const [panelFetching, setPanelFetching] = useState(false);
      const [panelError, setPanelError]     = useState("");
      const [added, setAdded]               = useState({});
      const debounceRef = useRef(null);
      const isSearchMode = query.trim().length > 0;
      const [showDropdown, setShowDropdown] = useState(false);

      // Fetch quotes for a list and return { symbol: {price, change} }
      const fetchPrices = async (items) => {
        if (!finnhubKey || !items.length) return {};
        const fetched = {};
        await Promise.allSettled(items.map(async item => {
          try {
            const q = await fetchQuote(item.symbol, finnhubKey);
            if (q.c > 0) fetched[item.symbol] = { price: q.c, change: q.dp || 0 };
          } catch {}
        }));
        return fetched;
      };

      // Load default list on mount / tab change
      useEffect(() => {
        if (isSearchMode) return;
        const candidates = browseTab === "crypto" ? POPULAR_CRYPTO.slice(0, 8) : POPULAR_STOCKS.slice(0, 8);
        setDisplayList(candidates);
        if (finnhubKey) {
          setLoadingPrices(true);
          fetchPrices(candidates).then(fetched => {
            setPrices(prev => ({ ...prev, ...fetched }));
            setLoadingPrices(false);
          });
        }
      }, [browseTab, finnhubKey]);

      // Handle typing — instant local filter + debounced Finnhub search
      const handleQueryChange = (val) => {
        setQuery(val);
        setApiError("");
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!val.trim()) return;

        // Instant local filter from popular lists
        const q = val.trim().toUpperCase();
        const all = [...POPULAR_STOCKS, ...POPULAR_CRYPTO];
        const filtered = all.filter(x =>
          (x.displaySymbol || x.symbol).toUpperCase().includes(q) ||
          x.name.toUpperCase().includes(q)
        ).sort((a, b) => {
          const aS = (a.displaySymbol || a.symbol).toUpperCase();
          const bS = (b.displaySymbol || b.symbol).toUpperCase();
          if (aS === q) return -1;
          if (bS === q) return 1;
          if (aS.startsWith(q) && !bS.startsWith(q)) return -1;
          if (bS.startsWith(q) && !aS.startsWith(q)) return 1;
          return 0;
        });
        setDisplayList(filtered);
        fetchPrices(filtered).then(f => setPrices(prev => ({ ...prev, ...f })));

        // Then Finnhub full search after 300ms
        if (finnhubKey) {
          debounceRef.current = setTimeout(() => doSearch(val.trim()), 300);
        }
      };

      const doSearch = async (q) => {
        setLoading(true);
        try {
          const r = await fetch(`/api/finnhub?endpoint=search&q=${encodeURIComponent(q)}`);
          if (!r.ok) throw new Error(`Finnhub ${r.status}`);
          const data = await r.json();
          const qUp = q.toUpperCase();
          const items = (data.result || [])
            .filter(x => ["Common Stock","ETP","Crypto"].includes(x.type))
            .map(x => ({
              symbol: x.symbol,
              displaySymbol: x.displaySymbol || x.symbol,
              name: x.description,
              type: x.type === "Crypto" ? "crypto" : "stock",
              sector: x.type === "Crypto" ? "Crypto" : x.type === "ETP" ? "ETF" : "Stock",
            }))
            .sort((a, b) => {
              const aS = (a.displaySymbol || a.symbol).toUpperCase();
              const bS = (b.displaySymbol || b.symbol).toUpperCase();
              if (aS === qUp) return -1;
              if (bS === qUp) return 1;
              if (aS.startsWith(qUp) && !bS.startsWith(qUp)) return -1;
              if (bS.startsWith(qUp) && !aS.startsWith(qUp)) return 1;
              return 0;
            });
          setDisplayList(items);
          fetchPrices(items).then(f => setPrices(prev => ({ ...prev, ...f })));
        } catch(e) {
          setApiError(`Search error: ${e.message}`);
        }
        setLoading(false);
      };

      const openPanel = async (item) => {
        const key = item.symbol;
        if (expandedKey === key) { setExpandedKey(null); return; }
        setExpandedKey(key);
        setPanelShares("");
        setPanelDate(new Date().toISOString().slice(0,10));
        setPanelAvg(prices[key]?.price || null);
        setPanelError("");
      };

      const fetchHistoricalPrice = async (item, date) => {
        if (!finnhubKey || !date) return;
        const sym = item.displaySymbol || item.symbol;
        const today = new Date().toISOString().slice(0,10);
        if (date >= today) {
          // Use live price for today
          setPanelAvg(prices[item.symbol]?.price || null);
          return;
        }
        setPanelFetching(true);
        setPanelError("");
        try {
          const d = new Date(date);
          const from = Math.floor(d.getTime()/1000) - 86400;
          const to   = Math.floor(d.getTime()/1000) + 86400*2;
          const url  = `/api/finnhub?endpoint=candle&symbol=${encodeURIComponent(sym)}&resolution=D&from=${from}&to=${to}`;
          const res  = await fetch(url);
          const data = await res.json();
          if (data.s === "ok" && data.c?.length) {
            setPanelAvg(data.c[0]);
          } else {
            // Candle not available (free tier) — fall back to current price
            setPanelAvg(prices[item.symbol]?.price || null);
            setPanelError("Historical price unavailable on free tier — using current price");
          }
        } catch {
          setPanelAvg(prices[item.symbol]?.price || null);
        }
        setPanelFetching(false);
      };

      const confirmAdd = (item) => {
        const shares = parseFloat(panelShares);
        if (!shares || shares <= 0) { setPanelError("Enter number of shares"); return; }
        const avg = panelAvg || prices[item.symbol]?.price;
        if (!avg || avg <= 0) { setPanelError("Could not determine price"); return; }
        const displaySym = item.displaySymbol || item.symbol;
        const livePrice  = prices[item.symbol]?.price || avg;

        setPortfolio(prev => {
          const existing = prev.find(h => h.symbol === displaySym);
          if (existing) {
            const totalShares = existing.shares + shares;
            const newAvg = ((existing.shares * existing.avg) + (shares * avg)) / totalShares;
            return prev.map(h => h.symbol === displaySym
              ? { ...h, shares: totalShares, avg: parseFloat(newAvg.toFixed(4)), dateAdded: h.dateAdded || panelDate }
              : h
            );
          } else {
            return [...prev, {
              symbol: displaySym, name: item.name, shares,
              avg: parseFloat(avg.toFixed(4)),
              sector: item.sector || "Other",
              price: livePrice, change: prices[item.symbol]?.change || 0,
              live: true, dateAdded: panelDate,
            }];
          }
        });

        setAdded(prev => ({ ...prev, [item.symbol]: true }));
        setExpandedKey(null);
        setTimeout(() => setAdded(prev => ({ ...prev, [item.symbol]: false })), 2500);
      };

      const inPortfolio = (item) => {
        const sym = item.displaySymbol || item.symbol;
        return portfolio.some(h => h.symbol === sym);
      };

      const tabBtnStyle = (active) => ({
        background: active ? `${C.cyan}22` : "none",
        border: `1px solid ${active ? C.cyan : C.border}`,
        borderRadius: 6, padding: "4px 14px",
        color: active ? C.cyan : C.textMuted,
        fontFamily: "'Space Mono',monospace", fontSize: 10,
        cursor: "pointer", transition: "all 0.2s",
      });

      return (
        <div>
          {/* Search bar with dropdown */}
          <div style={{ position:"relative", marginBottom:12 }}>
            <div style={{ display:"flex", gap:10, background:C.bgCard, border:`1px solid ${showDropdown&&query?C.cyan+"88":C.borderBright}`, borderRadius: showDropdown&&query&&displayList.length?"14px 14px 0 0":"14px", padding:"11px 16px", alignItems:"center", backdropFilter:"blur(10px)", transition:"border-radius 0.15s, border-color 0.2s" }}>
              <span style={{ fontSize:14, color:C.cyan }}>⌕</span>
              <input value={query} onChange={e=>{ handleQueryChange(e.target.value); setShowDropdown(true); }}
                onKeyDown={e=>{ if(e.key==="Enter"&&query.trim()){ setShowDropdown(false); doSearch(query.trim()); } if(e.key==="Escape"){ setShowDropdown(false); } }}
                onFocus={()=>query&&setShowDropdown(true)}
                onBlur={()=>setTimeout(()=>setShowDropdown(false), 150)}
                placeholder="Search any stock or crypto — e.g. Apple, BTC, NVDA..."
                style={{ flex:1, background:"none", border:"none", outline:"none", color:C.text, fontFamily:"'Space Mono',monospace", fontSize:11 }}/>
              {loading && <Spinner color={C.cyan}/>}
              {query && <button onClick={()=>{setQuery("");setApiError("");setShowDropdown(false);}} style={{ background:"none", border:"none", color:C.textMuted, fontSize:14, cursor:"pointer", lineHeight:1 }}>✕</button>}
            </div>
            {/* Dropdown autocomplete */}
            {showDropdown && query && displayList.length > 0 && (
              <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:100, background:C.bgCard, border:`1px solid ${C.cyan+"88"}`, borderTop:"none", borderRadius:"0 0 14px 14px", overflow:"hidden", boxShadow:"0 12px 40px #00000088", maxHeight:280, overflowY:"auto" }}>
                {displayList.slice(0,8).map((item, i) => (
                  <div key={i}
                    onMouseDown={()=>{ setQuery(item.displaySymbol||item.symbol); setShowDropdown(false); doSearch(item.symbol); }}
                    style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", cursor:"pointer", borderBottom:i<Math.min(displayList.length,8)-1?`1px solid ${C.border}`:"none", background:"transparent", transition:"background 0.15s" }}
                    onMouseEnter={e=>e.currentTarget.style.background=C.bgCardHover}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(135deg,${C.cyan}22,${C.purple}22)`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:10, color:C.cyan, fontFamily:"'Space Mono',monospace" }}>
                        {(item.displaySymbol||item.symbol).slice(0,3)}
                      </div>
                      <div>
                        <div style={{ fontWeight:700, color:C.text, fontSize:13, fontFamily:"'DM Mono',monospace" }}>{item.displaySymbol||item.symbol}</div>
                        <div style={{ color:C.textMuted, fontSize:11 }}>{item.name}</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {prices[item.symbol]?.c && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:C.text }}>${prices[item.symbol].c.toFixed(2)}</span>}
                      <span style={{ fontSize:10, background:`${C.cyan}20`, color:C.cyan, borderRadius:4, padding:"2px 7px" }}>{item.sector||"Stock"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!finnhubKey && (
            <div style={{ background:C.yellow+"22", border:`1px solid ${C.yellow}44`, borderRadius:6, padding:"7px 12px", marginBottom:10, fontSize:10, color:C.yellow }}>⚙ Add your Finnhub API key in Settings to see live prices and search all markets</div>
          )}
          {apiError && (
            <div style={{ background:C.red+"22", border:`1px solid ${C.red}44`, borderRadius:6, padding:"7px 12px", marginBottom:8, fontSize:10, color:C.red }}>⚠ {apiError}</div>
          )}

          {/* Tab switcher + header */}
          <div style={{ display:"flex", gap:6, marginBottom:12, alignItems:"center" }}>
            <button style={{ background:browseTab==="stocks"?`${C.cyan}22`:"none", border:`1px solid ${browseTab==="stocks"?C.cyan:C.border}`, borderRadius:6, padding:"4px 14px", color:browseTab==="stocks"?C.cyan:C.textMuted, fontFamily:"'Space Mono',monospace", fontSize:10, cursor:"pointer", transition:"all 0.2s" }} onClick={()=>{setQuery("");setBrowseTab("stocks");}}>📈 STOCKS</button>
            <button style={{ background:browseTab==="crypto"?`${C.cyan}22`:"none", border:`1px solid ${browseTab==="crypto"?C.cyan:C.border}`, borderRadius:6, padding:"4px 14px", color:browseTab==="crypto"?C.cyan:C.textMuted, fontFamily:"'Space Mono',monospace", fontSize:10, cursor:"pointer", transition:"all 0.2s" }} onClick={()=>{setQuery("");setBrowseTab("crypto");}}>₿ CRYPTO</button>
            {!isSearchMode && (
              <span style={{ fontSize:9, color:C.green, marginLeft:4, letterSpacing:"0.1em", display:"flex", alignItems:"center", gap:5 }}>
                {loadingPrices ? <Spinner color={C.green}/> : "★ POPULAR"}
              </span>
            )}
            {isSearchMode && <span style={{ fontSize:9, color:C.textMuted }}>RESULTS FOR "{query}"</span>}
            {(loading || (loadingPrices && isSearchMode)) && <Spinner color={C.cyan}/>}
          </div>

          {/* Results list */}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {displayList.map((item, i) => {
              const key        = item.symbol;
              const priceData  = prices[key];
              const price      = priceData?.price || 0;
              const change     = priceData?.change || 0;
              const hasPrice   = price > 0;
              const isAdded    = added[key];
              const alreadyIn  = inPortfolio(item);
              const displaySym = item.displaySymbol || item.symbol;
              const isOpen     = expandedKey === key;

              return (
                <div key={key} style={{ background:C.bgCard, border:`1px solid ${isAdded?C.green+"60":isOpen?C.cyan+"44":C.border}`, borderRadius:14, padding:"12px 15px", animation:`fadeIn 0.15s ${Math.min(i,8)*0.04}s both`, transition:"border-color 0.2s" }}>

                  {/* Main row */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        <span style={{ fontSize:12, fontWeight:700, color:item.type==="crypto"?C.yellow:C.cyan, fontFamily:"'Space Mono',monospace" }}>{displaySym}</span>
                        <span style={{ fontSize:10, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:160 }}>{item.name}</span>
                        <span style={{ fontSize:8, color:C.textMuted, border:`1px solid ${C.border}`, padding:"1px 5px", borderRadius:4, flexShrink:0 }}>{item.sector}</span>
                        {alreadyIn && <span style={{ fontSize:8, color:C.purple, border:`1px solid ${C.purple}44`, padding:"1px 4px", borderRadius:3 }}>IN PORTFOLIO</span>}
                      </div>
                    </div>

                    <div style={{ display:"flex", alignItems:"center", gap:10, marginLeft:10, flexShrink:0 }}>
                      {/* Price */}
                      <div style={{ textAlign:"right", minWidth:70 }}>
                        {!finnhubKey ? (
                          <span style={{ fontSize:9, color:C.textDim }}>no key</span>
                        ) : !hasPrice ? (
                          <Spinner color={C.textMuted}/>
                        ) : (
                          <>
                            <div style={{ fontSize:12, fontWeight:700, color:C.text, fontFamily:"'Space Mono',monospace" }}>${price<0.01?price.toFixed(6):price.toFixed(2)}</div>
                            <div style={{ fontSize:10, color:change>=0?C.green:C.red }}>{change>=0?"▲":"▼"} {Math.abs(change).toFixed(2)}%</div>
                          </>
                        )}
                      </div>

                      {/* Add button */}
                      {isAdded ? (
                        <div style={{ background:C.green+"22", border:`1px solid ${C.green}55`, borderRadius:8, padding:"6px 14px", color:C.green, fontSize:10, fontWeight:700, fontFamily:"'Space Mono',monospace" }}>✓ ADDED</div>
                      ) : (
                        <button onClick={()=>openPanel(item)}
                          style={{ background:isOpen?`${C.cyan}18`:`linear-gradient(135deg,${C.cyan}22,${C.purple}22)`, border:`1px solid ${isOpen?C.cyan:C.cyan+"55"}`, borderRadius:8, padding:"6px 14px", color:C.cyan, fontSize:10, fontWeight:700, fontFamily:"'Space Mono',monospace", cursor:"pointer", transition:"all 0.2s" }}>
                          {isOpen ? "✕ CLOSE" : alreadyIn ? "+ ADD MORE" : "+ ADD"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline add panel */}
                  {isOpen && (
                    <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}`, animation:"fadeIn 0.15s both" }}>
                      {panelError && (
                        <div style={{ fontSize:9, color:C.yellow, marginBottom:8 }}>⚠ {panelError}</div>
                      )}
                      <div style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>

                        {/* Shares */}
                        <div style={{ flex:"1 1 100px", minWidth:90 }}>
                          <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.1em", marginBottom:5 }}>SHARES</div>
                          <input type="number" min="0" step="any" value={panelShares}
                            onChange={e=>{setPanelShares(e.target.value);setPanelError("");}}
                            onKeyDown={e=>e.key==="Enter"&&confirmAdd(item)}
                            placeholder="e.g. 10" autoFocus
                            style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${C.cyan}44`, borderRadius:8, padding:"8px 10px", color:C.text, fontFamily:"'Space Mono',monospace", fontSize:11, outline:"none", boxSizing:"border-box" }}
                            onFocus={e=>e.target.style.borderColor=C.cyan}
                            onBlur={e=>e.target.style.borderColor=C.cyan+"44"}/>
                        </div>

                        {/* Date */}
                        <div style={{ flex:"1 1 140px", minWidth:130 }}>
                          <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.1em", marginBottom:5 }}>DATE PURCHASED</div>
                          <input type="date" value={panelDate}
                            max={new Date().toISOString().slice(0,10)}
                            onChange={e=>{setPanelDate(e.target.value);fetchHistoricalPrice(item,e.target.value);}}
                            style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", color:C.text, fontFamily:"'Space Mono',monospace", fontSize:11, outline:"none", colorScheme:"dark", boxSizing:"border-box" }}
                            onFocus={e=>e.target.style.borderColor=C.cyan}
                            onBlur={e=>e.target.style.borderColor=C.border}/>
                        </div>

                        {/* Price at date */}
                        <div style={{ flex:"1 1 110px", minWidth:100 }}>
                          <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.1em", marginBottom:5 }}>PRICE ON DATE</div>
                          <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", fontSize:11, fontFamily:"'Space Mono',monospace", color:panelAvg?C.green:C.textDim, minHeight:35, display:"flex", alignItems:"center" }}>
                            {panelFetching ? <Spinner color={C.cyan}/> : panelAvg ? `$${panelAvg.toFixed(2)}` : "—"}
                          </div>
                        </div>

                        {/* Confirm button */}
                        <button onClick={()=>confirmAdd(item)}
                          style={{ flex:"0 0 auto", background:`linear-gradient(135deg,${C.cyan},${C.purple})`, border:"none", borderRadius:8, padding:"8px 20px", color:"#000", fontWeight:700, fontFamily:"'Space Mono',monospace", fontSize:11, cursor:"pointer", whiteSpace:"nowrap", alignSelf:"flex-end" }}>
                          CONFIRM
                        </button>
                      </div>

                      {/* Cost preview */}
                      {panelShares && parseFloat(panelShares) > 0 && panelAvg && (
                        <div style={{ marginTop:8, fontSize:10, color:C.textMuted }}>
                          {panelShares} × ${panelAvg.toFixed(2)} = <span style={{ color:C.cyan, fontFamily:"'Space Mono',monospace", fontWeight:700 }}>${(parseFloat(panelShares)*panelAvg).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && displayList.length === 0 && isSearchMode && (
              <div style={{ textAlign:"center", padding:"28px 0", color:C.textDim, fontSize:11 }}>No results for "{query}"</div>
            )}
          </div>
        </div>
      );
    }

    // ── Alerts Tab ───────────────────────────────────────────────────────────────
    function AlertsTab({ C, finnhubKey, portfolio, onAlertCount }) {
      const [quotes, setQuotes]     = useState({});
      const [loading, setLoading]   = useState(false);
      const [lastUpdated, setLastUpdated] = useState(null);


      const refresh = async () => {
        if (!finnhubKey || !portfolio.length) return;
        setLoading(true);
        const fetched = {};
        await Promise.allSettled(portfolio.map(async h => {
          try {
            const q = await fetchQuote(h.symbol, finnhubKey);
            if (q.c > 0) fetched[h.symbol] = {
              price:     q.c,
              change:    q.dp || 0,
              prevClose: q.pc || 0,
              high:      q.h  || 0,
              low:       q.l  || 0,
            };
          } catch {}
        }));
        setQuotes(fetched);
        setLastUpdated(new Date());
        setLoading(false);
      };

      useEffect(() => { refresh(); }, [finnhubKey, portfolio.length]);

      // Generate automatic alerts from market data
      const generateAlerts = () => {
        const alerts = [];
        const today = new Date().toISOString().slice(0,10);
        portfolio.forEach(h => {
          const q = quotes[h.symbol];
          if (!q) return;
          const { price, change, prevClose } = q;
          const avg = h.avg;
          const positionValue  = h.shares * price;
          const gainFromAvg    = ((price - avg) / avg) * 100;
          const todayDollar    = h.shares * (price - prevClose);
          const unrealizedPnL  = (price - avg) * h.shares;
          const key = (type) => `${h.symbol}_${type}_${today}`;

          // ── 1. Big move up today (3%+) ───────────────────────────────────────
          if (change >= 3) {
            const k = key("surge");
            alerts.push({
              key: k, symbol: h.symbol,
              severity: change >= 6 ? "high" : "medium",
              icon: change >= 6 ? "🚀" : "📈",
              color: C.green,
              title: `${h.symbol} is surging today`,
              body: `Up ${change.toFixed(1)}% today — you're ${todayDollar >= 0 ? "gaining" : "losing"} $${Math.abs(todayDollar).toFixed(0)} on this position`,
              signal: change >= 6 ? "SELL" : "HOLD",
              signalNote: change >= 6 ? "Strong move — consider taking some profit" : "Let it run, but watch for reversal",
            });
          }

          // ── 2. Big drop today (3%+) ───────────────────────────────────────────
          if (change <= -3) {
            const k = key("drop");
            alerts.push({
              key: k, symbol: h.symbol,
              severity: change <= -6 ? "high" : "medium",
              icon: change <= -6 ? "🆘" : "📉",
              color: C.red,
              title: `${h.symbol} is dropping today`,
              body: `Down ${Math.abs(change).toFixed(1)}% today — you're losing $${Math.abs(todayDollar).toFixed(0)} on this position today`,
              signal: change <= -6 ? "SELL" : "HOLD",
              signalNote: change <= -6 ? "Significant drop — consider cutting losses" : "Short-term dip, hold unless fundamentals change",
            });
          }

          // ── 3. Deep in the red vs your buy price ─────────────────────────────
          if (gainFromAvg <= -10) {
            const k = key("deep_loss");
            alerts.push({
              key: k, symbol: h.symbol,
              severity: gainFromAvg <= -20 ? "high" : "medium",
              icon: "🔻",
              color: C.red,
              title: `${h.symbol} is well below your buy price`,
              body: `Down ${Math.abs(gainFromAvg).toFixed(1)}% from your avg of $${avg.toFixed(2)} · unrealized loss: $${Math.abs(unrealizedPnL).toFixed(0)}`,
              signal: gainFromAvg <= -20 ? "SELL" : "HOLD",
              signalNote: gainFromAvg <= -20 ? "Consider cutting losses to protect capital" : "Evaluate if the thesis still holds",
            });
          } else if (gainFromAvg <= -3 && gainFromAvg > -10) {
            // Mild dip below cost — softer warning
            const k = key("below_avg");
            alerts.push({
              key: k, symbol: h.symbol,
              severity: "medium",
              icon: "⚠️",
              color: C.yellow,
              title: `${h.symbol} slipped below your buy price`,
              body: `Currently $${price.toFixed(2)} vs your avg of $${avg.toFixed(2)} — you're down ${Math.abs(gainFromAvg).toFixed(1)}%`,
              signal: "HOLD",
              signalNote: "Minor dip — watch closely before adding or selling",
            });
          }

          // ── 4. Strong gain vs buy price ───────────────────────────────────────
          if (gainFromAvg >= 25) {
            const k = key("big_gain");
            alerts.push({
              key: k, symbol: h.symbol,
              severity: gainFromAvg >= 50 ? "high" : "medium",
              icon: "💰",
              color: C.green,
              title: `${h.symbol} up ${gainFromAvg.toFixed(0)}% from your buy`,
              body: `Position is worth $${positionValue.toFixed(0)} · unrealized gain: +$${unrealizedPnL.toFixed(0)} since avg $${avg.toFixed(2)}`,
              signal: "SELL",
              signalNote: gainFromAvg >= 50 ? "Exceptional gain — strongly consider taking profit" : "Strong gain — consider trimming your position",
            });
          } else if (gainFromAvg >= 10) {
            const k = key("mod_gain");
            alerts.push({
              key: k, symbol: h.symbol,
              severity: "medium",
              icon: "✨",
              color: C.green,
              title: `${h.symbol} up ${gainFromAvg.toFixed(0)}% from your buy`,
              body: `Sitting on +$${unrealizedPnL.toFixed(0)} gain · current price $${price.toFixed(2)} vs avg $${avg.toFixed(2)}`,
              signal: "HOLD",
              signalNote: "Good gain — hold unless you need liquidity",
            });
          }

          // ── 5. Large dollar loss today (>$200 or >2% of position) ────────────
          const pctTodayOfPosition = Math.abs(todayDollar) / positionValue * 100;
          if (todayDollar <= -200 || (todayDollar < 0 && pctTodayOfPosition >= 2)) {
            const k = key("dollar_loss_today");
            alerts.push({
              key: k, symbol: h.symbol,
              severity: Math.abs(todayDollar) >= 500 ? "high" : "medium",
              icon: "💸",
              color: C.red,
              title: `${h.symbol} costing you today`,
              body: `-$${Math.abs(todayDollar).toFixed(0)} on your ${h.shares} shares (${Math.abs(change).toFixed(1)}% move) — bigger than typical daily swing`,
              signal: "HOLD",
              signalNote: "Don't panic-sell — assess if news-driven or just volatility",
            });
          }

          // ── 6. Approaching buy price from above (within 3%) ──────────────────
          if (gainFromAvg > 0 && gainFromAvg < 3) {
            const k = key("near_avg");
            alerts.push({
              key: k, symbol: h.symbol,
              severity: "medium",
              icon: "🎯",
              color: C.yellow,
              title: `${h.symbol} nearing your buy price`,
              body: `Only ${gainFromAvg.toFixed(1)}% above your avg of $${avg.toFixed(2)} — if it drops further you'll be in the red`,
              signal: "HOLD",
              signalNote: "Watch closely — consider buying more if you're bullish",
            });
          }
        });

        // Sort by severity: high first
        const sevOrder = { high:0, medium:1 };
        return alerts.sort((a,b) => (sevOrder[a.severity]||1) - (sevOrder[b.severity]||1));
      };

      const alerts = generateAlerts();

      // Notify parent of alert count for nav badge
      useEffect(() => {
        if (onAlertCount) onAlertCount(alerts.length);
      }, [alerts.length]);

      const signalColors = { BUY: C.green, SELL: C.red, HOLD: C.yellow };
      const signalBg     = { BUY: C.green+"22", SELL: C.red+"22", HOLD: C.yellow+"22" };

      return (
        <div>
          {/* Header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:12, fontWeight:700, color:C.text, letterSpacing:"0.08em" }}>MARKET ALERTS</span>
              {alerts.length > 0 && (
                <span style={{ background:alerts.some(a=>a.severity==="high")?C.red:C.yellow, color:"#fff", fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:10 }}>
                  {alerts.length} active
                </span>
              )}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {lastUpdated && <span style={{ fontSize:9, color:C.textDim }}>updated {lastUpdated.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span>}
              <button onClick={refresh} disabled={loading||!finnhubKey} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 12px", color:loading?C.textDim:C.textMuted, fontSize:9, fontFamily:"'Space Mono',monospace", cursor:loading?"not-allowed":"pointer" }}>
                {loading ? "···" : "↻ REFRESH"}
              </button>
            </div>
          </div>

          {!finnhubKey && (
            <div style={{ textAlign:"center", padding:"50px 20px", border:`1px dashed ${C.border}`, borderRadius:14 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🔔</div>
              <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:8 }}>No Finnhub key connected</div>
              <div style={{ fontSize:11, color:C.textMuted, lineHeight:1.6 }}>Add your Finnhub key in Settings to get<br/>automatic alerts based on market movement</div>
            </div>
          )}

          {finnhubKey && !portfolio.length && (
            <div style={{ textAlign:"center", padding:"40px 0", border:`1px dashed ${C.border}`, borderRadius:14 }}>
              <div style={{ fontSize:28, marginBottom:10 }}>📊</div>
              <div style={{ fontSize:12, color:C.textMuted }}>Add stocks to your portfolio to see alerts</div>
            </div>
          )}

          {finnhubKey && portfolio.length > 0 && loading && !Object.keys(quotes).length && (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {portfolio.map((_,i) => <div key={i} style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:14, height:90, animation:`pulse 1.5s ${i*0.1}s infinite` }}/>)}
            </div>
          )}

          {finnhubKey && Object.keys(quotes).length > 0 && (
            <>
              {alerts.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 0", border:`1px dashed ${C.border}`, borderRadius:14 }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
                  <div style={{ fontSize:12, fontWeight:600, color:C.green, marginBottom:4 }}>All clear</div>
                  <div style={{ fontSize:10, color:C.textMuted }}>No notable market activity in your portfolio right now</div>
                </div>
              )}

              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {alerts.map((a, i) => (
                  <div key={a.key} style={{ background:C.bgCard, border:`1px solid ${a.color}44`, borderRadius:14, padding:"14px 16px", animation:`fadeIn 0.2s ${i*0.05}s both`, position:"relative", overflow:"hidden" }}>
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${a.color},transparent)` }}/>
                    <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                      <div style={{ fontSize:22, lineHeight:1, marginTop:2, flexShrink:0 }}>{a.icon}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5, flexWrap:"wrap" }}>
                          <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{a.title}</span>
                          {a.severity === "high" && <span style={{ fontSize:8, background:a.color, color:"#fff", padding:"1px 6px", borderRadius:6, fontWeight:700 }}>HIGH</span>}
                        </div>
                        <div style={{ fontSize:11, color:C.textMuted, lineHeight:1.5, marginBottom:8 }}>{a.body}</div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                          {quotes[a.symbol] && (
                            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                              <span style={{ fontSize:11, color:C.text, fontFamily:"'DM Mono',monospace", fontWeight:600 }}>${quotes[a.symbol].price.toFixed(2)}</span>
                              <span style={{ fontSize:10, color:quotes[a.symbol].change>=0?C.green:C.red }}>{quotes[a.symbol].change>=0?"▲":"▼"} {Math.abs(quotes[a.symbol].change).toFixed(2)}%</span>
                            </div>
                          )}
                          {a.signal && (
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <div style={{ background:signalBg[a.signal], border:`1px solid ${signalColors[a.signal]}66`, borderRadius:8, padding:"3px 10px" }}>
                                <span style={{ fontSize:10, fontWeight:800, color:signalColors[a.signal], fontFamily:"'Space Mono',monospace" }}>{a.signal}</span>
                              </div>
                              <span style={{ fontSize:10, color:C.textMuted, fontStyle:"italic" }}>{a.signalNote}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop:10, fontSize:9, color:C.textDim, textAlign:"center" }}>
                Watching {portfolio.length} holding{portfolio.length!==1?"s":""} · alerts refresh on load and manually
              </div>
            </>
          )}
        </div>
      );
    }

    // ── Section helper ───────────────────────────────────────────────────────────
    function Section({ label, children, C, last }) {
      return (
        <div style={{ marginBottom:last?0:16, paddingBottom:last?0:16, borderBottom:last?"none":`1px solid ${C.border}` }}>
          <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.15em", marginBottom:8 }}>{label}</div>
          {children}
        </div>
      );
    }

    // ── Settings Panel ───────────────────────────────────────────────────────────
    function SettingsPanel({ C, darkMode, setDarkMode, notifications, setNotifications, onClose, currentUser, onSignOut }) {

      return (
        <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"flex-start", justifyContent:"flex-end" }} onClick={onClose}>
          <div onClick={e=>e.stopPropagation()} style={{ marginTop:56, marginRight:14, width:320, background:darkMode?"#090e1c":"#ffffff", border:`1px solid ${C.border}`, borderRadius:12, padding:20, boxShadow:"0 20px 60px #00000088", animation:"slideIn 0.2s both", maxHeight:"calc(100vh - 80px)", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
              <span style={{ fontSize:12, fontWeight:700, color:C.text, letterSpacing:"0.1em" }}>SETTINGS</span>
              <button onClick={onClose} style={{ background:"none", border:"none", color:C.textMuted, fontSize:16, cursor:"pointer" }}>✕</button>
            </div>

            {/* API Status — server-side keys, no user input needed */}
            <Section label="DATA SOURCES" C={C}>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {[
                  { label:"AI Advisor", desc:"Powered by Claude", color:C.purple },
                  { label:"Live Prices", desc:"Powered by Finnhub", color:C.cyan },
                  { label:"Live News", desc:"Powered by Finnhub", color:C.green },
                ].map(({ label, desc, color }) => (
                  <div key={label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:C.bg, border:`1px solid ${color}33`, borderRadius:6, padding:"8px 12px" }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:C.text, fontFamily:"'Space Mono',monospace" }}>{label}</div>
                      <div style={{ fontSize:10, color:C.textMuted, marginTop:2 }}>{desc}</div>
                    </div>
                    <span style={{ fontSize:10, color:color }}>● Live</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Account */}
            <Section label="ACCOUNT" C={C}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(135deg,${C.purple},${C.cyan})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#fff", flexShrink:0 }}>
                  {currentUser?.name?.[0]?.toUpperCase() || "U"}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{currentUser?.name || "User"}</div>
                  <div style={{ fontSize:11, color:C.textMuted }}>{currentUser?.email || ""}</div>
                </div>
              </div>
              <button onClick={onSignOut}
                style={{ width:"100%", padding:"9px 0", borderRadius:8, border:`1px solid ${C.red}44`, background:"none", color:C.red, fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700, cursor:"pointer", letterSpacing:"0.05em", transition:"all 0.2s" }}>
                SIGN OUT
              </button>
            </Section>

            {/* Theme */}
            <Section label="THEME" C={C}>
              <div style={{ display:"flex", gap:8 }}>
                {[{label:"DARK",val:true},{label:"LIGHT",val:false}].map(({label,val})=>(
                  <button key={label} onClick={()=>setDarkMode(val)} style={{ flex:1, background:darkMode===val?`linear-gradient(135deg,${C.purple}44,${C.cyan}22)`:"none", border:`1px solid ${darkMode===val?C.cyan:C.border}`, borderRadius:6, padding:"7px", color:darkMode===val?C.cyan:C.textMuted, fontFamily:"'Space Mono',monospace", fontSize:10, cursor:"pointer", transition:"all 0.2s" }}>{label}</button>
                ))}
              </div>
            </Section>

            {/* Notifications */}
            <Section label="NOTIFICATIONS" C={C}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontSize:11, color:C.text }}>Push notifications</span>
                <div onClick={()=>setNotifications(n=>!n)} style={{ width:36, height:20, borderRadius:10, background:notifications?C.green:C.border, cursor:"pointer", position:"relative", transition:"background 0.3s" }}>
                  <div style={{ position:"absolute", top:3, left:notifications?17:3, width:14, height:14, borderRadius:"50%", background:"#fff", transition:"left 0.3s" }}/>
                </div>
              </div>
            </Section>

          </div>
        </div>
      );
    }

    // ── Main App ─────────────────────────────────────────────────────────────────
    const TICKER_POOL = [
      {sym:"BINANCE:BTCUSDT", l:"BTC"},
      {sym:"BINANCE:ETHUSD",  l:"ETH"},
      {sym:"BINANCE:SOLUSD",  l:"SOL"},
      {sym:"AAPL",  l:"AAPL"},
      {sym:"MSFT",  l:"MSFT"},
      {sym:"NVDA",  l:"NVDA"},
      {sym:"TSLA",  l:"TSLA"},
      {sym:"AMZN",  l:"AMZN"},
      {sym:"META",  l:"META"},
      {sym:"GOOGL", l:"GOOGL"},
      {sym:"AMD",   l:"AMD"},
      {sym:"NFLX",  l:"NFLX"},
      {sym:"COIN",  l:"COIN"},
      {sym:"JPM",   l:"JPM"},
      {sym:"V",     l:"V"},
      {sym:"WMT",   l:"WMT"},
      {sym:"DIS",   l:"DIS"},
      {sym:"UBER",  l:"UBER"},
      {sym:"SHOP",  l:"SHOP"},
      {sym:"PLTR",  l:"PLTR"},
    ];

    // ── COMPARE TAB ─────────────────────────────────────────────────────────────
    function CompareTab({ C, finnhubKey, portfolio }) {
      const [symA, setSymA] = useState(portfolio[0]?.symbol || "");
      const [symB, setSymB] = useState(portfolio[1]?.symbol || "");
      const [inputA, setInputA] = useState(portfolio[0]?.symbol || "");
      const [inputB, setInputB] = useState(portfolio[1]?.symbol || "");
      const [dataA, setDataA] = useState(null);
      const [dataB, setDataB] = useState(null);
      const [candleA, setCandleA] = useState(null);
      const [candleB, setCandleB] = useState(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState("");
      const [hover, setHover] = useState(null);
      const svgRef = useRef(null);

      // Live search state for both inputs
      const [suggestA, setSuggestA] = useState([]);
      const [suggestB, setSuggestB] = useState([]);
      const [showA, setShowA] = useState(false);
      const [showB, setShowB] = useState(false);
      const debounceA = useRef(null);
      const debounceB = useRef(null);

      const searchSymbols = async (q, setSuggestions) => {
        if (!q || q.length < 1) { setSuggestions([]); return; }
        try {
          const r = await fetch(`/api/finnhub?endpoint=search&q=${encodeURIComponent(q)}`);
          const data = await r.json();
          const results = (data.result || []).filter(s => s.type === "Common Stock" || s.type === "EQS" || s.type === "").slice(0, 6);
          setSuggestions(results);
        } catch { setSuggestions([]); }
      };

      const handleInputA = (val) => {
        setInputA(val.toUpperCase());
        clearTimeout(debounceA.current);
        debounceA.current = setTimeout(() => searchSymbols(val, setSuggestA), 250);
        setShowA(true);
      };

      const handleInputB = (val) => {
        setInputB(val.toUpperCase());
        clearTimeout(debounceB.current);
        debounceB.current = setTimeout(() => searchSymbols(val, setSuggestB), 250);
        setShowB(true);
      };

      const pickA = (sym) => { setInputA(sym); setShowA(false); setSuggestA([]); };
      const pickB = (sym) => { setInputB(sym); setShowB(false); setSuggestB([]); };

      async function loadComparison(sA, sB) {
        if (!sA || !sB) return;
        if (sA.toUpperCase() === sB.toUpperCase()) { setError("Please enter two different symbols."); return; }
        setError(""); setLoading(true); setDataA(null); setDataB(null); setCandleA(null); setCandleB(null);
        try {
          const [qA, qB] = await Promise.all([fetchQuote(sA.toUpperCase()), fetchQuote(sB.toUpperCase())]);
          if (!qA.c || !qB.c) throw new Error("Invalid symbol");
          setDataA({ ...qA, symbol: sA.toUpperCase() });
          setDataB({ ...qB, symbol: sB.toUpperCase() });

          // Fetch 30-day candles
          const now = Math.floor(Date.now()/1000);
          const from = now - 60*60*24*30;
          const [cA, cB] = await Promise.all([
            fetch(`/api/finnhub?endpoint=candle&symbol=${encodeURIComponent(sA.toUpperCase())}&resolution=D&from=${from}&to=${now}`).then(r=>r.json()),
            fetch(`/api/finnhub?endpoint=candle&symbol=${encodeURIComponent(sB.toUpperCase())}&resolution=D&from=${from}&to=${now}`).then(r=>r.json()),
          ]);
          if (cA.s === "ok") setCandleA(cA);
          if (cB.s === "ok") setCandleB(cB);
        } catch(e) {
          setError("Could not load one or both symbols. Check your Finnhub key.");
        }
        setLoading(false);
      }

      useEffect(() => { if (symA && symB) loadComparison(symA, symB); }, []);

      function handleCompare() {
        const a = inputA.trim().toUpperCase();
        const b = inputB.trim().toUpperCase();
        setSymA(a); setSymB(b);
        loadComparison(a, b);
      }

      // Normalize candles to % change from first close
      function normalize(candle) {
        if (!candle || !candle.c || !candle.c.length) return [];
        const base = candle.c[0];
        return candle.t.map((t, i) => ({ t, pct: ((candle.c[i] - base) / base) * 100 }));
      }

      const normA = normalize(candleA);
      const normB = normalize(candleB);

      // Build SVG chart
      const W = 700, H = 180, PAD = { top:16, right:16, bottom:24, left:44 };
      const allPcts = [...normA.map(p=>p.pct), ...normB.map(p=>p.pct)];
      const minPct = allPcts.length ? Math.min(...allPcts) : -5;
      const maxPct = allPcts.length ? Math.max(...allPcts) : 5;
      const range = Math.max(maxPct - minPct, 2);
      const xScale = (i, len) => PAD.left + (i / (len - 1)) * (W - PAD.left - PAD.right);
      const yScale = v => PAD.top + (1 - (v - minPct) / range) * (H - PAD.top - PAD.bottom);

      function toPath(pts) {
        if (!pts.length) return "";
        return pts.map((p, i) => `${i===0?"M":"L"}${xScale(i, pts.length).toFixed(1)},${yScale(p.pct).toFixed(1)}`).join(" ");
      }

      function StatRow({ label, valA, valB, format, higherIsBetter }) {
        const a = parseFloat(valA), b = parseFloat(valB);
        const aWins = higherIsBetter !== undefined ? (higherIsBetter ? a > b : a < b) : null;
        return (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:11, color:C.textMuted, display:"flex", alignItems:"center" }}>{label}</div>
            <div style={{ fontSize:13, fontWeight:600, color: aWins===true ? C.green : aWins===false ? C.red : C.text, textAlign:"center", fontFamily:"'DM Mono',monospace" }}>{format ? format(valA) : valA ?? "—"}</div>
            <div style={{ fontSize:13, fontWeight:600, color: aWins===false ? C.green : aWins===true ? C.red : C.text, textAlign:"center", fontFamily:"'DM Mono',monospace" }}>{format ? format(valB) : valB ?? "—"}</div>
          </div>
        );
      }

      const fmt$ = v => v != null ? `$${parseFloat(v).toFixed(2)}` : "—";
      const fmtPct = v => v != null ? `${parseFloat(v).toFixed(2)}%` : "—";

      return (
        <div>
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:4 }}>Compare Stocks</div>
            <div style={{ fontSize:12, color:C.textMuted }}>Side-by-side performance & stats for any two symbols</div>
          </div>

          {/* Input row */}
          <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:28 }}>
            {/* Input A with live search */}
            <div style={{ flex:1, position:"relative" }}>
              <input value={inputA} onChange={e=>handleInputA(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"){ setShowA(false); handleCompare(); } if(e.key==="Escape") setShowA(false); }}
                onFocus={()=>inputA&&setShowA(true)} onBlur={()=>setTimeout(()=>setShowA(false),150)}
                placeholder="Symbol A (e.g. AAPL)"
                style={{ width:"100%", boxSizing:"border-box", background:C.bgCard, border:`1px solid ${C.cyan}66`, borderRadius:8, padding:"10px 14px", color:C.text, fontSize:13, fontFamily:"'DM Mono',monospace", outline:"none" }}/>
              {showA && suggestA.length > 0 && (
                <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:50, background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden", boxShadow:"0 8px 32px #00000066" }}>
                  {suggestA.map((s,i) => (
                    <div key={i} onMouseDown={()=>pickA(s.symbol)}
                      style={{ padding:"9px 14px", cursor:"pointer", borderBottom:i<suggestA.length-1?`1px solid ${C.border}`:"none", display:"flex", justifyContent:"space-between", alignItems:"center", background:"transparent" }}
                      onMouseEnter={e=>e.currentTarget.style.background=C.bgCardHover}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{ fontWeight:700, color:C.cyan, fontFamily:"'DM Mono',monospace", fontSize:13 }}>{s.symbol}</span>
                      <span style={{ color:C.textMuted, fontSize:11, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ fontSize:16, color:C.textMuted, fontWeight:700 }}>VS</div>
            {/* Input B with live search */}
            <div style={{ flex:1, position:"relative" }}>
              <input value={inputB} onChange={e=>handleInputB(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"){ setShowB(false); handleCompare(); } if(e.key==="Escape") setShowB(false); }}
                onFocus={()=>inputB&&setShowB(true)} onBlur={()=>setTimeout(()=>setShowB(false),150)}
                placeholder="Symbol B (e.g. MSFT)"
                style={{ width:"100%", boxSizing:"border-box", background:C.bgCard, border:`1px solid ${C.purple}66`, borderRadius:8, padding:"10px 14px", color:C.text, fontSize:13, fontFamily:"'DM Mono',monospace", outline:"none" }}/>
              {showB && suggestB.length > 0 && (
                <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:50, background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden", boxShadow:"0 8px 32px #00000066" }}>
                  {suggestB.map((s,i) => (
                    <div key={i} onMouseDown={()=>pickB(s.symbol)}
                      style={{ padding:"9px 14px", cursor:"pointer", borderBottom:i<suggestB.length-1?`1px solid ${C.border}`:"none", display:"flex", justifyContent:"space-between", alignItems:"center", background:"transparent" }}
                      onMouseEnter={e=>e.currentTarget.style.background=C.bgCardHover}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{ fontWeight:700, color:C.purple, fontFamily:"'DM Mono',monospace", fontSize:13 }}>{s.symbol}</span>
                      <span style={{ color:C.textMuted, fontSize:11, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={handleCompare} disabled={loading} style={{ padding:"10px 20px", background:`linear-gradient(135deg,${C.cyan},${C.purple})`, border:"none", borderRadius:8, color:"#fff", fontWeight:700, fontSize:13, cursor:loading?"not-allowed":"pointer", opacity:loading?0.6:1 }}>
              {loading ? "Loading..." : "Compare"}
            </button>
          </div>

          {error && <div style={{ color:C.red, fontSize:12, marginBottom:16 }}>{error}</div>}

          {dataA && dataB && (
            <>
              {/* Header cards */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
                {[{d:dataA,color:C.cyan},{d:dataB,color:C.purple}].map(({d,color})=>(
                  <div key={d.symbol} style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:20, borderTop:`3px solid ${color}` }}>
                    <div style={{ fontSize:22, fontWeight:800, color, fontFamily:"'Space Mono',monospace" }}>{d.symbol}</div>
                    <div style={{ fontSize:28, fontWeight:700, color:C.text, marginTop:4, fontFamily:"'DM Mono',monospace" }}>${d.c?.toFixed(2)}</div>
                    <div style={{ fontSize:13, color: d.dp >= 0 ? C.green : C.red, marginTop:4, fontWeight:600 }}>
                      {d.dp >= 0 ? "▲" : "▼"} {Math.abs(d.dp)?.toFixed(2)}% today
                    </div>
                    <div style={{ display:"flex", gap:16, marginTop:12 }}>
                      <div><div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.08em" }}>HIGH</div><div style={{ fontSize:12, color:C.text, fontFamily:"'DM Mono',monospace" }}>${d.h?.toFixed(2)}</div></div>
                      <div><div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.08em" }}>LOW</div><div style={{ fontSize:12, color:C.text, fontFamily:"'DM Mono',monospace" }}>${d.l?.toFixed(2)}</div></div>
                      <div><div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.08em" }}>OPEN</div><div style={{ fontSize:12, color:C.text, fontFamily:"'DM Mono',monospace" }}>${d.o?.toFixed(2)}</div></div>
                      <div><div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.08em" }}>PREV</div><div style={{ fontSize:12, color:C.text, fontFamily:"'DM Mono',monospace" }}>${d.pc?.toFixed(2)}</div></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 30-day chart overlay */}
              {(normA.length > 0 || normB.length > 0) && (
                <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:24 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text }}>30-Day Performance (% change)</div>
                    <div style={{ display:"flex", gap:16 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}><div style={{ width:24, height:2, background:C.cyan, borderRadius:1 }}/><span style={{ fontSize:11, color:C.textMuted, fontFamily:"'DM Mono',monospace" }}>{dataA.symbol}</span></div>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}><div style={{ width:24, height:2, background:C.purple, borderRadius:1 }}/><span style={{ fontSize:11, color:C.textMuted, fontFamily:"'DM Mono',monospace" }}>{dataB.symbol}</span></div>
                    </div>
                  </div>
                  <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:H, overflow:"visible" }}
                    onMouseMove={e => {
                      const rect = svgRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const x = (e.clientX - rect.left) / rect.width * W;
                      const i = Math.round((x - PAD.left) / (W - PAD.left - PAD.right) * (normA.length - 1));
                      if (i >= 0 && i < normA.length) setHover(i);
                    }}
                    onMouseLeave={() => setHover(null)}>
                    {/* Zero line */}
                    <line x1={PAD.left} y1={yScale(0)} x2={W-PAD.right} y2={yScale(0)} stroke={C.border} strokeDasharray="3,3" strokeWidth="1"/>
                    {/* Y axis labels */}
                    {[minPct, 0, maxPct].map(v => (
                      <text key={v} x={PAD.left-6} y={yScale(v)+4} textAnchor="end" fontSize="9" fill={C.textMuted}>{v.toFixed(1)}%</text>
                    ))}
                    {/* Paths */}
                    {normA.length > 1 && <path d={toPath(normA)} fill="none" stroke={C.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}
                    {normB.length > 1 && <path d={toPath(normB)} fill="none" stroke={C.purple} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}
                    {/* Hover */}
                    {hover !== null && normA[hover] && (
                      <>
                        <line x1={xScale(hover, normA.length)} y1={PAD.top} x2={xScale(hover, normA.length)} y2={H-PAD.bottom} stroke={C.border} strokeWidth="1"/>
                        <circle cx={xScale(hover, normA.length)} cy={yScale(normA[hover].pct)} r="4" fill={C.cyan} stroke={C.bgCard} strokeWidth="2"/>
                        {normB[hover] && <circle cx={xScale(hover, normB.length)} cy={yScale(normB[hover].pct)} r="4" fill={C.purple} stroke={C.bgCard} strokeWidth="2"/>}
                        <rect x={xScale(hover, normA.length)+8} y={PAD.top} width={110} height={normB[hover]?44:26} rx="4" fill={C.bgCard} stroke={C.border}/>
                        <text x={xScale(hover, normA.length)+14} y={PAD.top+14} fontSize="10" fill={C.cyan}>{dataA.symbol}: {normA[hover].pct.toFixed(2)}%</text>
                        {normB[hover] && <text x={xScale(hover, normB.length)+14} y={PAD.top+30} fontSize="10" fill={C.purple}>{dataB.symbol}: {normB[hover].pct.toFixed(2)}%</text>}
                      </>
                    )}
                  </svg>
                </div>
              )}

              {/* Stats table */}
              <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:12 }}>Today's Stats</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:8 }}>
                  <div style={{ fontSize:10, color:C.textMuted, letterSpacing:"0.08em" }}>METRIC</div>
                  <div style={{ fontSize:10, color:C.cyan, letterSpacing:"0.08em", textAlign:"center", fontFamily:"'DM Mono',monospace" }}>{dataA.symbol}</div>
                  <div style={{ fontSize:10, color:C.purple, letterSpacing:"0.08em", textAlign:"center", fontFamily:"'DM Mono',monospace" }}>{dataB.symbol}</div>
                </div>
                <StatRow label="Current Price" valA={dataA.c} valB={dataB.c} format={fmt$} />
                <StatRow label="Today's Change" valA={dataA.d} valB={dataB.d} format={v => `${v>=0?"+":""}$${parseFloat(v).toFixed(2)}`} higherIsBetter={true} />
                <StatRow label="Today's Change %" valA={dataA.dp} valB={dataB.dp} format={fmtPct} higherIsBetter={true} />
                <StatRow label="Day High" valA={dataA.h} valB={dataB.h} format={fmt$} />
                <StatRow label="Day Low" valA={dataA.l} valB={dataB.l} format={fmt$} />
                <StatRow label="Previous Close" valA={dataA.pc} valB={dataB.pc} format={fmt$} />
                {normA.length > 0 && normB.length > 0 && (
                  <StatRow label="30-Day Return" valA={normA[normA.length-1]?.pct} valB={normB[normB.length-1]?.pct} format={fmtPct} higherIsBetter={true} />
                )}
                <div style={{ fontSize:10, color:C.textMuted, marginTop:12 }}>🟢 Green = better value for that metric</div>
              </div>
            </>
          )}

          {!dataA && !dataB && !loading && (
            <div style={{ textAlign:"center", padding:"60px 0", color:C.textMuted }}>
              <div style={{ fontSize:32, marginBottom:12 }}>⚖️</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:6 }}>Compare any two stocks</div>
              <div style={{ fontSize:12 }}>Enter two ticker symbols above and hit Compare</div>
            </div>
          )}
        </div>
      );
    }

        // ── Supabase client ──────────────────────────────────────────────────────
    const _supabase = window.supabase.createClient("https://vkrwxdtzolvecpfwhoir.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrcnd4ZHR6b2x2ZWNwZndob2lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjYzOTgsImV4cCI6MjA4OTAwMjM5OH0.9yxfmKvvLDaFfLpsX5LYz2oRnTWT08oMmdSXiG8zjY8");

        // ── Auth Screen ──────────────────────────────────────────────────────────
    function AuthScreen({ C, onAuth }) {
      const [mode, setMode] = useState("signin");
      const [email, setEmail] = useState("");
      const [password, setPassword] = useState("");
      const [name, setName] = useState("");
      const [error, setError] = useState("");
      const [loading, setLoading] = useState(false);
      const [verifyMsg, setVerifyMsg] = useState("");

      const handleSubmit = async () => {
        setError(""); setVerifyMsg("");
        if (!email || !password) return setError("Please fill in all fields.");
        if (mode === "signup" && !name) return setError("Please enter your name.");
        if (password.length < 6) return setError("Password must be at least 6 characters.");
        setLoading(true);
        try {
          if (mode === "signup") {
            const { data, error: err } = await _supabase.auth.signUp({
              email, password,
              options: { data: { full_name: name } }
            });
            if (err) throw err;
            setVerifyMsg("Check your email to confirm your account, then sign in!");
            setMode("signin");
          } else {
            const { data, error: err } = await _supabase.auth.signInWithPassword({ email, password });
            if (err) throw err;
            const user = data.user;
            const displayName = user.user_metadata?.full_name || email.split("@")[0];
            onAuth({ email: user.email, name: displayName, id: user.id, isNew: false });
          }
        } catch(e) {
          setError(e.message || "Something went wrong.");
        }
        setLoading(false);
      };

      const inp = { background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, borderRadius:8,
        padding:"11px 14px", color:C.text, fontSize:14, fontFamily:"'DM Sans',sans-serif",
        outline:"none", width:"100%", boxSizing:"border-box", marginBottom:12 };

      return (
        <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif" }}>
          <div style={{ width:400, padding:"40px 36px", background:C.bgCard, borderRadius:20, border:`1px solid ${C.border}` }}>
            <div style={{ textAlign:"center", marginBottom:32 }}>
              <div style={{ fontSize:28, fontWeight:800, letterSpacing:1, marginBottom:4 }}>
                <span style={{ color:C.cyan }}>STOCKR</span><span style={{ color:C.purple, fontSize:18 }}> AI</span>
              </div>
              <div style={{ color:C.textMuted, fontSize:13 }}>Portfolio Intelligence Platform</div>
            </div>

            <div style={{ display:"flex", background:"rgba(255,255,255,0.04)", borderRadius:10, padding:3, marginBottom:24 }}>
              {["signin","signup"].map(m => (
                <button key={m} onClick={()=>{setMode(m);setError("");setVerifyMsg("");}}
                  style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif",
                    background:mode===m?C.cyan:"none", color:mode===m?"#000":C.textMuted, transition:"all 0.2s" }}>
                  {m==="signin"?"Sign In":"Sign Up"}
                </button>
              ))}
            </div>

            {verifyMsg && <div style={{ background:`${C.cyan}15`, border:`1px solid ${C.cyan}40`, borderRadius:8, padding:"10px 14px", color:C.cyan, fontSize:12, marginBottom:14 }}>{verifyMsg}</div>}

            {mode==="signup" && <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" style={inp} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />}
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" type="email" style={inp} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
            <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" style={{...inp, marginBottom:error?8:20}} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />

            {error && <div style={{ color:C.red, fontSize:12, marginBottom:14 }}>{error}</div>}

            <button onClick={handleSubmit} disabled={loading}
              style={{ width:"100%", padding:"12px 0", borderRadius:10, border:"none", cursor:loading?"not-allowed":"pointer",
                background:`linear-gradient(135deg,${C.purple},${C.cyan})`, color:"#fff", fontSize:14, fontWeight:700,
                fontFamily:"'DM Sans',sans-serif", opacity:loading?0.7:1, transition:"opacity 0.2s" }}>
              {loading?"...":(mode==="signin"?"Sign In":"Create Account")}
            </button>

            <div style={{ textAlign:"center", marginTop:20, color:C.textMuted, fontSize:12 }}>
              {mode==="signin"?"Don't have an account? ":"Already have an account? "}
              <span onClick={()=>{setMode(mode==="signin"?"signup":"signin");setError("");setVerifyMsg("");}}
                style={{ color:C.cyan, cursor:"pointer", fontWeight:600 }}>
                {mode==="signin"?"Sign Up":"Sign In"}
              </span>
            </div>
          </div>
        </div>
      );
    }

    function Stocker() {
      const [tab, setTab]                     = useState("portfolio");
      const [time, setTime]                   = useState(new Date());
      const [darkMode, setDarkMode]           = useState(true);
      const [notifications, setNotifications] = useState(true);
      const [showSettings, setShowSettings]   = useState(false);
      const [isLoggedIn, setIsLoggedIn]       = useState(false);
      const [aiUsed, setAiUsed]               = useState(0);
      const [currentUser, setCurrentUser]     = useState(null);
      const [authLoading, setAuthLoading]     = useState(true);

      // Restore Supabase session on load
      useEffect(() => {
        _supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            const u = session.user;
            setCurrentUser({ email: u.email, name: u.user_metadata?.full_name || u.email.split("@")[0], id: u.id });
          }
          setAuthLoading(false);
        });
        const { data: { subscription } } = _supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.user) {
            const u = session.user;
            setCurrentUser({ email: u.email, name: u.user_metadata?.full_name || u.email.split("@")[0], id: u.id });
          } else {
            setCurrentUser(null);
          }
        });
        return () => subscription.unsubscribe();
      }, []);

      // API keys — entered via Settings, persisted to localStorage
      const [anthropicKey, setAnthropicKey]   = useState("server");
      const [finnhubKey, setFinnhubKey]       = useState("server");
      const [newsKey, setNewsKey]             = useState("server");

      useEffect(() => { try { localStorage.setItem("stocker_anthropic_key", anthropicKey); } catch {} }, [anthropicKey]);
      useEffect(() => { try { localStorage.setItem("stocker_finnhub_key", finnhubKey); } catch {} }, [finnhubKey]);
      useEffect(() => { try { localStorage.setItem("stocker_news_key", newsKey); } catch {} }, [newsKey]);

      // Portfolio — loaded from Supabase, persisted on change
      const [portfolio, setPortfolio] = useState([]);

      // Load portfolio from Supabase when user logs in
      useEffect(() => {
        if (!currentUser?.id) return;
        _supabase.from("portfolios").select("holdings").eq("user_id", currentUser.id).single()
          .then(({ data }) => { if (data?.holdings) setPortfolio(data.holdings); });
      }, [currentUser?.id]);

      // Save portfolio to Supabase on every change
      useEffect(() => {
        if (!currentUser?.id) return;
        _supabase.from("portfolios").upsert({ user_id: currentUser.id, holdings: portfolio, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
        try { localStorage.setItem("stocker_portfolio_" + currentUser.id, JSON.stringify(portfolio)); } catch {}
      }, [portfolio]);

      // Persist API keys
      const [_keysLoaded] = useState(() => {
        try {
          const ak = localStorage.getItem("stocker_anthropic_key");
          const fk = localStorage.getItem("stocker_finnhub_key");
          const nk = localStorage.getItem("stocker_news_key");
          if (ak) setTimeout(() => setAnthropicKey(ak), 0);
          if (fk) setTimeout(() => setFinnhubKey(fk), 0);
          if (nk) setTimeout(() => setNewsKey(nk), 0);
        } catch {}
        return true;
      });
      const [loadingPrices, setLoadingPrices] = useState(false);
      const [priceError, setPriceError]       = useState("");

      const [tickerItems, setTickerItems] = useState([]);
      const [newsCount, setNewsCount]     = useState(0);
      const [alertCount, setAlertCount]   = useState(0);

      const C = darkMode ? DARK : LIGHT;

      // Clock
      useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
      }, []);

      // Fetch live prices whenever finnhubKey changes or on demand
      const fetchLivePrices = useCallback(async () => {
        if (!finnhubKey) return;
        setLoadingPrices(true); setPriceError("");
        try {
          setPortfolio(prev => {
            const symbols = prev.map(h => h.symbol);
            Promise.allSettled(symbols.map(s => fetchQuote(s, finnhubKey))).then(quotes => {
              setPortfolio(current => current.map((h, i) => {
                const result = quotes[i];
                if (result && result.status === "fulfilled" && result.value.c > 0) {
                  const q = result.value;
                  return { ...h, price:q.c, change:q.dp||0, live:true };
                }
                return { ...h, live:false };
              }));
              setLoadingPrices(false);
            });
            return prev;
          });
          // Fetch random ticker items via Finnhub - handled by dedicated useEffect below
        } catch(e) {
          setPriceError(`Could not load prices: ${e.message}`);
          setLoadingPrices(false);
        }
      }, [finnhubKey]);

      useEffect(() => { fetchLivePrices(); }, [fetchLivePrices]);

      // Dedicated ticker fetch — random picks, refreshes every 90 seconds
      const fetchTicker = useCallback(async () => {
        if (!finnhubKey) return;
        try {
          // Shuffle pool, always guarantee BTC, pick 9 others randomly
          const pool = [...TICKER_POOL];
          const btc = pool.find(p => p.sym === "BINANCE:BTCUSDT");
          const rest = pool.filter(p => p.sym !== "BINANCE:BTCUSDT").sort(() => Math.random() - 0.5);
          // Occasionally re-insert a random already-seen one at a random position
          const picks = [btc, ...rest.slice(0, 9)];
          const extraIdx = Math.floor(Math.random() * picks.length);
          const extra = rest[Math.floor(Math.random() * rest.length)];
          picks.splice(extraIdx, 0, extra);
          const results = await Promise.allSettled(picks.map(p => fetchQuote(p.sym, finnhubKey)));
          const items = picks.map((p, i) => {
            const r = results[i];
            if (r.status !== "fulfilled" || !r.value || !r.value.c) return null;
            const q = r.value;
            const isCrypto = p.sym.startsWith("BINANCE:");
            const price = isCrypto
              ? "$" + q.c.toLocaleString(undefined, { maximumFractionDigits: 0 })
              : "$" + q.c.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const sign = (q.dp || 0) >= 0 ? "+" : "";
            return { ...p, v: price, c: `${sign}${(q.dp || 0).toFixed(2)}%` };
          }).filter(Boolean);
          if (items.length > 0) setTickerItems(items);
        } catch {}
      }, [finnhubKey]);

      useEffect(() => {
        fetchTicker();
        const t = setInterval(fetchTicker, 90000);
        return () => clearInterval(t);
      }, [fetchTicker]);

      const totalValue = portfolio.reduce((s,h) => s + h.shares*(h.price||0), 0);
      const totalCost  = portfolio.reduce((s,h) => s + h.shares*h.avg, 0);
      const dayGain    = portfolio.reduce((s,h) => s + h.shares*(h.price||0)*(h.change||0)/100, 0);

      const NAV_ITEMS = [
        { id:"portfolio", label:"Portfolio",  icon:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
        { id:"advisor",   label:"AI Advisor", icon:"M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" },
        { id:"news",      label:"News",       icon:"M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z", badge: newsCount||null },
        { id:"search",    label:"Search",     icon:"M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
        { id:"alerts",    label:"Alerts",     icon:"M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9", badge: alertCount||null },
        { id:"compare",   label:"Compare",    icon:"M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
      ];

      // Auth gate
      if (authLoading) {
        return <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ color:C.cyan, fontFamily:"'Space Mono',monospace", fontSize:13 }}>Loading...</div>
        </div>;
      }

      if (!currentUser) {
        return <AuthScreen C={C} onAuth={(user) => setCurrentUser(user)} />;
      }

      const handleSignOut = async () => {
        await _supabase.auth.signOut();
        setCurrentUser(null);
        setPortfolio([]);
      };

      return (
        <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'DM Sans',sans-serif", color:C.text, transition:"background 0.4s, color 0.4s" }}>

          {/* Ambient background */}
          <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0, overflow:"hidden" }}>
            <div style={{ position:"absolute", top:"-20%", left:"-10%", width:700, height:700, borderRadius:"50%", background:`radial-gradient(circle, ${C.cyan}08 0%, transparent 70%)`, animation:"glow 6s ease-in-out infinite" }}/>
            <div style={{ position:"absolute", bottom:"-10%", right:"-5%", width:600, height:600, borderRadius:"50%", background:`radial-gradient(circle, ${C.purple}08 0%, transparent 70%)`, animation:"glow 8s ease-in-out infinite 2s" }}/>

          </div>

          {showSettings && (
            <SettingsPanel C={C} darkMode={darkMode} setDarkMode={setDarkMode} notifications={notifications} setNotifications={setNotifications} onClose={()=>setShowSettings(false)} currentUser={currentUser} onSignOut={handleSignOut}/>
          )}

          {/* ── TOP NAVBAR ── */}
          <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, height:60, borderBottom:`1px solid ${C.border}`, background:darkMode ? "rgba(4,6,15,0.96)" : "rgba(255,255,255,0.97)", backdropFilter:"blur(20px)", display:"flex", alignItems:"stretch" }}>

            {/* Logo zone — hardcoded bg so ticker can NEVER bleed over it */}
            <div style={{ width:220, flexShrink:0, display:"flex", alignItems:"center", paddingLeft:24, position:"relative", zIndex:999, backgroundColor:darkMode?"#04060f":"#ffffff" }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:4, fontFamily:"'DM Mono',monospace", fontWeight:700, letterSpacing:"0.16em" }}>
                <span style={{ fontSize:20, color:C.cyan }}>STOCKR</span>
                <span style={{ fontSize:16, color:C.purple }}>AI</span>
              </div>
            </div>

            {/* Spacer — pushes right controls to far right */}
            <div style={{ flex:1 }}/>

            {/* Right controls — pinned to far right */}
            <div style={{ flexShrink:0, display:"flex", alignItems:"center", gap:10, paddingRight:20, paddingLeft:16, borderLeft:`1px solid ${C.border}` }}>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:15, fontWeight:700, color:C.text, fontFamily:"'DM Mono',monospace" }}>${totalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                <div style={{ fontSize:10, color:dayGain>=0?C.green:C.red }}>{dayGain>=0?"▲":"▼"} ${Math.abs(dayGain).toFixed(2)}</div>
              </div>
              <div style={{ width:1, height:28, background:C.border }}/>
              <button onClick={()=>setDarkMode(d=>!d)} title={darkMode?"Light mode":"Dark mode"} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:C.textMuted, transition:"all 0.2s", fontSize:14 }}>
                {darkMode ? "☀" : "🌙"}
              </button>
              <button onClick={()=>setShowSettings(s=>!s)} title="Settings" style={{ background:showSettings?`${C.cyan}20`:"none", border:`1px solid ${showSettings?C.cyan+"60":C.border}`, borderRadius:8, width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", transition:"all 0.2s" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={showSettings?C.cyan:C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
              </button>
            </div>
          </nav>

          {/* ── TICKER BAR — below navbar, full width, isolated ── */}
          <div style={{ position:"fixed", top:60, left:0, right:0, zIndex:99, height:36, borderBottom:`1px solid ${C.border}`, backgroundColor:darkMode?"#04060f":"#ffffff", overflow:"hidden", display:"flex", alignItems:"center" }}>
            {(() => {
              const placeholders = !finnhubKey ? TICKER_POOL.slice(0,12).map(p => ({ ...p, v:"—", c:"—" })) : [];
              const display = tickerItems.length ? tickerItems : placeholders;
              return (
                <div style={{ display:"flex", gap:0, animation: display.length ? "tickerScroll 40s linear infinite" : "none", width:"max-content", flexShrink:0 }}>
                  {[...display, ...display].map((m, i) => (
                    <div key={i} style={{ flexShrink:0, padding:"0 24px", display:"flex", gap:10, alignItems:"center", borderRight:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:10, color:C.textMuted, fontWeight:600, fontFamily:"'DM Mono',monospace", letterSpacing:"0.05em" }}>{m.l}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:C.text, fontFamily:"'DM Mono',monospace" }}>{m.v}</span>
                      <span style={{ fontSize:10, fontWeight:600, color:!m.c||m.c==="—"?C.textMuted:m.c.startsWith("+")?C.green:C.red }}>{m.c||"—"}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* ── MAIN BODY (below navbar + ticker) ── */}
          <div style={{ display:"flex", paddingTop:96, minHeight:"100vh", position:"relative", zIndex:1 }}>

            {/* ── LEFT SIDEBAR ── */}
            <aside style={{ width:220, flexShrink:0, position:"fixed", top:96, bottom:0, left:0, borderRight:`1px solid ${C.border}`, background:darkMode ? "rgba(4,6,15,0.98)" : "rgba(255,255,255,0.98)", backdropFilter:"blur(10px)", display:"flex", flexDirection:"column", padding:"24px 12px", overflowY:"auto" }}>

              {/* Portfolio summary card */}
              <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", marginBottom:24, position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${C.cyan},${C.purple})` }}/>
                <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.12em", marginBottom:6 }}>TOTAL VALUE</div>
                <div style={{ fontSize:22, fontWeight:700, color:C.text, fontFamily:"'DM Mono',monospace", letterSpacing:"-0.02em" }}>${totalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                <div style={{ fontSize:11, color:dayGain>=0?C.green:C.red, marginTop:4 }}>{dayGain>=0?"▲":"▼"} ${Math.abs(dayGain).toFixed(2)} today</div>
                <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10 }}>
                    <span style={{ color:C.textMuted }}>Holdings</span>
                    <span style={{ color:C.text, fontFamily:"'DM Mono',monospace" }}>{portfolio.length}</span>
                  </div>
                </div>
              </div>

              {/* Nav items */}
              <nav style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {NAV_ITEMS.map(item => (
                  <button key={item.id} onClick={()=>setTab(item.id)} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, background:tab===item.id?`linear-gradient(135deg,${C.cyan}18,${C.purple}12)`:"none", border:`1px solid ${tab===item.id?C.cyan+"40":"transparent"}`, color:tab===item.id?C.cyan:C.textMuted, fontFamily:"'DM Sans',sans-serif", fontWeight:tab===item.id?600:400, fontSize:13, cursor:"pointer", transition:"all 0.2s", textAlign:"left", position:"relative" }}
                    onMouseEnter={e=>{ if(tab!==item.id){ e.currentTarget.style.background=C.bgCard; e.currentTarget.style.color=C.text; }}}
                    onMouseLeave={e=>{ if(tab!==item.id){ e.currentTarget.style.background="none"; e.currentTarget.style.color=C.textMuted; }}}>
                    {tab===item.id && <span style={{ position:"absolute", left:0, top:"20%", bottom:"20%", width:3, background:C.cyan, borderRadius:"0 2px 2px 0", boxShadow:`0 0 8px ${C.cyan}` }}/>}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={item.icon}/>
                    </svg>
                    {item.label}
                    {item.badge && <span style={{ marginLeft:"auto", background:item.id==="alerts"?C.red:C.purple, color:"#fff", fontSize:9, padding:"1px 6px", borderRadius:10, fontWeight:700, boxShadow:item.id==="alerts"?`0 0 6px ${C.red}88`:"none" }}>{item.badge}</span>}
                  </button>
                ))}
              </nav>

              {/* Bottom of sidebar */}
              <div style={{ marginTop:"auto", paddingTop:20, borderTop:`1px solid ${C.border}` }}>
                <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.1em", marginBottom:8 }}>YOUR AI COMPANION</div>
                <div style={{ fontSize:10, color:C.textMuted, lineHeight:1.5 }}>Stockr AI analyzes your portfolio in real-time using live market data.</div>
              </div>
            </aside>

            {/* ── MAIN CONTENT ── */}
            <main style={{ flex:1, marginLeft:220, padding:"32px 40px", minHeight:"calc(100vh - 60px)", maxWidth:"calc(100vw - 220px)" }}>
              <div key={tab} style={{ animation:"fadeIn 0.2s both", maxWidth:1100 }}>
                {tab==="portfolio" && <PortfolioTab C={C} portfolio={portfolio} setPortfolio={setPortfolio} loadingPrices={loadingPrices} priceError={priceError} onRefresh={fetchLivePrices} finnhubKey={finnhubKey}/>}
                {tab==="advisor"   && <AIAdvisorTab C={C} aiUsed={aiUsed} setAiUsed={setAiUsed} anthropicKey={anthropicKey} portfolio={portfolio}/>}
                {tab==="news"      && <NewsTab C={C} newsKey={newsKey} finnhubKey={finnhubKey} portfolio={portfolio} onArticleCount={setNewsCount}/>}
                {tab==="search"    && <SearchTab C={C} finnhubKey={finnhubKey} portfolio={portfolio} setPortfolio={setPortfolio}/>}
                {tab==="alerts"    && <AlertsTab C={C} finnhubKey={finnhubKey} portfolio={portfolio} onAlertCount={setAlertCount}/>}
                {tab==="compare"   && <CompareTab C={C} finnhubKey={finnhubKey} portfolio={portfolio}/>}
              </div>
            </main>
          </div>
        </div>
      );
    }

    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(<Stocker/>);