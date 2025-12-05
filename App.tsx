import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Sparkles, 
  Hand, 
  Eye, 
  Loader2, 
  Flame,
  Droplets,
  Mountain,
  Wind,
  Plus,
  Scan
} from 'lucide-react';
import FluidCanvas from './components/FluidCanvas';
import HandTracker from './components/HandTracker';
import { decipherElement, mixFluids } from './services/geminiService';
import { FluidConfig, HandData, AlchemyElement } from './types';

// Predefined Elements in the "Pool"
// Positioned on the Left (X: 0.1)
const ELEMENTS_POOL: AlchemyElement[] = [
  { id: 'fire', name: 'Ignis', color: '#ef4444', icon: <Flame className="w-5 h-5" />, x: 0.1, y: 0.3 },
  { id: 'water', name: 'Aqua', color: '#3b82f6', icon: <Droplets className="w-5 h-5" />, x: 0.1, y: 0.45 },
  { id: 'earth', name: 'Terra', color: '#22c55e', icon: <Mountain className="w-5 h-5" />, x: 0.1, y: 0.6 },
  { id: 'air', name: 'Aer', color: '#a8a29e', icon: <Wind className="w-5 h-5" />, x: 0.1, y: 0.75 },
];

const INITIAL_FLUID: FluidConfig = {
  name: "Pure Water",
  description: "A calm, clear pool of digital essence.",
  baseColor: "#0ea5e9", // Sky Blue
  highlightColor: "#e0f2fe", // Pale Blue
  particleSize: 1.8,
  viscosity: 0.5, // Watery
  forceStrength: 2.0,
  flowSpeed: 0.2,
  chaos: 0.2,
  glow: 1.0
};

export default function App() {
  const [config, setConfig] = useState<FluidConfig>(INITIAL_FLUID);
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isHandDetected, setIsHandDetected] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  
  // Alchemy State
  const [draggedElement, setDraggedElement] = useState<AlchemyElement | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [isMixing, setIsMixing] = useState(false);
  const [reactionIntensity, setReactionIntensity] = useState(0); // 0 to 1 for shader

  // Refs
  const handRef = useRef<HandData>({ x: 0.5, y: 0.5, z: 0, isPinching: false, pinchStrength: 0, active: false });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- INTERACTION LOOP ---
  // Using interval for non-visual logic to keep React fast
  useEffect(() => {
    const loop = setInterval(() => {
      const hand = handRef.current;
      
      // Update Detection State for UI
      if (hand.active !== isHandDetected) {
        setIsHandDetected(hand.active);
      }

      if (!hand.active) return;

      // 1. COLLISION CHECK (Hand vs Element Pool)
      let foundHover: string | null = null;
      
      // We only check pool collision if we aren't already dragging something
      if (!draggedElement) {
        for (const el of ELEMENTS_POOL) {
          // Hand positions are 0-1. 
          const dist = Math.sqrt(Math.pow(hand.x - el.x, 2) + Math.pow(hand.y - el.y, 2));
          
          if (dist < 0.06) { // ~6% screen width hit box
            foundHover = el.id;
            
            // GRAB TRIGGER (Pinch Strength > 0.8)
            if (hand.pinchStrength > 0.8) {
               setDraggedElement(el);
            }
            break;
          }
        }
      }
      setHoveredElementId(foundHover);

      // 2. DROP CHECK (If Dragging)
      if (draggedElement) {
        // If pinch released
        if (hand.pinchStrength < 0.5) {
          // Check if released in center (The Cauldron)
          const distToCenter = Math.sqrt(Math.pow(hand.x - 0.5, 2) + Math.pow(hand.y - 0.5, 2));
          
          if (distToCenter < 0.3) {
             // MIX!
             triggerMixing(draggedElement);
          }
          
          setDraggedElement(null);
        }
      }

    }, 30); // ~30fps logic check

    return () => clearInterval(loop);
  }, [draggedElement, config, isHandDetected]); // Deps

  const triggerMixing = async (element: AlchemyElement) => {
    if (isMixing) return;
    setIsMixing(true);

    // 1. VISUAL REACTION (Immediate)
    setReactionIntensity(1.0); // Trigger shader boiling
    
    // 2. GEMINI CALCULATION
    try {
      const newConfig = await mixFluids(config, element.name);
      
      // 3. APPLY RESULT
      setConfig(newConfig);
      
      // 4. COOLDOWN
      // Fade out reaction slowly
      const fadeOut = setInterval(() => {
        setReactionIntensity(prev => {
          if (prev <= 0.05) {
            clearInterval(fadeOut);
            setIsMixing(false);
            return 0;
          }
          return prev * 0.9;
        });
      }, 50);

    } catch (e) {
      setIsMixing(false);
      setReactionIntensity(0);
    }
  };

  const handleHandUpdate = useCallback((data: HandData) => {
    handRef.current = data;
  }, []);

  const handleScry = async () => {
    if (!canvasRef.current) return;
    setLoading(true);
    setAiAnalysis("Scrying the vapors...");
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const analysis = await decipherElement(dataUrl);
      setAiAnalysis(analysis);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden text-white font-sans selection:bg-purple-500/30 cursor-none">
      
      {/* 3D Scene */}
      <FluidCanvas 
        handRef={handRef} 
        config={config} 
        reactionState={reactionIntensity}
        onCanvasCreated={(el) => canvasRef.current = el} 
      />

      {/* Hand Tracker Logic */}
      <HandTracker 
        onHandUpdate={handleHandUpdate} 
        onCameraReady={() => setCameraActive(true)}
      />

      {/* --- UI LAYOUT --- */}

      {/* 1. ELEMENT POOL (Left) */}
      <div className="absolute inset-0 pointer-events-none z-30">
        {ELEMENTS_POOL.map((el) => {
          const isHovered = hoveredElementId === el.id;
          const isHidden = draggedElement?.id === el.id; // Hide original if dragging
          
          return (
            <div 
              key={el.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 flex items-center gap-3 ${isHidden ? 'opacity-0' : 'opacity-100'}`}
              style={{ left: `${el.x * 100}%`, top: `${el.y * 100}%` }}
            >
              {/* Orb */}
              <div 
                className={`
                  w-14 h-14 rounded-full border flex items-center justify-center backdrop-blur-md transition-all duration-500
                  ${isHovered 
                    ? 'scale-125 border-white bg-white/20 shadow-[0_0_30px_rgba(255,255,255,0.4)]' 
                    : 'border-white/10 bg-black/20 scale-100'
                  }
                `}
                style={{ borderColor: isHovered ? el.color : 'rgba(255,255,255,0.1)' }}
              >
                <div style={{ color: el.color }} className={isHovered ? 'animate-pulse' : ''}>
                  {el.icon}
                </div>
              </div>
              
              {/* Label (Only on hover) */}
              <span className={`text-[10px] uppercase tracking-widest font-bold transition-all duration-300 ${isHovered ? 'opacity-100 translate-x-2' : 'opacity-0 -translate-x-2'}`}>
                {el.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* 2. DRAGGED ELEMENT (Attached to Cursor) */}
      {draggedElement && (
        <div 
          className="absolute z-50 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
          style={{ 
            left: `${handRef.current.x * 100}%`, 
            top: `${handRef.current.y * 100}%` 
          }}
        >
          <div className="relative">
             <div className="w-20 h-20 rounded-full blur-xl opacity-60 animate-pulse absolute inset-0" style={{ backgroundColor: draggedElement.color }} />
             <div className="w-16 h-16 rounded-full border-2 border-white bg-black/40 flex items-center justify-center relative z-10">
               <div className="text-white drop-shadow-md">{draggedElement.icon}</div>
             </div>
          </div>
        </div>
      )}

      {/* 3. CAULDRON TARGET (Center Hint) */}
      {draggedElement && (
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 transition-all duration-500 animate-pulse">
            <div className="w-64 h-64 border border-dashed border-white/20 rounded-full flex items-center justify-center bg-white/5">
                <span className="text-xs uppercase tracking-[0.3em] text-white/40">Release to Mix</span>
            </div>
         </div>
      )}

      {/* 4. INFO HUD (Top Left) */}
      <div className="absolute top-8 left-8 z-20 pointer-events-none opacity-80">
        <h1 className="text-4xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-500">
          ALCHEMY
        </h1>
        <div className="mt-4 pl-1 border-l-2 border-white/20">
           <div className="ml-3">
             <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Current Matter</div>
             <div className="text-xl font-serif italic text-white">{config.name}</div>
             {config.description && (
               <p className="text-xs text-slate-500 mt-2 max-w-[200px] leading-relaxed">
                 {config.description}
               </p>
             )}
           </div>
        </div>
      </div>

      {/* 5. CONTROLS (Bottom) */}
      <div className="absolute bottom-8 left-0 w-full flex flex-col items-center gap-4 z-40 pointer-events-auto">
         {/* Scry Button */}
         <button 
           onClick={handleScry}
           disabled={loading}
           className="group flex items-center gap-3 px-8 py-4 bg-slate-900/60 hover:bg-slate-800/80 border border-white/10 rounded-full backdrop-blur-xl transition-all active:scale-95"
         >
           {loading ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Eye className="w-5 h-5 text-sky-300 group-hover:text-white transition-colors" />}
           <span className="text-xs uppercase tracking-[0.2em] font-medium text-slate-300 group-hover:text-white">Scry Essence</span>
         </button>
      </div>

      {/* 6. AI ANALYSIS POPUP (Right) */}
      {aiAnalysis && (
        <div className="absolute top-1/2 right-12 -translate-y-1/2 w-80 p-8 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 animate-in slide-in-from-right duration-500">
          <div className="absolute -top-3 -left-3">
             <div className="bg-purple-500 p-2 rounded-lg shadow-lg">
                <Sparkles className="w-4 h-4 text-white" />
             </div>
          </div>
          <p className="text-base font-serif italic text-slate-200 leading-relaxed">
            "{aiAnalysis}"
          </p>
          <button 
            onClick={() => setAiAnalysis(null)} 
            className="mt-6 text-[10px] uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
          >
            Close Vision
          </button>
        </div>
      )}

      {/* 7. LOADING SCREEN / HAND PROMPT */}
      {!cameraActive ? (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center">
           <div className="relative">
             <div className="absolute inset-0 bg-purple-500 blur-xl opacity-20 animate-pulse" />
             <Loader2 className="w-10 h-10 text-white animate-spin relative z-10" />
           </div>
           <span className="mt-6 text-xs uppercase tracking-[0.3em] text-white/40">Initializing Vision System</span>
        </div>
      ) : !isHandDetected && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center animate-pulse pointer-events-none">
           <Scan className="w-12 h-12 text-white/20 mb-2" />
           <span className="text-[10px] uppercase tracking-[0.2em] text-white/30">Raise Hand to Interact</span>
        </div>
      )}
      
    </div>
  );
}