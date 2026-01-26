import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Plus, Trash2, BarChart2, CheckCircle, Clock, Save, Maximize, Minimize, Settings, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Pencil, Trophy, Activity, Cloud, Loader2, AlertCircle, Calendar, Target, ClipboardList, History, Dumbbell, Layers, FastForward, GripVertical, RefreshCcw, Database } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query } from 'firebase/firestore';

// --- Constants & Config ---
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CATEGORIES = ["Self Training", "Training", "Match", "School"];

const DEFAULT_DRILLS = [
  { id: 1, name: "Juggling", defaultTime: 15, category: "Self Training" },
  { id: 2, name: "Cone Weaving", defaultTime: 20, category: "Self Training" },
  { id: 3, name: "Wall Passing", defaultTime: 15, category: "Self Training" },
  { id: 4, name: "Team Scrimmage", defaultTime: 60, category: "Training" },
  { id: 5, name: "Match Day", defaultTime: 90, category: "Match" },
  { id: 6, name: "PE / School", defaultTime: 45, category: "School" }
];

// --- Historical Seed Data (Matches Spreadsheet) ---
const generateHistoricalData = () => {
  const logs = [];
  
  // Helper: Create date relative to "Week 5" (Current Week)
  // weekOffset: 0 = Current (Week 5), 1 = Last Week (Week 4), etc.
  const createDate = (weekOffset, dayIndex) => {
    const d = new Date();
    const currentDay = d.getDay(); 
    const diffToMon = d.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diffToMon));
    monday.setHours(12, 0, 0, 0); 
    monday.setDate(monday.getDate() - (weekOffset * 7));
    monday.setDate(monday.getDate() + dayIndex);
    return monday.toISOString();
  };

  const addLog = (weekOffset, dayIndex, category, hours, name) => {
    logs.push({
      id: `seed-w${weekOffset}-d${dayIndex}-${Math.random().toString(36).substr(2,9)}`,
      date: createDate(weekOffset, dayIndex),
      drillName: name || category,
      category: category,
      duration: hours * 60, // store in minutes
      createdAt: Date.now()
    });
  };

  // WEEK 4 (1 Week Ago) - Total 11.2h
  addLog(1, 0, "Self Training", 1.2, "Monday Session"); 
  addLog(1, 1, "Self Training", 3.0, "Tuesday Grind");   
  addLog(1, 2, "Self Training", 3.0, "Wednesday Grind");   
  addLog(1, 3, "Self Training", 3.0, "Thursday Grind");   
  addLog(1, 4, "Self Training", 0.75, "Friday Session"); 
  addLog(1, 5, "Self Training", 0.25, "Saturday Light"); 

  // WEEK 3 (2 Weeks Ago) - Total 12.8h
  addLog(2, 0, "Self Training", 3.0, "Monday Session");
  addLog(2, 1, "Self Training", 3.0, "Tuesday Session");
  addLog(2, 2, "Self Training", 3.0, "Wednesday Session");
  addLog(2, 3, "Self Training", 0.5, "Thursday Light");
  addLog(2, 4, "Self Training", 1.0, "Friday Session");
  addLog(2, 5, "Self Training", 1.0, "Saturday Session");
  addLog(2, 5, "Training", 1.0, "Josh's Training");
  addLog(2, 6, "Self Training", 0.3, "Sunday Recovery");

  // WEEK 2 (3 Weeks Ago) - Total 3.5h
  addLog(3, 1, "Self Training", 1.0, "Tuesday Session");
  addLog(3, 2, "Self Training", 1.5, "Wednesday Session");
  addLog(3, 6, "Self Training", 1.0, "Sunday Session");

  // WEEK 1 (4 Weeks Ago) - Total 3.0h
  addLog(4, 3, "Self Training", 1.0, "Thursday Session");
  addLog(4, 4, "Self Training", 0.5, "Friday Session");
  addLog(4, 5, "Self Training", 1.0, "Saturday Session");
  addLog(4, 6, "Self Training", 0.5, "Sunday Session");

  return logs;
};

// --- Firebase Setup (Safe Fallback) ---
let app, auth, db;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

try {
  // Check if configuration exists before initializing
  if (typeof __firebase_config !== 'undefined') {
    const firebaseConfig = JSON.parse(__firebase_config);
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    // console.warn("Firebase Config not found. App will run in Offline Mode.");
  }
} catch (error) {
  console.error("Firebase init failed:", error);
}

// --- Helper Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', ...props }) => {
  const baseStyle = "px-6 py-3 rounded-lg font-bold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 touch-manipulation transform active:scale-95";
  const variants = {
    primary: "bg-lime-400 hover:bg-lime-300 text-black shadow-[0_0_20px_rgba(163,230,53,0.3)] hover:shadow-[0_0_30px_rgba(163,230,53,0.5)] border-0",
    secondary: "bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-lime-400/50 backdrop-blur-sm",
    danger: "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/50",
    ghost: "text-slate-400 hover:text-white hover:bg-white/5",
    icon: "p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
  };
  return (
    <button onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }) => (
  <div className={`bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-xl ${className}`}>
    {children}
  </div>
);

// --- Modals ---

const ManualEntryModal = ({ title, initialDuration, onSave, onClose }) => {
  const [duration, setDuration] = useState(initialDuration);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl p-6">
        <h3 className="font-bold text-lg text-white uppercase tracking-wide mb-4">{title}</h3>
        <div className="mb-6">
          <label className="block text-xs font-bold text-lime-400 uppercase mb-2">Duration (Minutes)</label>
          <input 
            type="number" 
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
            className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white text-2xl font-mono focus:border-lime-400 focus:outline-none"
            autoFocus
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(duration); onClose(); }}>Confirm</Button>
        </div>
      </div>
    </div>
  );
};

const EditGoalModal = ({ currentGoal, onSave, onClose }) => {
  const [goal, setGoal] = useState(currentGoal);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl p-6">
        <h3 className="font-bold text-lg text-white uppercase tracking-wide mb-4">Weekly Goal</h3>
        <div className="mb-6">
          <label className="block text-xs font-bold text-lime-400 uppercase mb-2">Target Hours</label>
          <input 
            type="number" 
            step="0.5"
            value={goal}
            onChange={(e) => setGoal(parseFloat(e.target.value))}
            className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white text-2xl font-mono focus:border-lime-400 focus:outline-none"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(goal); onClose(); }}>Save</Button>
        </div>
      </div>
    </div>
  );
};

const EditDrillModal = ({ drill, onSave, onDelete, onClose }) => {
  const [formData, setFormData] = useState(drill);

  const handleSubmit = () => {
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-slate-800/50">
          <h3 className="font-bold text-lg text-white uppercase tracking-wide">Edit Drill</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Drill Name</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white focus:border-lime-400 focus:ring-1 focus:ring-lime-400 focus:outline-none transition-all placeholder:text-slate-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Duration (mins)</label>
              <input 
                type="number" 
                value={formData.defaultTime}
                onChange={(e) => setFormData({...formData, defaultTime: parseInt(e.target.value) || 0})}
                className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white focus:border-lime-400 focus:ring-1 focus:ring-lime-400 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Category</label>
              <select 
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white focus:border-lime-400 focus:ring-1 focus:ring-lime-400 focus:outline-none transition-all appearance-none"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat} className="bg-slate-900">{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-800/30 border-t border-white/5 flex justify-between gap-3">
          <Button variant="danger" onClick={() => { onDelete(drill.id); onClose(); }}>
            <Trash2 size={18} /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit}>Save Changes</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const RunthroughSetupModal = ({ drills, onStart, onClose }) => {
  const [queue, setQueue] = useState(drills);
  const [restTime, setRestTime] = useState(30);

  const moveItem = (index, direction) => {
    const newQueue = [...queue];
    const item = newQueue[index];
    newQueue.splice(index, 1);
    newQueue.splice(index + direction, 0, item);
    setQueue(newQueue);
  };

  const removeItem = (index) => {
    setQueue(queue.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-slate-800/50">
          <h3 className="font-bold text-lg text-white uppercase tracking-wide flex items-center gap-2">
            <Layers className="text-lime-400" size={20} /> Runthrough Setup
          </h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <div className="mb-6 bg-slate-800/50 p-4 rounded-xl border border-white/5">
            <label className="block text-xs font-bold text-lime-400 uppercase mb-2">Rest Between Drills (Seconds)</label>
            <input 
              type="number" 
              value={restTime}
              onChange={(e) => setRestTime(parseInt(e.target.value) || 0)}
              className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white text-xl font-mono focus:border-lime-400 focus:outline-none"
            />
          </div>

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Drill Sequence</h4>
          <div className="space-y-2">
            {queue.map((drill, index) => (
              <div key={drill.id + '-' + index} className="bg-slate-900 border border-white/5 p-3 rounded-lg flex items-center gap-3">
                <div className="text-slate-500 font-mono text-sm w-6 text-center">{index + 1}</div>
                <div className="flex-1">
                  <div className="text-white font-bold text-sm">{drill.name}</div>
                  <div className="text-slate-500 text-xs">{drill.defaultTime} mins</div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => moveItem(index, -1)} 
                    disabled={index === 0}
                    className="p-2 text-slate-400 hover:text-lime-400 disabled:opacity-30 disabled:hover:text-slate-400"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button 
                    onClick={() => moveItem(index, 1)} 
                    disabled={index === queue.length - 1}
                    className="p-2 text-slate-400 hover:text-lime-400 disabled:opacity-30 disabled:hover:text-slate-400"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button 
                    onClick={() => removeItem(index)}
                    className="p-2 text-slate-400 hover:text-red-400 ml-2"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-white/5 bg-slate-800/30">
          <Button onClick={() => onStart(queue, restTime)} className="w-full py-4 text-lg">
            Start Runthrough ({queue.length} Drills)
          </Button>
        </div>
      </div>
    </div>
  );
};

// --- Runthrough Active View ---

const RunthroughTimer = ({ queue, restDuration, onCompleteLog, onExit }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(queue[0]?.defaultTime * 60 || 0);
  const [isActive, setIsActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cumulativeTime, setCumulativeTime] = useState(0);

  const currentDrill = queue[currentIndex];
  const nextDrill = queue[currentIndex + 1];

  const totalRemaining = queue.slice(currentIndex + 1).reduce((acc, d) => acc + (d.defaultTime * 60), 0) 
                         + timeLeft 
                         + ((queue.length - 1 - currentIndex) * restDuration);

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(t => t - 1);
      }, 1000);
    } else if (timeLeft === 0 && isActive) {
      handlePhaseComplete();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const handlePhaseComplete = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); 
    playBeep(isResting ? 880 : 440);

    if (!isResting) {
      const duration = currentDrill.defaultTime; 
      onCompleteLog(currentDrill, duration); 
      setCumulativeTime(prev => prev + duration * 60);

      if (currentIndex < queue.length - 1) {
        setIsResting(true);
        setTimeLeft(restDuration);
      } else {
        setIsActive(false);
        alert("Runthrough Complete!");
        onExit();
      }
    } else {
      setIsResting(false);
      setCurrentIndex(prev => prev + 1);
      setTimeLeft(queue[currentIndex + 1].defaultTime * 60);
    }
  };

  const skipPhase = () => {
    setTimeLeft(0); 
  };

  const playBeep = (freq = 440) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTotalTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <div className={`flex flex-col h-full items-center justify-between p-6 transition-colors duration-500 ${
      isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'min-h-[600px]'
    } ${isResting ? 'bg-blue-900/40' : ''}`}>
      <div className={`absolute inset-0 -z-10 ${isResting ? 'bg-gradient-to-b from-blue-900 to-black' : 'bg-gradient-to-b from-slate-900 via-slate-950 to-black'} ${!isFullscreen && 'rounded-3xl border border-white/10'}`} />

      <div className="w-full flex justify-between items-start z-10">
        <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-3 bg-white/5 rounded-full text-white/50 hover:text-white">
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
        <div className="text-center">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Elapsed / Remaining</div>
          <div className="text-sm font-mono text-white">
            {formatTotalTime(cumulativeTime)} / {formatTotalTime(totalRemaining)}
          </div>
        </div>
        <button onClick={onExit} className="p-3 bg-white/5 rounded-full text-white/50 hover:text-red-400">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-lg space-y-8">
        <div className="text-center">
          <div className={`text-sm font-bold uppercase tracking-widest mb-2 px-3 py-1 rounded-full inline-block ${isResting ? 'bg-blue-500 text-white' : 'bg-lime-400 text-black'}`}>
            {isResting ? "Rest Period" : `Drill ${currentIndex + 1} of ${queue.length}`}
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white uppercase italic tracking-wide mt-4">
            {isResting ? "Recover" : currentDrill.name}
          </h2>
          {!isResting && <p className="text-lime-400 font-bold uppercase tracking-wider text-sm mt-1">{currentDrill.category}</p>}
        </div>

        <div className={`font-mono font-bold tabular-nums tracking-tighter transition-all select-none drop-shadow-2xl ${
            isFullscreen ? 'text-[25vw]' : 'text-8xl md:text-9xl'
          } ${isResting ? 'text-blue-400' : (timeLeft <= 10 && isActive ? 'text-red-500 animate-pulse' : 'text-white')}`}>
          {formatTime(timeLeft)}
        </div>

        {!isResting && nextDrill && (
          <div className="flex items-center gap-2 text-slate-500 bg-black/40 px-4 py-2 rounded-lg border border-white/5">
            <span className="text-xs font-bold uppercase tracking-wider">Up Next:</span>
            <span className="text-sm font-bold text-white">{nextDrill.name}</span>
          </div>
        )}
        {isResting && nextDrill && (
           <div className="text-center animate-pulse">
             <div className="text-xs font-bold uppercase tracking-wider text-blue-300">Coming Up</div>
             <div className="text-2xl font-black text-white mt-1">{nextDrill.name}</div>
           </div>
        )}
      </div>

      <div className="flex items-center gap-6 z-10 mb-8">
        <button 
          onClick={() => setIsActive(!isActive)}
          className={`w-20 h-20 flex items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${isResting ? 'bg-blue-500 hover:bg-blue-400' : 'bg-lime-400 hover:bg-lime-300 text-black'}`}
        >
          {isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
        </button>
        <button 
          onClick={skipPhase}
          className="w-14 h-14 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/5 transition-transform active:scale-95"
        >
          <FastForward size={20} fill="currentColor" />
        </button>
      </div>
    </div>
  );
};

const DrillSelector = ({ drills, onSelectDrill, onManualLog, onUpdateDrill, onDeleteDrill, onAddDrill, onStartRunthrough }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingDrill, setEditingDrill] = useState(null);
  const [manualEntryDrill, setManualEntryDrill] = useState(null);
  const [newDrill, setNewDrill] = useState({ name: '', defaultTime: 15, category: 'Self Training' });

  const handleAdd = () => {
    if (newDrill.name) {
      onAddDrill({ ...newDrill, id: Date.now() });
      setNewDrill({ name: '', defaultTime: 15, category: 'Self Training' });
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      {editingDrill && (
        <EditDrillModal 
          drill={editingDrill} 
          onSave={onUpdateDrill}
          onDelete={onDeleteDrill}
          onClose={() => setEditingDrill(null)} 
        />
      )}

      {manualEntryDrill && (
        <ManualEntryModal
          title={`Log ${manualEntryDrill.name}`}
          initialDuration={manualEntryDrill.defaultTime}
          onSave={(duration) => onManualLog(manualEntryDrill, duration)}
          onClose={() => setManualEntryDrill(null)}
        />
      )}

      <div className="flex justify-between items-center gap-4">
        <h2 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-2">
          <Activity className="text-lime-400" /> Select Drill
        </h2>
        <div className="flex gap-2">
          <Button variant="secondary" className="px-3" onClick={onStartRunthrough}>
            <Layers size={18} /> <span className="hidden md:inline">Runthrough</span>
          </Button>
          <Button variant="secondary" className="px-3" onClick={() => setIsAdding(!isAdding)}>
            <Plus size={18} /> <span className="hidden md:inline">New</span>
          </Button>
        </div>
      </div>

      {isAdding && (
        <Card className="bg-lime-400/5 border-lime-400/20 mb-4 animate-in fade-in slide-in-from-top-4">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-lime-400 uppercase mb-2">New Drill Name</label>
              <input 
                type="text" 
                value={newDrill.name}
                onChange={(e) => setNewDrill({...newDrill, name: e.target.value})}
                className="w-full p-3 bg-black/40 border border-lime-400/30 rounded-lg text-white focus:border-lime-400 focus:ring-1 focus:ring-lime-400 focus:outline-none transition-all placeholder:text-slate-600"
                placeholder="e.g. Penalty Kicks"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-lime-400 uppercase mb-2">Duration (mins)</label>
                <input 
                  type="number" 
                  value={newDrill.defaultTime}
                  onChange={(e) => setNewDrill({...newDrill, defaultTime: parseInt(e.target.value)})}
                  className="w-full p-3 bg-black/40 border border-lime-400/30 rounded-lg text-white focus:border-lime-400 focus:ring-1 focus:ring-lime-400 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-lime-400 uppercase mb-2">Category</label>
                <select 
                  value={newDrill.category}
                  onChange={(e) => setNewDrill({...newDrill, category: e.target.value})}
                  className="w-full p-3 bg-black/40 border border-lime-400/30 rounded-lg text-white focus:border-lime-400 focus:ring-1 focus:ring-lime-400 focus:outline-none transition-all appearance-none"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat} className="bg-slate-900">{cat}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
              <Button onClick={handleAdd}>Confirm</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {drills.map(drill => (
          <div 
            key={drill.id} 
            className="group relative bg-slate-900/60 backdrop-blur-md border border-white/5 p-5 rounded-2xl hover:border-lime-400/30 transition-all duration-300 flex flex-col justify-between overflow-hidden"
          >
            {/* Hover Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-lime-400/0 via-lime-400/0 to-lime-400/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            
            {/* Header: Name & Info */}
            <div className="relative z-10 mb-6">
               <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-white group-hover:text-lime-400 transition-colors uppercase tracking-wide truncate max-w-[150px]">{drill.name}</h3>
                  <span className="text-[10px] font-bold text-slate-400 bg-white/5 border border-white/5 px-2 py-1 rounded uppercase tracking-wider mt-2 inline-block">
                    {drill.category}
                  </span>
                </div>
                 <button 
                  onClick={() => setEditingDrill(drill)}
                  className="text-slate-600 hover:text-white transition-colors"
                >
                  <Pencil size={14} />
                </button>
              </div>
              
              <div className="text-center mt-4 mb-2">
                <span className="text-5xl font-bold text-white/90 font-mono tracking-tighter">{drill.defaultTime}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase block -mt-1">MINUTES</span>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 relative z-10">
              <button 
                onClick={() => onSelectDrill(drill)}
                className="bg-lime-400 hover:bg-lime-300 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95"
              >
                <Play size={18} fill="currentColor" /> TIMER
              </button>
              <button 
                onClick={() => setManualEntryDrill(drill)}
                className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95 border border-white/5"
              >
                <ClipboardList size={18} /> LOG
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Main Components ---

const DailyHistory = ({ logs, onUpdateLog, onDeleteLog }) => {
  const [editingLog, setEditingLog] = useState(null);

  // Filter for today
  const todayStr = new Date().toDateString();
  const todaysLogs = logs.filter(log => new Date(log.date).toDateString() === todayStr).sort((a, b) => b.date.localeCompare(a.date));

  if (todaysLogs.length === 0) return null;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
       {editingLog && (
        <ManualEntryModal 
          title={`Edit ${editingLog.drillName}`}
          initialDuration={editingLog.duration}
          onSave={(newDuration) => onUpdateLog({...editingLog, duration: newDuration})}
          onClose={() => setEditingLog(null)}
        />
      )}

      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mt-8">
        <span className="w-2 h-2 bg-lime-400 rounded-full inline-block"></span> Today's Activity
      </h2>
      <div className="space-y-2">
        {todaysLogs.map(log => (
          <div key={log.id} className="bg-slate-900/40 border border-white/5 p-4 rounded-xl flex justify-between items-center group hover:border-lime-400/30 transition-colors">
            <div>
              <div className="font-bold text-white">{log.drillName}</div>
              <div className="text-xs text-slate-500 uppercase flex gap-2 mt-1">
                 <span className="text-lime-400">{log.duration} min</span> • {log.category}
                 <span className="text-slate-600">• {new Date(log.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setEditingLog(log)} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                <Pencil size={16} />
              </button>
              <button onClick={() => onDeleteLog(log.id)} className="p-2 hover:bg-red-500/10 rounded-full text-slate-400 hover:text-red-400 transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ActivitySelector = ({ onLogActivity }) => {
  const activities = [
    { name: "Self Training", icon: Target, color: "text-lime-400", defaultMins: 30 },
    { name: "Training", icon: Dumbbell, color: "text-blue-400", defaultMins: 90 },
    { name: "Match", icon: Trophy, color: "text-yellow-400", defaultMins: 90 },
    { name: "School", icon: Calendar, color: "text-purple-400", defaultMins: 45 }
  ];

  return (
    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4">
      {activities.map(act => (
        <button 
           key={act.name}
           onClick={() => onLogActivity(act.name, act.defaultMins)}
           className="bg-slate-900/60 border border-white/5 p-6 rounded-2xl flex flex-col items-center justify-center gap-4 hover:border-lime-400/50 hover:bg-slate-800 transition-all group shadow-lg"
        >
           <div className={`p-4 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors`}>
             <act.icon size={32} className={`${act.color} group-hover:scale-110 transition-transform`} />
           </div>
           <span className="font-bold text-sm text-white uppercase tracking-wider">{act.name}</span>
        </button>
      ))}
    </div>
  );
};

const Timer = ({ drill, onComplete, onCancel }) => {
  const [timeLeft, setTimeLeft] = useState(drill.defaultTime * 60);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => time - 1);
      }, 1000);
    } else if (timeLeft === 0 && isActive) {
      setIsActive(false);
      setIsFinished(true);
      playAlarm();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const playAlarm = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = 880; 
      
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      gain.gain.setValueAtTime(0.5, now + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.1);
      
      osc.start(now);
      osc.stop(now + 1.2);
    } catch (e) {
      console.error("Audio not supported");
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const adjustTime = (minutes) => {
    setTimeLeft(prev => Math.max(0, prev + (minutes * 60)));
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      ref={containerRef} 
      className={`flex flex-col items-center justify-center p-8 transition-all duration-500 ${
        isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'min-h-[600px] bg-transparent'
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black ${isFullscreen ? '' : 'rounded-3xl border border-white/10'} -z-10`} />

      <div className="absolute top-6 left-6 z-20">
        <button onClick={toggleFullscreen} className="p-3 bg-white/5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors backdrop-blur-sm">
          {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
        </button>
      </div>
      
      <div className="absolute top-6 right-6 z-20">
        <button onClick={onCancel} className="p-3 bg-white/5 rounded-full text-white/50 hover:text-white hover:bg-red-500/20 transition-colors backdrop-blur-sm">
          <X size={24} />
        </button>
      </div>

      <div className="text-center space-y-10 animate-in zoom-in duration-300 w-full max-w-lg">
        <div>
          <h2 className="text-2xl md:text-4xl font-black text-white italic uppercase tracking-widest mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">{drill.name}</h2>
          <p className="text-lime-400 font-bold uppercase tracking-wider text-sm">{drill.category}</p>
        </div>
        
        <div className="relative group">
           {/* Time Controls */}
           {!isActive && !isFinished && (
            <div className={`absolute -right-4 md:-right-16 top-1/2 -translate-y-1/2 flex flex-col gap-2 transition-opacity ${isActive ? 'opacity-0' : 'opacity-100'}`}>
              <button onClick={() => adjustTime(1)} className="p-2 hover:bg-white/10 rounded-full text-white/30 hover:text-lime-400 transition-colors">
                <ChevronUp size={32} />
              </button>
              <button onClick={() => adjustTime(-1)} className="p-2 hover:bg-white/10 rounded-full text-white/30 hover:text-red-400 transition-colors">
                <ChevronDown size={32} />
              </button>
            </div>
          )}

          <div className={`font-mono font-bold tabular-nums tracking-tighter transition-all select-none drop-shadow-[0_0_15px_rgba(0,0,0,0.5)] ${
            isFullscreen ? 'text-[20vw] md:text-[15vw]' : 'text-8xl md:text-9xl'
          } ${timeLeft <= 10 && isActive ? 'text-red-500 animate-pulse drop-shadow-[0_0_30px_rgba(239,68,68,0.6)]' : 'text-white'}`}>
            {formatTime(timeLeft)}
          </div>
        </div>

        {!isFinished ? (
          <div className="flex gap-6 justify-center items-center">
             <button 
              onClick={onCancel}
              className="w-16 h-16 flex items-center justify-center rounded-full bg-slate-800 border border-white/10 hover:bg-slate-700 text-slate-400 hover:text-white transition-all active:scale-95"
            >
              <Square size={20} fill="currentColor" />
            </button>

            <button 
              onClick={() => setIsActive(!isActive)}
              className="w-24 h-24 flex items-center justify-center rounded-full bg-lime-400 hover:bg-lime-300 text-black shadow-[0_0_30px_rgba(163,230,53,0.4)] transition-all hover:scale-105 active:scale-95"
            >
              {isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-2" />}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-4xl font-black text-lime-400 uppercase tracking-tighter animate-bounce drop-shadow-[0_0_20px_rgba(163,230,53,0.5)]">DRILL COMPLETE!</div>
            <Button 
              onClick={() => onComplete(drill.defaultTime)} // Logging default time for now
              className="w-full py-4 text-xl"
            >
              <CheckCircle size={24} /> Log Session
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Stats Page ---

const StatsDashboard = ({ logs, weeklyGoal, setWeeklyGoal, onSeedData }) => {
  const [viewType, setViewType] = useState('weekly'); 
  const [weekOffset, setWeekOffset] = useState(0); 
  const [showGoalModal, setShowGoalModal] = useState(false);

  const getWeekRange = (offset) => {
    const now = new Date();
    now.setDate(now.getDate() + (offset * 7));
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0,0,0,0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23,59,59,999);
    return { start: monday, end: sunday };
  };

  const currentRange = getWeekRange(weekOffset);

  const filteredLogs = logs.filter(log => {
    if (viewType === 'all') return true;
    const logDate = new Date(log.date);
    return logDate >= currentRange.start && logDate <= currentRange.end;
  });

  const selfTrainingMins = filteredLogs
    .filter(l => l.category === "Self Training")
    .reduce((acc, l) => acc + l.duration, 0);
  
  const selfTrainingHours = (selfTrainingMins / 60).toFixed(1);
  const totalMins = filteredLogs.reduce((acc, l) => acc + l.duration, 0);
  const totalHours = (totalMins / 60).toFixed(1);
  const goalMins = weeklyGoal * 60;
  const goalPercent = Math.round((selfTrainingMins / goalMins) * 100);
  const goalAchieved = selfTrainingMins >= goalMins;

  const byCategory = filteredLogs.reduce((acc, log) => {
    acc[log.category] = (acc[log.category] || 0) + (log.duration / 60);
    return acc;
  }, {});

  const chartData = Array(7).fill(0);
  if (viewType === 'weekly') {
    filteredLogs.forEach(log => {
      const date = new Date(log.date);
      const dayIndex = (date.getDay() + 6) % 7; 
      chartData[dayIndex] += log.duration;
    });
  }
  const maxDailyDuration = Math.max(...chartData, 60);
  const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {showGoalModal && <EditGoalModal currentGoal={weeklyGoal} onSave={setWeeklyGoal} onClose={() => setShowGoalModal(false)} />}

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900/50 p-2 rounded-xl border border-white/5">
        <div className="flex bg-slate-800 rounded-lg p-1">
          <button onClick={() => setViewType('weekly')} className={`px-4 py-2 rounded-md text-xs font-bold uppercase transition-all ${viewType === 'weekly' ? 'bg-lime-400 text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}>Weekly</button>
          <button onClick={() => { setViewType('all'); setWeekOffset(0); }} className={`px-4 py-2 rounded-md text-xs font-bold uppercase transition-all ${viewType === 'all' ? 'bg-lime-400 text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}>All Time</button>
        </div>
        {viewType === 'weekly' && (
          <div className="flex items-center gap-3">
            <Button variant="icon" onClick={() => setWeekOffset(prev => prev - 1)}><ChevronLeft size={20} /></Button>
            <div className="text-center min-w-[120px]">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Week {5 + weekOffset}</div>
              <div className="text-xs font-bold text-white">{formatDate(currentRange.start)} - {formatDate(currentRange.end)}</div>
            </div>
            <Button variant="icon" onClick={() => setWeekOffset(prev => prev + 1)} disabled={weekOffset >= 0}><ChevronRight size={20} /></Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-lime-500/10 to-lime-600/5 border-lime-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Target size={40} /></div>
          <div className="text-lime-400 text-[10px] font-bold uppercase tracking-wider mb-1">Self Training</div>
          <div className="text-3xl font-bold text-white tracking-tight">{selfTrainingHours}h</div>
        </Card>
        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-white opacity-5 group-hover:opacity-10 transition-opacity"><Clock size={40} /></div>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total Hours</div>
          <div className="text-3xl font-bold text-white tracking-tight">{totalHours}h</div>
        </Card>
        <Card className="relative overflow-hidden group cursor-pointer hover:border-lime-400/30 transition-all" onClick={() => setShowGoalModal(true)}>
          <div className="absolute top-0 right-0 p-4 text-white opacity-5 group-hover:opacity-10 transition-opacity"><Activity size={40} /></div>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Goal Progress</div>
          <div className="text-3xl font-bold text-white tracking-tight">{goalPercent}%</div>
          <div className="text-[10px] text-lime-400 uppercase mt-1 flex items-center gap-1">Target: {weeklyGoal}h <Pencil size={8} /></div>
        </Card>
        <Card className={`relative overflow-hidden group transition-colors ${goalAchieved ? 'bg-lime-900/20 border-lime-500/30' : ''}`}>
          <div className="absolute top-0 right-0 p-4 text-white opacity-5 group-hover:opacity-10 transition-opacity"><Trophy size={40} /></div>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Goal Achieved?</div>
          <div className={`text-3xl font-bold tracking-tight ${goalAchieved ? 'text-lime-400' : 'text-slate-500'}`}>{goalAchieved ? 'YES' : 'NO'}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2 text-xs"><Clock size={14} className="text-lime-400" /> Category Split</h3>
          <div className="space-y-5">
            {Object.keys(byCategory).length === 0 && <p className="text-slate-600 text-sm italic">No data yet.</p>}
            {Object.entries(byCategory).map(([cat, hours]) => (
              <div key={cat}>
                <div className="flex justify-between text-[10px] font-bold uppercase mb-2">
                  <span className="text-slate-300">{cat}</span>
                  <span className="text-lime-400">{hours.toFixed(1)}h</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-lime-500 to-lime-300 rounded-full" style={{ width: `${(hours / Math.max(parseFloat(totalHours), 0.1)) * 100}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        {viewType === 'weekly' && (
          <Card>
            <h3 className="font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2 text-xs"><BarChart2 size={14} className="text-lime-400" /> Weekly Activity</h3>
            <div className="flex items-end justify-between h-32 pt-4 px-2 gap-2">
               {WEEK_DAYS.map((day, i) => {
                 const heightPct = (chartData[i] / maxDailyDuration) * 100;
                 const isToday = weekOffset === 0 && (new Date().getDay() + 6) % 7 === i;
                 return (
                   <div key={day} className="flex flex-1 flex-col items-center gap-2 h-full justify-end group">
                     <div className="w-full bg-slate-800 rounded-sm flex items-end relative overflow-hidden h-full">
                       <div className={`w-full transition-all duration-700 ease-out shadow-[0_0_15px_rgba(163,230,53,0.2)] ${heightPct > 0 ? 'bg-lime-500/80 group-hover:bg-lime-400' : 'bg-transparent'}`} style={{ height: `${Math.max(heightPct, 0)}%` }}></div>
                     </div>
                     <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-lime-400' : 'text-slate-500'}`}>{day}</span>
                   </div>
                 );
               })}
            </div>
          </Card>
        )}
      </div>

      <div className="border-t border-white/5 pt-8 flex justify-center">
         <Button variant="secondary" onClick={onSeedData} className="w-full md:w-auto">
           <Database size={16} /> Reset Data to History
         </Button>
      </div>
    </div>
  );
};

// --- App Container ---

export default function App() {
  const [view, setView] = useState('drills'); 
  const [activeDrill, setActiveDrill] = useState(null);
  const [drills, setDrills] = useState(DEFAULT_DRILLS);
  const [logs, setLogs] = useState([]);
  const [weeklyGoal, setWeeklyGoal] = useState(5.5);
  const [user, setUser] = useState(null);
  const [manualEntryData, setManualEntryData] = useState(null); 
  const [runthroughQueue, setRunthroughQueue] = useState([]);
  const [runthroughRest, setRunthroughRest] = useState(30);

  useEffect(() => {
    // Only init auth if Firebase was initialized successfully
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

  // Fetch Logs (or load local)
  useEffect(() => {
    if (user && db) {
      // Online Mode
      const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'logs'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLogs(fetchedLogs);
      }, (error) => console.error("Error fetching logs:", error));
      return () => unsubscribe();
    } else {
      // Offline/Local Mode
      const savedLogs = localStorage.getItem('soccer_logs_v5_local');
      if (savedLogs) {
        setLogs(JSON.parse(savedLogs));
      } else {
        const historicalData = generateHistoricalData();
        setLogs(historicalData);
        localStorage.setItem('soccer_logs_v5_local', JSON.stringify(historicalData));
      }
    }
  }, [user]);

  // Fetch Drills
  useEffect(() => {
    if (user && db) {
      const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'drills'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          setDrills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }
      }, (error) => console.error("Error fetching drills:", error));
      return () => unsubscribe();
    } else {
      const savedDrills = localStorage.getItem('soccer_drills');
      if (savedDrills) setDrills(JSON.parse(savedDrills));
    }
  }, [user]);

  const handleSeedData = async () => {
    const history = generateHistoricalData();
    if (user && db) {
      if (confirm("This will upload Weeks 1-4 history to the database. Continue?")) {
        const logsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'logs');
        try {
          for (const log of history) {
            await addDoc(logsRef, log);
          }
          alert("Database seeded successfully!");
        } catch (e) {
          alert("Failed to seed database.");
        }
      }
    } else {
      // Local seed
      setLogs(history);
      localStorage.setItem('soccer_logs_v5_local', JSON.stringify(history));
      alert("Local data reset to history!");
    }
  };

  const handleSetGoal = (newGoal) => {
    setWeeklyGoal(newGoal);
    localStorage.setItem('soccer_goal', newGoal.toString());
  };

  const handleSelectDrill = (drill) => {
    setActiveDrill(drill);
    setView('timer');
  };

  const handleAddDrill = async (drill) => {
    if (user && db) {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'drills'), drill);
    } else {
      const updated = [...drills, drill];
      setDrills(updated);
      localStorage.setItem('soccer_drills', JSON.stringify(updated));
    }
  };

  const handleUpdateDrill = async (updatedDrill) => {
    if (user && db) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'drills', updatedDrill.id), updatedDrill);
    } else {
      const updated = drills.map(d => d.id === updatedDrill.id ? updatedDrill : d);
      setDrills(updated);
      localStorage.setItem('soccer_drills', JSON.stringify(updated));
    }
  };

  const handleDeleteDrill = async (id) => {
    if (user && db) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'drills', id));
    } else {
      const updated = drills.filter(d => d.id !== id);
      setDrills(updated);
      localStorage.setItem('soccer_drills', JSON.stringify(updated));
    }
  };

  const saveLog = async (newLog) => {
    if (user && db) {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'logs'), newLog);
    } else {
      const updatedLogs = [...logs, { ...newLog, id: Date.now().toString() }];
      setLogs(updatedLogs);
      localStorage.setItem('soccer_logs_v5_local', JSON.stringify(updatedLogs));
    }
  };

  const handleManualSubmit = (drill, duration) => {
    const newLog = {
      date: new Date().toISOString(),
      drillName: drill.name,
      category: drill.category,
      duration: duration,
      createdAt: Date.now()
    };
    saveLog(newLog);
  };

  const handleActivityLog = (category, defaultDuration) => {
    setManualEntryData({ 
      title: `Log ${category}`, 
      initialDuration: defaultDuration,
      category: category,
      drillName: category
    });
  };

  const handleManualEntrySave = (duration) => {
    if (!manualEntryData) return;
    const newLog = {
      date: new Date().toISOString(),
      drillName: manualEntryData.drillName,
      category: manualEntryData.category,
      duration: duration,
      createdAt: Date.now()
    };
    saveLog(newLog);
    setManualEntryData(null);
    setView('drills'); 
  };

  const handleCompleteSession = async (duration) => {
    const newLog = {
      date: new Date().toISOString(),
      drillName: activeDrill.name,
      category: activeDrill.category,
      duration: duration,
      createdAt: Date.now()
    };
    saveLog(newLog);
    setView('drills');
    setActiveDrill(null);
  };

  const handleStartRunthrough = (queue, rest) => {
    setRunthroughQueue(queue);
    setRunthroughRest(rest);
    setView('runthrough_active');
  };

  const handleRunthroughLog = (drill, duration) => {
    const newLog = {
      date: new Date().toISOString(),
      drillName: drill.name,
      category: drill.category,
      duration: duration,
      createdAt: Date.now()
    };
    saveLog(newLog); 
  };

  const handleDeleteLog = async (id) => {
    if (user && db) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'logs', id));
    } else {
      const updatedLogs = logs.filter(log => log.id !== id);
      setLogs(updatedLogs);
      localStorage.setItem('soccer_logs_v5_local', JSON.stringify(updatedLogs));
    }
  };

  const handleUpdateLog = async (updatedLog) => {
    if (user && db) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'logs', updatedLog.id), updatedLog);
    } else {
      const updatedLogs = logs.map(log => log.id === updatedLog.id ? updatedLog : log);
      setLogs(updatedLogs);
      localStorage.setItem('soccer_logs_v5_local', JSON.stringify(updatedLogs));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black font-sans text-white pb-20 selection:bg-lime-500 selection:text-black">
      {/* Header */}
      {view !== 'runthrough_active' && view !== 'timer' && (
        <div className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-lime-400 rounded-lg flex items-center justify-center text-black font-black text-xl shadow-[0_0_15px_rgba(163,230,53,0.4)] transform -skew-x-6">
                R
              </div>
              <h1 className="font-black text-xl italic uppercase tracking-tighter text-white hidden sm:block">Ray's Tracker</h1>
            </div>
            
            {/* Navigation Tabs */}
            <div className="flex bg-slate-900/50 rounded-full p-1 border border-white/5 overflow-x-auto">
              <button onClick={() => setView('drills')} className={`px-4 md:px-6 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${view === 'drills' || view === 'runthrough_setup' ? 'bg-lime-400 text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}>Drills</button>
              <button onClick={() => setView('activities')} className={`px-4 md:px-6 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${view === 'activities' ? 'bg-lime-400 text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}>Activities</button>
              <button onClick={() => setView('stats')} className={`px-4 md:px-6 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${view === 'stats' ? 'bg-lime-400 text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}>Stats</button>
            </div>
          </div>
        </div>
      )}

      <main className={`max-w-3xl mx-auto ${view !== 'runthrough_active' && view !== 'timer' ? 'p-4' : ''}`}>
        {manualEntryData && (
          <ManualEntryModal 
            title={manualEntryData.title}
            initialDuration={manualEntryData.initialDuration}
            onSave={handleManualEntrySave}
            onClose={() => setManualEntryData(null)}
          />
        )}

        {view === 'runthrough_setup' && <RunthroughSetupModal drills={drills} onStart={handleStartRunthrough} onClose={() => setView('drills')} />}
        {view === 'runthrough_active' && <RunthroughTimer queue={runthroughQueue} restDuration={runthroughRest} onCompleteLog={handleRunthroughLog} onExit={() => setView('drills')} />}
        {view === 'stats' && <StatsDashboard logs={logs} weeklyGoal={weeklyGoal} setWeeklyGoal={handleSetGoal} onSeedData={handleSeedData} />}

        {view === 'activities' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <section>
              <h2 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-2 mb-6"><Target className="text-lime-400" /> Log Activity</h2>
              <ActivitySelector onLogActivity={handleActivityLog} />
            </section>
            <section><DailyHistory logs={logs} onUpdateLog={handleUpdateLog} onDeleteLog={handleDeleteLog} /></section>
          </div>
        )}

        {view === 'drills' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <section><DrillSelector drills={drills} onSelectDrill={handleSelectDrill} onManualLog={handleManualSubmit} onUpdateDrill={handleUpdateDrill} onAddDrill={handleAddDrill} onDeleteDrill={handleDeleteDrill} onStartRunthrough={() => setView('runthrough_setup')} /></section>
            <section><DailyHistory logs={logs} onUpdateLog={handleUpdateLog} onDeleteLog={handleDeleteLog} /></section>
            
            <div className={`mt-8 p-4 border text-xs rounded-xl flex items-center gap-3 transition-colors bg-slate-900/50 border-white/5 text-slate-400`}>
              <div><Save size={16} /></div>
              <div className="flex-1">
                <span><strong className="text-slate-300 uppercase tracking-wide">Ready:</strong> Data saved locally. (Offline Mode)</span>
              </div>
            </div>
          </div>
        )}

        {view === 'timer' && activeDrill && <Timer drill={activeDrill} onComplete={handleCompleteSession} onCancel={() => setView('drills')} />}
      </main>
    </div>
  );
}