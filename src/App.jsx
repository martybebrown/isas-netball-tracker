import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Square, Plus, Trash2, BarChart2, CheckCircle, Clock, Save, 
  Maximize, Minimize, Settings, X, ChevronUp, ChevronDown, ChevronLeft, 
  ChevronRight, Pencil, Trophy, Activity, Cloud, Loader2, AlertCircle, 
  Calendar, Target, ClipboardList, History, Dumbbell, Layers, FastForward, 
  GripVertical, RefreshCcw, Database, Info, LayoutGrid, List, FileText 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, setDoc, writeBatch } from 'firebase/firestore';

// --- Constants & Config ---
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Restructured Activities
const CATEGORIES = ["Match", "Club Training", "Self Training"];

// Drills are a subset of Self Training
const DEFAULT_DRILLS = [
  { id: 1, name: "Circle Shooting", defaultTime: 15, category: "Self Training" },
  { id: 2, name: "Wall Ball Rebounds", defaultTime: 10, category: "Self Training" },
  { id: 3, name: "Agility Shuttles", defaultTime: 15, category: "Self Training" },
  { id: 4, name: "Post-Up Drills", defaultTime: 10, category: "Self Training" },
  { id: 5, name: "Footwork Patterns", defaultTime: 20, category: "Self Training" }
];

const CATEGORY_COLORS = {
  "Match": "bg-amber-500",
  "Club Training": "bg-indigo-500",
  "Self Training": "bg-cyan-500"
};

const CATEGORY_TEXT_COLORS = {
  "Match": "text-amber-600",
  "Club Training": "text-indigo-600",
  "Self Training": "text-cyan-600"
};

// --- Firebase Init ---
let app, auth, db;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'netball-isa-v1';

try {
  let firebaseConfig = null;
  if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
  } else if (import.meta.env.VITE_FIREBASE_API_KEY) {
    firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };
  }
  if (firebaseConfig) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (error) { console.error("Firebase init failed:", error); }

// --- Sound & Wake Lock ---
const useWakeLock = (isActive) => {
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isActive) {
        try { wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
      }
    };
    if (isActive) requestWakeLock();
    return () => { if (wakeLock) wakeLock.release(); };
  }, [isActive]);
};

const playRefereeWhistle = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.frequency.setValueAtTime(2500, now);
    osc2.frequency.setValueAtTime(2300, now); 
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    mod.frequency.value = 35; 
    modGain.gain.value = 500; 
    mod.connect(modGain);
    modGain.connect(osc1.frequency);
    modGain.connect(osc2.frequency);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.6, now + 0.1); 
    gain.gain.setValueAtTime(0.6, now + 2.5); 
    gain.gain.linearRampToValueAtTime(0, now + 3.0); 
    osc1.start(now); osc2.start(now); mod.start(now);
    osc1.stop(now + 3.0); osc2.stop(now + 3.0); mod.stop(now + 3.0);
    setTimeout(() => ctx.close(), 3500);
  } catch (e) {}
};

// --- Helper Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled, ...props }) => {
  const baseStyle = "px-6 py-3 rounded-xl font-bold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 touch-manipulation transform active:scale-95 text-xs disabled:opacity-50 disabled:active:scale-100";
  const variants = {
    primary: "bg-cyan-600 hover:bg-cyan-700 text-white shadow-md shadow-cyan-100",
    secondary: "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm",
    danger: "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100",
    ghost: "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
    icon: "p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors"
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Card = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-white border border-slate-200 rounded-2xl p-6 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md hover:border-cyan-200 transition-all' : ''} ${className}`}>
    {children}
  </div>
);

const GoalRing = ({ percent }) => {
  const radius = 30;
  const stroke = 6;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(percent, 100) / 100) * circumference;
  return (
    <div className="relative flex items-center justify-center">
      <svg height={radius * 2} width={radius * 2} className="rotate-[-90deg]">
        <circle stroke="currentColor" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} className="text-slate-100" />
        <circle
          stroke="currentColor" fill="transparent" strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease-in-out' }}
          strokeLinecap="round" r={normalizedRadius} cx={radius} cy={radius}
          className={percent >= 100 ? 'text-emerald-500' : 'text-cyan-500'}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
         <span className="text-[10px] font-bold text-slate-700">{Math.round(percent)}%</span>
      </div>
    </div>
  );
};

// --- Modals ---

const ManualEntryModal = ({ title, initialDuration, onSave, onClose }) => {
  const [duration, setDuration] = useState(initialDuration);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-sm rounded-3xl shadow-2xl p-8">
        <h3 className="font-bold text-xl text-slate-900 mb-6">{title}</h3>
        <div className="mb-8">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Duration (Minutes)</label>
          <input 
            type="number" value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 text-3xl font-bold focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 focus:outline-none transition-all"
            autoFocus
          />
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(duration); onClose(); }}>Confirm</Button>
        </div>
      </div>
    </div>
  );
};

const EditGoalModal = ({ currentGoal, currentCategories, onSave, onClose }) => {
  const [goal, setGoal] = useState(currentGoal);
  const [selectedCategories, setSelectedCategories] = useState(currentCategories || ["Self Training"]);

  const toggleCategory = (cat) => {
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-sm rounded-3xl shadow-2xl p-8">
        <h3 className="font-bold text-xl text-slate-900 mb-6">Edit Targets</h3>
        <div className="space-y-6 mb-8">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Weekly Goal (Hours)</label>
            <input type="number" step="0.5" value={goal} onChange={(e) => setGoal(parseFloat(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:border-cyan-500" />
          </div>
          <div className="pt-4 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-3">Count in Progress:</label>
            <div className="space-y-2">
              {CATEGORIES.map(cat => (
                <label key={cat} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
                  <input type="checkbox" checked={selectedCategories.includes(cat)} onChange={() => toggleCategory(cat)} className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500" />
                  <span className={`text-sm font-bold ${selectedCategories.includes(cat) ? 'text-slate-900' : 'text-slate-400'}`}>{cat}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(goal, selectedCategories); onClose(); }}>Save</Button>
        </div>
      </div>
    </div>
  );
};

// --- Stats Page Logic ---

const CalendarHeatmap = ({ logs }) => {
  const gridStartDate = new Date('2026-01-01');
  const logMap = logs.reduce((acc, log) => {
    const dStr = new Date(log.date).toDateString();
    if (!acc[dStr]) acc[dStr] = { total: 0, activities: {} };
    acc[dStr].total += log.duration;
    return acc;
  }, {});

  return (
    <Card className="overflow-hidden">
      <h3 className="font-bold text-slate-900 uppercase tracking-wider text-xs mb-6 flex items-center gap-2"><Calendar size={16} className="text-cyan-600" /> Consistency</h3>
      <div className="flex gap-1 overflow-x-auto pb-4">
        {Array.from({ length: 52 }).map((_, wIdx) => (
          <div key={wIdx} className="flex flex-col gap-1">
            {Array.from({ length: 7 }).map((_, dIdx) => {
              const d = new Date(gridStartDate);
              d.setDate(gridStartDate.getDate() + (wIdx * 7 + dIdx));
              const data = logMap[d.toDateString()];
              const opacity = data ? Math.min(0.2 + (data.total / 120), 1) : 0;
              return <div key={dIdx} className="w-3.5 h-3.5 rounded-[3px] bg-slate-100 relative">{data && <div className="absolute inset-0 bg-cyan-600 rounded-[3px]" style={{ opacity }} />}</div>;
            })}
          </div>
        ))}
      </div>
    </Card>
  );
};

const StatsDashboard = ({ logs, weeklyGoal, goalCategories, setWeeklyGoal }) => {
  const [viewType, setViewType] = useState('weekly');
  const [dateOffset, setDateOffset] = useState(0);
  const [showGoalModal, setShowGoalModal] = useState(false);

  const totalMins = logs.reduce((acc, l) => acc + l.duration, 0);
  const goalMins = logs.filter(l => goalCategories.includes(l.category)).reduce((acc, l) => acc + l.duration, 0);
  const goalPercent = Math.min((goalMins / (weeklyGoal * 60)) * 100, 100);

  // Stacked Bar Data
  const chartBuckets = WEEK_DAYS.map((day, i) => {
    const bucketLogs = logs.filter(l => (new Date(l.date).getDay() + 6) % 7 === i);
    const activities = {};
    bucketLogs.forEach(l => activities[l.category] = (activities[l.category] || 0) + l.duration);
    return { label: day, total: bucketLogs.reduce((acc, l) => acc + l.duration, 0), activities };
  });

  const ceiling = Math.max(Math.max(...chartBuckets.map(b => b.total)), 60);

  return (
    <div className="space-y-6">
      {showGoalModal && <EditGoalModal currentGoal={weeklyGoal} currentCategories={goalCategories} onSave={setWeeklyGoal} onClose={() => setShowGoalModal(false)} />}
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card onClick={() => setShowGoalModal(true)} className="flex flex-col items-center py-6 text-center">
          <GoalRing percent={goalPercent} />
          <div className="text-[10px] font-bold text-slate-400 uppercase mt-4">Goal: {weeklyGoal}h</div>
        </Card>
        <Card className="flex flex-col justify-center bg-cyan-600 text-white border-0 py-6 px-6 shadow-lg shadow-cyan-100">
          <div className="text-[10px] font-bold text-cyan-100 uppercase mb-1">Total Time</div>
          <div className="text-3xl font-black">{(totalMins / 60).toFixed(1)}h</div>
        </Card>
        <Card className="flex flex-col justify-center items-center py-6">
          <Trophy size={28} className="text-amber-500 mb-2" />
          <div className="text-2xl font-black text-slate-900">{logs.length}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase">Sessions</div>
        </Card>
        <Card className="flex flex-col justify-center items-center py-6">
          <Activity size={28} className="text-indigo-500 mb-2" />
          <div className="text-2xl font-black text-slate-900">{(goalMins / 60).toFixed(1)}h</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase">Target Work</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-xs font-bold text-slate-900 mb-6 uppercase tracking-wider flex items-center gap-2"><BarChart2 size={16} className="text-cyan-600" /> Weekly Split</h3>
          <div className="h-48 flex items-end justify-between px-2 gap-2">
            {chartBuckets.map((bucket, i) => (
              <div key={i} className="flex-1 h-full flex flex-col justify-end group relative">
                <div className="w-full bg-slate-50 rounded-t-lg overflow-hidden flex flex-col-reverse h-full border border-slate-100">
                  {Object.entries(bucket.activities).map(([cat, dur]) => (
                    <div key={cat} style={{ height: `${(dur / ceiling) * 100}%` }} className={`${CATEGORY_COLORS[cat]} border-t border-white/20`} />
                  ))}
                </div>
                <span className="text-[9px] font-bold text-slate-400 mt-2 text-center uppercase">{bucket.label[0]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-xs font-bold text-slate-900 mb-6 uppercase tracking-wider flex items-center gap-2"><Clock size={16} className="text-cyan-600" /> Category Breakdown</h3>
          <div className="space-y-4">
            {CATEGORIES.map(cat => {
              const dur = logs.filter(l => l.category === cat).reduce((acc, l) => acc + l.duration, 0);
              return (
                <div key={cat}>
                  <div className="flex justify-between text-[10px] font-bold mb-1 uppercase text-slate-500"><span>{cat}</span><span>{(dur/60).toFixed(1)}h</span></div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${CATEGORY_COLORS[cat]}`} style={{ width: `${Math.min((dur / (totalMins || 1)) * 100, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <CalendarHeatmap logs={logs} />
    </div>
  );
};

// --- Runthrough Logic ---

const RunthroughSetupModal = ({ drills, onStart, onClose }) => {
  const [queue, setQueue] = useState(drills);
  const [rest, setRest] = useState(30);
  const move = (idx, dir) => {
    const n = [...queue]; const item = n.splice(idx, 1)[0];
    n.splice(idx + dir, 0, item); setQueue(n);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0">
          <h3 className="font-bold text-xl text-slate-900 flex items-center gap-3"><Layers className="text-cyan-600" /> Runthrough</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 rounded-full"><X size={24} /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Rest Period (Seconds)</label>
            <input type="number" value={rest} onChange={e => setRest(parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold" />
          </div>
          {queue.map((d, i) => (
            <div key={i} className="flex items-center gap-4 bg-white border border-slate-100 p-4 rounded-2xl shadow-sm">
              <span className="text-slate-300 font-black italic">{i+1}</span>
              <div className="flex-1">
                <div className="font-bold text-slate-900">{d.name}</div>
                <div className="text-xs text-slate-400">{d.defaultTime}m • {d.category}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => move(i, -1)} disabled={i===0} className="p-2 text-slate-300 hover:text-cyan-600"><ChevronUp size={20}/></button>
                <button onClick={() => move(i, 1)} disabled={i===queue.length-1} className="p-2 text-slate-300 hover:text-cyan-600"><ChevronDown size={20}/></button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-6 bg-white border-t border-slate-100">
          <Button onClick={() => onStart(queue, rest)} className="w-full py-4 text-lg">Start Session</Button>
        </div>
      </div>
    </div>
  );
};

const RunthroughTimer = ({ queue, rest, onCompleteLog, onExit }) => {
  const [idx, setIdx] = useState(0);
  const [isRest, setIsRest] = useState(false);
  const [timeLeft, setTimeLeft] = useState(queue[0].defaultTime * 60);
  const [isActive, setIsActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useWakeLock(isActive);
  const current = queue[idx];

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && isActive) {
      playRefereeWhistle();
      if (!isRest && idx < queue.length - 1) {
        onCompleteLog(current, current.defaultTime);
        setIsRest(true); setTimeLeft(rest);
      } else if (isRest) {
        setIsRest(false); setIdx(prev => prev + 1); setTimeLeft(queue[idx+1].defaultTime * 60);
      } else {
        onCompleteLog(current, current.defaultTime); onExit();
      }
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, isRest, idx]);

  const format = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-12 transition-colors ${isRest ? 'bg-indigo-50' : 'bg-white'}`}>
      <div className="w-full flex justify-between items-center max-w-4xl">
        <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-4 bg-slate-100 rounded-full text-slate-400"><Maximize size={24}/></button>
        <div className="text-center">
           <div className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Progress</div>
           <div className="text-sm font-bold text-slate-900">{idx + 1} / {queue.length}</div>
        </div>
        <button onClick={onExit} className="p-4 bg-slate-100 rounded-full text-slate-400 hover:text-red-500"><X size={24}/></button>
      </div>
      <div className="text-center">
        <div className={`text-xs font-black uppercase tracking-[0.3em] mb-4 py-1 px-4 rounded-full inline-block ${isRest ? 'bg-indigo-600 text-white' : 'bg-cyan-100 text-cyan-600'}`}>
          {isRest ? 'Recover' : 'Work'}
        </div>
        <h2 className="text-5xl md:text-7xl font-black text-slate-900 italic uppercase tracking-tighter">{isRest ? 'Breathe' : current.name}</h2>
        <div className={`text-[25vw] font-black leading-none tabular-nums tracking-tighter ${timeLeft <= 10 && !isRest ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>{format(timeLeft)}</div>
      </div>
      <button onClick={() => setIsActive(!isActive)} className={`w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all ${isActive ? 'bg-slate-100 text-slate-400' : 'bg-cyan-600 text-white'}`}>
        {isActive ? <Pause size={48} fill="currentColor" /> : <Play size={48} fill="currentColor" className="ml-2" />}
      </button>
    </div>
  );
};

// --- App Container ---

export default function App() {
  const [view, setView] = useState('drills'); 
  const [activeDrill, setActiveDrill] = useState(null);
  const [drills, setDrills] = useState(DEFAULT_DRILLS);
  const [logs, setLogs] = useState([]);
  const [weeklyGoal, setWeeklyGoal] = useState(6);
  const [goalCategories, setGoalCategories] = useState(["Self Training", "Club Training"]);
  const [user, setUser] = useState(null);
  const [manualEntryData, setManualEntryData] = useState(null); 
  const [showRunthroughSetup, setShowRunthroughSetup] = useState(false);
  const [runthroughActive, setRunthroughActive] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    if (auth) {
      const initAuth = async () => {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      };
      initAuth();
      const unsubscribe = onAuthStateChanged(auth, setUser);
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (user && db) {
      const q = collection(db, 'artifacts', appId, 'public', 'data', 'logs');
      const unsubscribe = onSnapshot(q, s => setLogs(s.docs.map(doc => ({ ...doc.data(), id: doc.id }))));
      return () => unsubscribe();
    }
  }, [user]);

  const saveLog = async (log) => {
    if (user && db) await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'logs'), log);
    else setLogs(p => [...p, {...log, id: Date.now().toString()}]);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20 selection:bg-cyan-100 selection:text-cyan-900">
      {/* Navbar */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 h-20 shadow-sm px-4">
        <div className="max-w-4xl mx-auto h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-100">I</div>
            <h1 className="font-black text-lg uppercase tracking-tighter italic hidden sm:block">Isa's Tracker</h1>
          </div>
          <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
            {['drills', 'activities', 'stats'].map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-4 md:px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{v}</button>
            ))}
          </div>
          <button onClick={() => setShowHistoryModal(true)} className="p-3 bg-slate-100 rounded-xl text-slate-500 hover:text-slate-900"><History size={20}/></button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto p-6 md:p-8">
        {manualEntryData && <ManualEntryModal title={manualEntryData.title} initialDuration={manualEntryData.dur} onSave={(dur) => saveLog({ date: new Date().toISOString(), drillName: manualEntryData.name, category: manualEntryData.category, duration: dur, createdAt: Date.now() })} onClose={() => setManualEntryData(null)} />}
        {showRunthroughSetup && <RunthroughSetupModal drills={drills} onStart={(q, r) => { setRunthroughActive({q, r}); setShowRunthroughSetup(false); }} onClose={() => setShowRunthroughSetup(false)} />}
        {runthroughActive && <RunthroughTimer queue={runthroughActive.q} rest={runthroughActive.r} onCompleteLog={saveLog} onExit={() => setRunthroughActive(null)} />}
        {showHistoryModal && <FullHistoryModal logs={logs} onClose={() => setShowHistoryModal(false)} onUpdateLog={() => {}} onDeleteLog={() => {}} />}
        
        {view === 'stats' && <StatsDashboard logs={logs} weeklyGoal={weeklyGoal} goalCategories={goalCategories} setWeeklyGoal={(g, c) => { setWeeklyGoal(g); setGoalCategories(c); }} />}

        {view === 'activities' && (
          <div className="space-y-12 animate-in fade-in duration-500">
             <section>
                <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] mb-6 text-center">Standard Sessions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {CATEGORIES.map(cat => (
                    <Card key={cat} onClick={() => setManualEntryData({title: `Log ${cat}`, category: cat, name: cat, dur: cat === "Self Training" ? 30 : 90})} className="flex flex-col items-center py-10 gap-4 hover:border-cyan-300">
                      <div className="p-4 rounded-2xl bg-slate-50"><Target className={CATEGORY_TEXT_COLORS[cat]} size={32}/></div>
                      <span className="font-bold text-slate-900 text-xs uppercase tracking-widest">{cat}</span>
                    </Card>
                  ))}
                </div>
             </section>
          </div>
        )}

        {view === 'drills' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">Self Training Drills</h2>
              <Button variant="secondary" onClick={() => setShowRunthroughSetup(true)} className="rounded-2xl"><Layers size={16}/> Runthrough</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {drills.map(drill => (
                <Card key={drill.id} className="group relative border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-lg overflow-hidden border-b-2 border-transparent hover:border-cyan-500 transition-all">
                  <div className="flex flex-col h-full">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-2">{drill.category}</span>
                    <h3 className="text-xl font-black text-slate-900 uppercase italic leading-tight mb-4">{drill.name}</h3>
                    <div className="text-4xl font-black text-slate-200 group-hover:text-slate-300 mb-6">{drill.defaultTime}<span className="text-xs italic uppercase">m</span></div>
                    <div className="flex gap-2 mt-auto">
                      <Button onClick={() => setActiveDrill(drill)} className="flex-1 rounded-2xl">Start</Button>
                      <button onClick={() => saveLog({ date: new Date().toISOString(), drillName: drill.name, category: drill.category, duration: drill.defaultTime, createdAt: Date.now() })} className="p-3 bg-slate-50 text-slate-300 hover:text-cyan-600 rounded-2xl border border-slate-100 transition-colors"><CheckCircle size={20} /></button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeDrill && (
          <Timer 
            drill={activeDrill} 
            onComplete={(dur) => { saveLog({ date: new Date().toISOString(), drillName: activeDrill.name, category: activeDrill.category, duration: dur, createdAt: Date.now() }); setActiveDrill(null); }} 
            onCancel={() => setActiveDrill(null)} 
          />
        )}
      </main>

      <div className="fixed bottom-6 right-6 flex items-center gap-3 bg-white border border-slate-200 p-4 rounded-2xl shadow-xl z-50">
        {!user ? <Loader2 size={18} className="text-slate-300 animate-spin" /> : <Cloud size={18} className="text-cyan-500" />}
        <div className="text-xs font-bold text-slate-600">{!user ? 'Syncing...' : 'Netball DB Connected'}</div>
      </div>
    </div>
  );
}