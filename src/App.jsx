import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Plus, Trash2, BarChart2, CheckCircle, Clock, Save, Maximize, Minimize, Settings, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Pencil, Trophy, Activity, Cloud, Loader2, AlertCircle, Calendar, Target, ClipboardList, History, Dumbbell, Layers, FastForward, GripVertical, RefreshCcw, Database, Info, LayoutGrid, List, FileText } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, setDoc, writeBatch } from 'firebase/firestore';

// --- Constants & Config ---
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATEGORIES = ["Shooting", "Footwork", "Match", "Club Training"];

const DEFAULT_DRILLS = [
  { id: 1, name: "Goal Shooting", defaultTime: 15, category: "Shooting" },
  { id: 2, name: "Wall Ball Rebounds", defaultTime: 10, category: "Footwork" },
  { id: 3, name: "Agility Shuttles", defaultTime: 15, category: "Footwork" },
  { id: 4, name: "Club Session", defaultTime: 90, category: "Club Training" },
  { id: 5, name: "Netball Match", defaultTime: 60, category: "Match" },
  { id: 6, name: "Core & Stability", defaultTime: 20, category: "Footwork" }
];

const CATEGORY_COLORS = {
  "Shooting": "bg-cyan-500",
  "Footwork": "bg-magenta-500", // Tailwind 'pink-500' often works best for magenta
  "Match": "bg-yellow-500",
  "Club Training": "bg-indigo-500"
};

const CATEGORY_TEXT_COLORS = {
  "Shooting": "text-cyan-400",
  "Footwork": "text-pink-400",
  "Match": "text-yellow-400",
  "Club Training": "text-indigo-400"
};

// --- Historical Seed Data ---
const generateHistoricalData = () => {
  const logs = [];
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
    const safeName = (name || category).replace(/[^a-zA-Z0-9]/g, '');
    logs.push({
      id: `seed-w${weekOffset}-d${dayIndex}-${safeName}`,
      date: createDate(weekOffset, dayIndex),
      drillName: name || category,
      category: category,
      duration: hours * 60, 
      createdAt: Date.now()
    });
  };

  // Week 4 (1 Week Ago)
  addLog(1, 0, "Self Training", 1.2, "Monday Session"); 
  addLog(1, 1, "Self Training", 3.0, "Tuesday Grind");   
  addLog(1, 2, "Self Training", 3.0, "Wednesday Grind");   
  addLog(1, 3, "Self Training", 3.0, "Thursday Grind");   
  addLog(1, 4, "Self Training", 0.75, "Friday Session"); 
  addLog(1, 5, "Self Training", 0.25, "Saturday Light"); 

  // Week 3 (2 Weeks Ago)
  addLog(2, 0, "Self Training", 3.0, "Monday Session");
  addLog(2, 1, "Self Training", 3.0, "Tuesday Session");
  addLog(2, 2, "Self Training", 3.0, "Wednesday Session");
  addLog(2, 3, "Self Training", 0.5, "Thursday Light");
  addLog(2, 4, "Self Training", 1.0, "Friday Session");
  addLog(2, 5, "Self Training", 1.0, "Saturday Session");
  addLog(2, 5, "Training", 1.0, "Josh's Training");
  addLog(2, 6, "Self Training", 0.3, "Sunday Recovery");

  // Week 2 (3 Weeks Ago)
  addLog(3, 1, "Self Training", 1.0, "Tuesday Session");
  addLog(3, 2, "Self Training", 1.5, "Wednesday Session");
  addLog(3, 6, "Self Training", 1.0, "Sunday Session");

  // Week 1 (4 Weeks Ago)
  addLog(4, 3, "Self Training", 1.0, "Thursday Session");
  addLog(4, 4, "Self Training", 0.5, "Friday Session");
  addLog(4, 5, "Self Training", 1.0, "Saturday Session");
  addLog(4, 6, "Self Training", 0.5, "Sunday Session");

  return logs;
};

// --- Firebase Setup ---
let app, auth, db;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

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
} catch (error) {
  console.error("Firebase init failed:", error);
}

// --- Sound & Wake Lock ---
const useWakeLock = (isActive) => {
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isActive) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
          console.log(`Wake Lock error: ${err.name}, ${err.message}`);
        }
      }
    };
    if (isActive) requestWakeLock();
    return () => { if (wakeLock) wakeLock.release(); };
  }, [isActive]);
};

// Referee Whistle Sound
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
    gain.gain.linearRampToValueAtTime(0.8, now + 0.1); 
    gain.gain.setValueAtTime(0.8, now + 2.5); 
    gain.gain.linearRampToValueAtTime(0, now + 3.0); 

    osc1.start(now);
    osc2.start(now);
    mod.start(now);

    osc1.stop(now + 3.0);
    osc2.stop(now + 3.0);
    mod.stop(now + 3.0);
    
    // Cleanup context after sound finishes
    setTimeout(() => ctx.close(), 3500);

  } catch (e) {
    console.error("Audio play failed", e);
  }
};

// --- Helper Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', ...props }) => {
  const baseStyle = "px-6 py-3 rounded-lg font-bold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 touch-manipulation transform active:scale-95";
  const variants = {
    primary: "bg-cyan-400 hover:bg-cyan-300 text-black shadow-[0_0_20px_rgba(163,230,53,0.3)] hover:shadow-[0_0_30px_rgba(163,230,53,0.5)] border-0",
    secondary: "bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-cyan-400/50 backdrop-blur-sm",
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

const Card = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-xl ${onClick ? 'cursor-pointer' : ''} ${className}`}>
    {children}
  </div>
);

// --- Circular Goal Progress Component ---
const GoalRing = ({ percent }) => {
  const radius = 30;
  const stroke = 6;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(percent, 100) / 100) * circumference;
  
  // Dynamic color based on percent
  const ringColor = percent >= 100 ? 'text-cyan-400' : 'text-cyan-500';

  return (
    <div className="relative flex items-center justify-center">
      <svg height={radius * 2} width={radius * 2} className="rotate-[-90deg]">
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="text-white/10"
        />
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease-in-out' }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className={ringColor}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
         <span className="text-[10px] font-bold text-white">{Math.round(percent)}%</span>
      </div>
    </div>
  );
};


// --- Modals ---

const ManualEntryModal = ({ title, initialDuration, onSave, onClose }) => {
  const [duration, setDuration] = useState(initialDuration);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl p-6">
        <h3 className="font-bold text-lg text-white uppercase tracking-wide mb-4">{title}</h3>
        <div className="mb-6">
          <label className="block text-xs font-bold text-cyan-400 uppercase mb-2">Duration (Minutes)</label>
          <input 
            type="number" 
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
            className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white text-2xl font-mono focus:border-cyan-400 focus:outline-none"
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

const AddHistoryEntryModal = ({ onClose, onSave }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState("Self Training");
  const [drillName, setDrillName] = useState("");
  const [duration, setDuration] = useState(30);

  const handleSave = () => {
    const localDate = new Date(date);
    localDate.setHours(12, 0, 0, 0); 
    
    onSave({
      date: localDate.toISOString(),
      category,
      drillName: drillName || category,
      duration: parseFloat(duration),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl p-6">
        <h3 className="font-bold text-lg text-white uppercase tracking-wide mb-4">Add Activity</h3>
        
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Date</label>
            <input 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white focus:border-cyan-400 focus:outline-none"
            />
          </div>
          <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Category</label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white focus:border-cyan-400 focus:outline-none"
              >
                {CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
              </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Activity Name (Optional)</label>
            <input 
              type="text" 
              value={drillName}
              onChange={(e) => setDrillName(e.target.value)}
              placeholder={category}
              className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white focus:border-cyan-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-cyan-400 uppercase mb-2">Duration (Minutes)</label>
            <input 
              type="number" 
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white text-xl font-mono focus:border-cyan-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Add Entry</Button>
        </div>
      </div>
    </div>
  );
};

const FullHistoryModal = ({ logs, onUpdateLog, onDeleteLog, onAddLog, onClose }) => {
  const [editingLog, setEditingLog] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const sortedLogs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {editingLog && (
          <ManualEntryModal 
            title={`Edit ${editingLog.drillName}`}
            initialDuration={editingLog.duration}
            onSave={(newDuration) => {
              onUpdateLog({...editingLog, duration: newDuration});
              setEditingLog(null);
            }}
            onClose={() => setEditingLog(null)}
          />
        )}
        
        {isAdding && (
          <AddHistoryEntryModal 
            onClose={() => setIsAdding(false)}
            onSave={(newLogData) => {
               onAddLog(newLogData);
               setIsAdding(false);
            }}
          />
        )}

        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-slate-800/50">
          <h3 className="font-bold text-lg text-white uppercase tracking-wide flex items-center gap-2">
            <History className="text-cyan-400" size={20} /> Full History
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => setIsAdding(true)}>
               <Plus size={14} /> Add Activity
            </Button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-2">
          {sortedLogs.length === 0 ? (
            <div className="text-center text-slate-500 py-10 italic">No logs found.</div>
          ) : (
            sortedLogs.map(log => (
              <div key={log.id} className="bg-slate-900 border border-white/5 p-3 rounded-xl flex justify-between items-center group hover:border-cyan-400/30 transition-colors">
                <div className="flex-1">
                   <div className="flex items-center gap-2 mb-1">
                     <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                       {new Date(log.date).toLocaleDateString()}
                     </span>
                     <span className={`text-[10px] uppercase font-bold ${CATEGORY_TEXT_COLORS[log.category]}`}>{log.category}</span>
                   </div>
                   <div className="text-white font-bold text-sm">{log.drillName}</div>
                   <div className="text-xs text-slate-500">{log.duration} mins</div>
                </div>
                
                <div className="flex gap-2">
                  <button onClick={() => setEditingLog(log)} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                    <Pencil size={16} />
                  </button>
                  <button 
                    onClick={() => {
                      if(confirm("Are you sure you want to delete this record?")) onDeleteLog(log.id);
                    }} 
                    className="p-2 hover:bg-red-500/10 rounded-full text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const EditGoalModal = ({ currentGoal, currentCategories, onSave, onClose }) => {
  const [goal, setGoal] = useState(currentGoal);
  const [dailyGoal, setDailyGoal] = useState((currentGoal / 7).toFixed(2));
  const [selectedCategories, setSelectedCategories] = useState(currentCategories || ["Self Training"]);

  const handleWeeklyChange = (val) => {
    const g = parseFloat(val);
    setGoal(g);
    setDailyGoal((g / 7).toFixed(2));
  };

  const handleDailyChange = (val) => {
    const d = parseFloat(val);
    setDailyGoal(d);
    setGoal((d * 7).toFixed(1));
  };

  const toggleCategory = (cat) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl p-6 relative">
        <h3 className="font-bold text-lg text-white uppercase tracking-wide mb-4">Edit Targets</h3>
        
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-cyan-400 uppercase mb-2">Weekly Goal (Hours)</label>
            <input 
              type="number" 
              step="0.5"
              value={goal}
              onChange={(e) => handleWeeklyChange(e.target.value)}
              className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white text-2xl font-mono focus:border-cyan-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-px bg-white/10 flex-1"></div>
            <span className="text-xs text-slate-500 uppercase">OR</span>
            <div className="h-px bg-white/10 flex-1"></div>
          </div>
          <div>
            <label className="block text-xs font-bold text-blue-400 uppercase mb-2">Daily Average (Hours)</label>
            <input 
              type="number" 
              step="0.1"
              value={dailyGoal}
              onChange={(e) => handleDailyChange(e.target.value)}
              className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white text-xl font-mono focus:border-blue-400 focus:outline-none"
            />
          </div>
          
          <div className="pt-4 border-t border-white/10">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-3">Count Activities:</label>
            <div className="space-y-2">
              {CATEGORIES.map(cat => (
                <label key={cat} className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={selectedCategories.includes(cat)}
                    onChange={() => toggleCategory(cat)}
                    className="w-4 h-4 rounded border-slate-600 text-cyan-400 focus:ring-cyan-400 bg-slate-900" 
                  />
                  <span className={`text-sm font-bold ${selectedCategories.includes(cat) ? 'text-white' : 'text-slate-500'}`}>{cat}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(parseFloat(goal), selectedCategories); onClose(); }}>Save Settings</Button>
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
              className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:outline-none transition-all placeholder:text-slate-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Duration (mins)</label>
              <input 
                type="number" 
                value={formData.defaultTime}
                onChange={(e) => setFormData({...formData, defaultTime: parseInt(e.target.value) || 0})}
                className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Category</label>
              <select 
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:outline-none transition-all appearance-none"
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
            <Layers className="text-cyan-400" size={20} /> Runthrough Setup
          </h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <div className="mb-6 bg-slate-800/50 p-4 rounded-xl border border-white/5">
            <label className="block text-xs font-bold text-cyan-400 uppercase mb-2">Rest Between Drills (Seconds)</label>
            <input 
              type="number" 
              value={restTime}
              onChange={(e) => setRestTime(parseInt(e.target.value) || 0)}
              className="w-full p-3 bg-black/40 border border-white/10 rounded-lg text-white text-xl font-mono focus:border-cyan-400 focus:outline-none"
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
                    className="p-2 text-slate-400 hover:text-cyan-400 disabled:opacity-30 disabled:hover:text-slate-400"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button 
                    onClick={() => moveItem(index, 1)} 
                    disabled={index === queue.length - 1}
                    className="p-2 text-slate-400 hover:text-cyan-400 disabled:opacity-30 disabled:hover:text-slate-400"
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
  
  useWakeLock(isActive); 

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
    playRefereeWhistle();

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
          <div className={`text-sm font-bold uppercase tracking-widest mb-2 px-3 py-1 rounded-full inline-block ${isResting ? 'bg-blue-500 text-white' : 'bg-cyan-400 text-black'}`}>
            {isResting ? "Rest Period" : `Drill ${currentIndex + 1} of ${queue.length}`}
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white uppercase italic tracking-wide mt-4">
            {isResting ? "Recover" : currentDrill.name}
          </h2>
          {!isResting && <p className="text-cyan-400 font-bold uppercase tracking-wider text-sm mt-1">{currentDrill.category}</p>}
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
          className={`w-20 h-20 flex items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${isResting ? 'bg-blue-500 hover:bg-blue-400' : 'bg-cyan-400 hover:bg-cyan-300 text-black'}`}
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

// --- Heatmap Component ---
const CalendarHeatmap = ({ logs }) => {
  const [hoverDay, setHoverDay] = useState(null);
  const [viewMode, setViewMode] = useState('day'); 

  // Generate calendar grid from start of 2026
  const today = new Date(); 
  const startDate = new Date('2026-01-01');
  
  const timeDiff = today.getTime() - startDate.getTime();
  const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  // Align start date to previous Monday
  const day = startDate.getDay();
  const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
  const gridStartDate = new Date(startDate);
  gridStartDate.setDate(diff);

  const daysToShow = Math.ceil((today.getTime() - gridStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 7;
  const totalWeeks = Math.ceil(daysToShow / 7);
  const adjustedTotalDays = totalWeeks * 7;

  // Map logs to date strings 'YYYY-MM-DD'
  const logMap = logs.reduce((acc, log) => {
    const dateStr = new Date(log.date).toDateString();
    if (!acc[dateStr]) acc[dateStr] = { total: 0, activities: {} };
    acc[dateStr].total += log.duration;
    // Track duration per category
    if (!acc[dateStr].activities[log.category]) acc[dateStr].activities[log.category] = 0;
    acc[dateStr].activities[log.category] += log.duration;
    return acc;
  }, {});

  const getDayData = (offset) => {
    const d = new Date(gridStartDate);
    d.setDate(gridStartDate.getDate() + offset);
    const dateStr = d.toDateString();
    const data = logMap[dateStr];
    return { date: d, data };
  };

  const grid = [];
  for (let i = 0; i < adjustedTotalDays; i++) {
    grid.push(getDayData(i));
  }

  // --- Week View Data Aggregation ---
  const weeklyData = [];
  if (viewMode === 'week') {
    for (let i = 0; i < totalWeeks; i++) {
      const weekStart = grid[i * 7].date;
      let weekTotal = 0;
      let weekActivities = {};
      for (let j = 0; j < 7; j++) {
        const dayData = grid[i * 7 + j].data;
        if (dayData) {
          weekTotal += dayData.total;
          Object.entries(dayData.activities).forEach(([cat, dur]) => {
            if (!weekActivities[cat]) weekActivities[cat] = 0;
            weekActivities[cat] += dur;
          });
        }
      }
      weeklyData.push({ start: weekStart, total: weekTotal, activities: weekActivities });
    }
  }

  const getIntensity = (minutes) => {
    if (!minutes) return "bg-slate-800/50 border-slate-800"; 
    const hours = minutes / 60;
    if (hours < 0.5) return "opacity-40";
    if (hours < 1.5) return "opacity-70";
    return "opacity-100";
  };

  return (
    <div className="relative p-4 bg-slate-900/50 rounded-xl border border-white/5 overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-white uppercase tracking-wider text-xs flex items-center gap-2">
          <Calendar size={14} className="text-cyan-400" /> Activity Heatmap (2026)
        </h3>
        <div className="flex bg-slate-800 rounded-lg p-0.5">
          <button 
            onClick={() => setViewMode('day')}
            className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${viewMode === 'day' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'}`}
          >
            By Day
          </button>
          <button 
            onClick={() => setViewMode('week')}
            className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${viewMode === 'week' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'}`}
          >
            By Week
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto pb-2">
        {viewMode === 'day' ? (
          <div className="flex gap-1 min-w-max">
            {/* Day View Grid */}
            {Array.from({ length: totalWeeks }).map((_, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {Array.from({ length: 7 }).map((_, dayIndex) => {
                  const dayOffset = weekIndex * 7 + dayIndex;
                  const { date, data } = grid[dayOffset];
                  const isToday = date.toDateString() === today.toDateString();
                  
                  // Render Cell Content (Split Box)
                  const cellContent = data ? (
                    <div className="w-full h-full flex flex-col overflow-hidden rounded-[1px]">
                      {Object.entries(data.activities).sort((a,b) => b[1] - a[1]).map(([cat, dur], idx) => (
                        <div 
                          key={idx} 
                          className={`flex-1 w-full ${CATEGORY_COLORS[cat]} ${getIntensity(dur)}`}
                        ></div>
                      ))}
                    </div>
                  ) : null;

                  return (
                    <div 
                      key={dayOffset}
                      onMouseEnter={() => setHoverDay({ date, data, title: date.toLocaleDateString() })}
                      onMouseLeave={() => setHoverDay(null)}
                      className={`w-4 h-4 rounded-sm transition-all hover:ring-2 hover:ring-white/50 cursor-pointer bg-slate-800/50 border border-white/5 ${isToday ? 'ring-1 ring-cyan-400' : ''}`}
                    >
                      {cellContent}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-1 items-end h-32 min-w-max pt-4">
             {/* Week View Bar Chart */}
             {weeklyData.map((week, idx) => {
               const heightPct = Math.min((week.total / (10 * 60)) * 100, 100); 
               return (
                 <div 
                    key={idx} 
                    className="w-4 bg-slate-800/50 rounded-t-sm relative group"
                    style={{ height: '100%' }}
                    onMouseEnter={() => setHoverDay({ date: week.start, data: week, title: `Week of ${week.start.toLocaleDateString()}` })}
                    onMouseLeave={() => setHoverDay(null)}
                 >
                    <div className="absolute bottom-0 w-full flex flex-col justify-end overflow-hidden rounded-t-sm" style={{ height: `${heightPct}%` }}>
                       {Object.entries(week.activities).map(([cat, dur], i) => (
                         <div key={i} style={{ height: `${(dur / week.total) * 100}%` }} className={`${CATEGORY_COLORS[cat]} opacity-80`}></div>
                       ))}
                    </div>
                 </div>
               )
             })}
          </div>
        )}
      </div>

      {/* Hover Tooltip */}
      {hoverDay && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-slate-900 p-3 rounded-lg shadow-2xl border border-white/10 z-20 pointer-events-none min-w-[150px]">
          <div className="text-xs font-bold text-white mb-2 border-b border-white/10 pb-1">
            {hoverDay.title}
          </div>
          {hoverDay.data && hoverDay.data.total > 0 ? (
            <div className="space-y-1">
              {Object.entries(hoverDay.data.activities).map(([cat, dur]) => (
                <div key={cat} className="flex justify-between text-[10px] uppercase">
                  <span className={CATEGORY_TEXT_COLORS[cat] || "text-white"}>{cat}</span>
                  <span className="text-white font-mono">{Math.round(dur)}m</span>
                </div>
              ))}
              <div className="pt-1 mt-1 border-t border-white/5 flex justify-between text-[10px] font-bold text-white">
                <span>Total</span>
                <span>{(hoverDay.data.total / 60).toFixed(1)}h</span>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 italic">No activity recorded</div>
          )}
        </div>
      )}
      
      <div className="flex gap-4 mt-4 text-[10px] text-slate-500 uppercase font-bold">
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-sm ${color}`}></div> {cat}
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Stats Page ---

const StatsDashboard = ({ logs, weeklyGoal, goalCategories, setWeeklyGoal, setGoalCategories }) => {
  const [viewType, setViewType] = useState('weekly'); // 'daily', 'weekly', 'monthly', 'term', 'yearly'
  const [dateOffset, setDateOffset] = useState(0); 
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [hoverBar, setHoverBar] = useState(null);

  // Helper to get range and labels based on viewType and offset
  const getViewRange = (type, offset) => {
    const d = new Date();
    d.setHours(0,0,0,0);

    if (type === 'daily') {
        d.setDate(d.getDate() + offset);
        const start = new Date(d);
        start.setHours(0,0,0,0);
        const end = new Date(d);
        end.setHours(23,59,59,999);
        return { start, end, label: start.toLocaleDateString('en-US', {weekday: 'long', month: 'short', day: 'numeric'}) };
    }

    if (type === 'weekly') {
      d.setDate(d.getDate() + (offset * 7));
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(d.setDate(diff));
      start.setHours(0,0,0,0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23,59,59,999);
      return { start, end, label: `${start.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} - ${end.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}` };
    } 
    
    if (type === 'monthly') {
      d.setDate(1); // Set to 1st of current month
      d.setMonth(d.getMonth() + offset);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      end.setHours(23,59,59,999);
      return { start, end, label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
    }

    if (type === 'term') {
      // 13 Weeks blocks from start of year
      const year = d.getFullYear();
      const startOfYear = new Date(year, 0, 1);
      
      const diffTime = Math.abs(d - startOfYear);
      const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7)); 
      const currentTermIndex = Math.floor((diffWeeks - 1) / 13);
      const targetIndex = currentTermIndex + offset;
      
      const start = new Date(startOfYear);
      start.setDate(start.getDate() + (targetIndex * 13 * 7));
      
      // Adjust start to be a Monday for clean charts
      const day = start.getDay();
      const diffToMon = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diffToMon);
      start.setHours(0,0,0,0);

      const end = new Date(start);
      end.setDate(start.getDate() + (13 * 7) - 1);
      end.setHours(23,59,59,999);
      
      return { 
          start: start, 
          end: end, 
          label: `Term ${(targetIndex % 4) + 1} (${start.toLocaleDateString('en-US', {month:'short', day:'numeric'})} - ${end.toLocaleDateString('en-US', {month:'short', day:'numeric'})})` 
      };
    }
    
    if (type === 'yearly') {
        d.setFullYear(d.getFullYear() + offset);
        const start = new Date(d.getFullYear(), 0, 1);
        const end = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
        return { start, end, label: start.getFullYear().toString() };
    }
    
    return { start: new Date(0), end: new Date() }; 
  };

  const currentRange = getViewRange(viewType, dateOffset);

  const filteredLogs = logs.filter(log => {
    const logDate = new Date(log.date);
    return logDate >= currentRange.start && logDate <= currentRange.end;
  });

  const selfTrainingMins = filteredLogs
    .filter(l => goalCategories.includes(l.category))
    .reduce((acc, l) => acc + l.duration, 0);
  
  const selfTrainingHours = (selfTrainingMins / 60).toFixed(1);
  const totalMins = filteredLogs.reduce((acc, l) => acc + l.duration, 0);
  const totalHours = (totalMins / 60).toFixed(1);

  // Goal scaling
  let targetHours = weeklyGoal;
  if (viewType === 'daily') targetHours = weeklyGoal / 7;
  if (viewType === 'monthly') targetHours = weeklyGoal * 4.33; // Approx weeks in month
  if (viewType === 'term') targetHours = weeklyGoal * 13;
  if (viewType === 'yearly') targetHours = weeklyGoal * 52;
  
  const goalMins = targetHours * 60;
  const goalPercent = Math.round((selfTrainingMins / Math.max(goalMins, 1)) * 100);
  const goalAchieved = selfTrainingMins >= goalMins;

  const byCategory = filteredLogs.reduce((acc, log) => {
    acc[log.category] = (acc[log.category] || 0) + (log.duration / 60);
    return acc;
  }, {});

  // --- Dynamic Chart Data Calculation ---
  let chartBuckets = [];
  let chartLabels = [];
  let getKey = () => 0;

  if (viewType === 'daily') {
      // 1 Aggregate Bucket (00:00-06:00) + 18 Hourly Buckets (06:00-23:00) = 19 Buckets
      chartBuckets = Array.from({ length: 19 }, () => ({ total: 0, activities: {} }));
      chartLabels = ['Early'];
      for(let h=6; h<24; h++) {
          const suffix = h >= 12 ? 'p' : 'a';
          const hour12 = h > 12 ? h - 12 : h;
          chartLabels.push(`${hour12}${suffix}`);
      }
      
      getKey = (date) => {
          const h = date.getHours();
          if (h < 6) return 0; // Bucket 0 is for anything before 6am
          return h - 5; // 6am maps to index 1, 7am to 2, etc.
      };
  } else if (viewType === 'weekly') {
      chartBuckets = Array.from({ length: 7 }, () => ({ total: 0, activities: {} }));
      chartLabels = WEEK_DAYS;
      getKey = (date) => (date.getDay() + 6) % 7;
  } else if (viewType === 'monthly') {
      // 5 Weeks max
      chartBuckets = Array.from({ length: 5 }, () => ({ total: 0, activities: {} }));
      chartLabels = ['W1', 'W2', 'W3', 'W4', 'W5'];
      // Key based on week index relative to start of month range
      getKey = (date) => Math.min(Math.floor((date - currentRange.start) / (1000 * 60 * 60 * 24 * 7)), 4);
  } else if (viewType === 'term') {
      // 13 Weeks
      chartBuckets = Array.from({ length: 13 }, () => ({ total: 0, activities: {} }));
      chartLabels = Array.from({length: 13}, (_, i) => `W${i+1}`);
      getKey = (date) => Math.min(Math.floor((date - currentRange.start) / (1000 * 60 * 60 * 24 * 7)), 12);
  } else if (viewType === 'yearly') {
      chartBuckets = Array.from({ length: 12 }, () => ({ total: 0, activities: {} }));
      chartLabels = MONTHS;
      getKey = (date) => date.getMonth();
  }

  // Populate buckets
  filteredLogs.forEach(log => {
    const date = new Date(log.date);
    const idx = getKey(date);
    if (chartBuckets[idx]) {
        chartBuckets[idx].total += log.duration;
        if (!chartBuckets[idx].activities[log.category]) {
            chartBuckets[idx].activities[log.category] = 0;
        }
        chartBuckets[idx].activities[log.category] += log.duration;
    }
  });
  
  // Chart Scaling
  const dataMax = chartBuckets.length > 0 ? Math.max(...chartBuckets.map(d => d.total)) : 0;
  // Use either the weekly goal or daily goal as reference line depending on view
  let referenceMins = 0;
  if (viewType === 'daily') referenceMins = 0; // Hide line
  else if (viewType === 'weekly') referenceMins = (weeklyGoal / 7) * 60; // Daily avg
  else referenceMins = weeklyGoal * 60; // Weekly goal for weekly buckets in month/term/year

  const ceilingMins = Math.max(Math.ceil(Math.max(dataMax, referenceMins) / 60) * 60, 60);
  const goalLinePct = (referenceMins / ceilingMins) * 100;
  const maxHours = Math.ceil(ceilingMins / 60);
  
  return (
    <div className="space-y-6 animate-in fade-in duration-300 relative">
      {/* Modal moved here for better context */}
      {showGoalModal && (
        <EditGoalModal 
           currentGoal={weeklyGoal} 
           currentCategories={goalCategories}
           onSave={setWeeklyGoal} 
           onClose={() => setShowGoalModal(false)} 
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900/50 p-2 rounded-xl border border-white/5">
        <div className="flex bg-slate-800 rounded-lg p-1 overflow-x-auto max-w-full">
          {['daily', 'weekly', 'monthly', 'term', 'yearly'].map(type => (
              <button 
                key={type}
                onClick={() => { setViewType(type); setDateOffset(0); }} 
                className={`px-4 py-2 rounded-md text-xs font-bold uppercase transition-all whitespace-nowrap ${viewType === type ? 'bg-cyan-400 text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                {type}
              </button>
          ))}
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="icon" onClick={() => setDateOffset(prev => prev - 1)}><ChevronLeft size={20} /></Button>
          <div className="text-center min-w-[140px]">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                {viewType === 'daily' ? 'Day View' : viewType === 'weekly' ? `Week ${5 + dateOffset}` : viewType === 'monthly' ? 'Month View' : viewType === 'yearly' ? 'Year View' : 'Term View'}
            </div>
            <div className="text-xs font-bold text-white">{currentRange.label}</div>
          </div>
          <Button variant="icon" onClick={() => setDateOffset(prev => prev + 1)} disabled={dateOffset >= 0}><ChevronRight size={20} /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Goal Progress Card - No Ring */}
        <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20 relative overflow-hidden group cursor-pointer hover:border-cyan-400/50 transition-all flex flex-col justify-between" onClick={() => setShowGoalModal(true)}>
           <div className="text-cyan-400 text-[10px] font-bold uppercase tracking-wider mb-2 flex justify-between">
              <span>Goal Progress</span>
              <Pencil size={10} />
          </div>
          
          <div className="text-3xl font-bold text-white tracking-tight">{selfTrainingHours}h</div>
          
          <div className="text-[9px] text-cyan-500/70 uppercase font-bold mt-2">
            Target: {Math.round(targetHours)}h
          </div>
        </Card>
        
        <Card className="relative overflow-hidden group flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-4 text-white opacity-5 group-hover:opacity-10 transition-opacity"><Clock size={40} /></div>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total Hours</div>
          <div className="text-3xl font-bold text-white tracking-tight">{totalHours}h</div>
          <div className="text-[9px] text-slate-600 uppercase font-bold mt-2">
            All Activity Types
          </div>
        </Card>
        
        {/* Goal Completion Card - With Ring */}
        <Card className="relative overflow-hidden group cursor-pointer hover:border-cyan-400/30 transition-all flex flex-col justify-between" onClick={() => setShowGoalModal(true)}>
          <div className="absolute top-0 right-0 p-4 text-white opacity-5 group-hover:opacity-10 transition-opacity"><Activity size={40} /></div>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
            Goal Completion
          </div>
          
          <div className="flex items-center justify-center">
             <GoalRing percent={goalPercent} />
          </div>
        </Card>

        <Card className={`relative overflow-hidden group transition-colors flex flex-col justify-between ${goalAchieved ? 'bg-cyan-900/20 border-cyan-500/30' : ''}`}>
          <div className="absolute top-0 right-0 p-4 text-white opacity-5 group-hover:opacity-10 transition-opacity"><Trophy size={40} /></div>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Target Met?</div>
          <div className={`text-3xl font-bold tracking-tight ${goalAchieved ? 'text-cyan-400' : 'text-slate-500'}`}>
            {goalAchieved ? 'YES' : 'NO'}
          </div>
          {goalAchieved && <div className="text-[9px] text-cyan-400 uppercase font-bold mt-2">Great Job!</div>}
        </Card>
      </div>

      {/* Yearly Heatmap - Full Width Row */}
      {viewType === 'yearly' && (
        <div className="mb-6">
           <CalendarHeatmap logs={logs} />
        </div>
      )}

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6`}>
        <Card>
          <h3 className="font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2 text-xs"><BarChart2 size={14} className="text-cyan-400" /> Activity Breakdown</h3>
            <div className="relative h-40 mt-4">
              {/* Reference Goal Line - Hidden on Daily view */}
              {viewType !== 'daily' && (
                <div 
                  className="absolute w-full border-t border-dashed border-cyan-400/50 z-10 pointer-events-none"
                  style={{ bottom: `${goalLinePct}%` }}
                >
                  <span className="absolute -top-3 right-0 text-[8px] text-cyan-400 font-bold bg-slate-900 px-1">Goal ({(referenceMins/60).toFixed(1)}h)</span>
                </div>
              )}

              <div className="flex items-end justify-between h-full pt-4 px-6 gap-1 relative">
                 {/* Y-Axis Labels */}
                 <div className="absolute left-0 top-0 bottom-6 w-4 flex flex-col justify-between text-[8px] text-slate-600 font-mono">
                   <span>{maxHours}h</span>
                   <span>{maxHours/2}h</span>
                   <span>0h</span>
                 </div>

                 {chartBuckets.map((bucketData, i) => {
                   const label = chartLabels[i] || '';
                   // Don't show every label if too many
                   const showLabel = viewType !== 'daily' || i % 4 === 0;
                   
                   return (
                     <div 
                        key={i} 
                        className="flex flex-1 flex-col items-center gap-2 h-full justify-end relative group hover:z-30"
                        onMouseEnter={() => setHoverBar({ index: i, label: label || i, data: bucketData })}
                        onMouseLeave={() => setHoverBar(null)}
                     >
                       <div className="w-full bg-slate-800 rounded-sm flex flex-col-reverse justify-start relative overflow-hidden h-full">
                         {/* Render Stacked Bars - Strict Order from CATEGORIES */}
                         {CATEGORIES.map((cat, idx) => {
                           const dur = bucketData.activities[cat] || 0;
                           if (dur === 0) return null;
                           const segmentHeight = (dur / ceilingMins) * 100;
                           
                           return (
                              <div key={idx} style={{ height: `${segmentHeight}%` }} className={`w-full ${CATEGORY_COLORS[cat]} opacity-90 border-t border-black/20 relative group-hover:opacity-100 transition-opacity`}></div>
                           );
                         })}
                       </div>
                       <span className={`text-[9px] font-bold uppercase text-slate-500 ${showLabel ? 'opacity-100' : 'opacity-0'}`}>{label}</span>
                       
                       {/* Enhanced Tooltip - High Z-Index & Translation to prevent cutoff */}
                       {hoverBar && hoverBar.index === i && (
                         <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-slate-950 p-3 rounded-lg shadow-2xl border border-white/20 z-50 w-32 md:w-40 pointer-events-none">
                            <div className="text-[10px] font-black text-white mb-2 border-b border-white/10 pb-1 uppercase tracking-wider">{label} Breakdown</div>
                            {Object.keys(bucketData.activities).length === 0 ? (
                                <div className="text-[9px] text-slate-500 italic">No Activity</div>
                            ) : (
                                <div className="space-y-1.5">
                                    {CATEGORIES.map(cat => {
                                        const dur = bucketData.activities[cat] || 0;
                                        if (dur === 0) return null;
                                        return (
                                            <div key={cat} className="flex items-center justify-between text-[9px] text-slate-300">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[cat]}`}></div>
                                                    <span>{cat}</span>
                                                </div>
                                                <span className="font-mono text-white">{Math.round(dur)}m</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                            <div className="mt-2 pt-1 border-t border-white/10 flex justify-between text-[9px] font-bold text-cyan-400">
                               <span>Total</span>
                               <span>{(bucketData.total / 60).toFixed(1)}h</span>
                            </div>
                         </div>
                       )}
                     </div>
                   );
                 })}
              </div>
            </div>
        </Card>

        <Card>
          <h3 className="font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2 text-xs"><Clock size={14} className="text-cyan-400" /> Category Split</h3>
          <div className="space-y-5">
            {Object.keys(byCategory).length === 0 && <p className="text-slate-600 text-sm italic">No data yet.</p>}
            {Object.entries(byCategory).map(([cat, hours]) => (
              <div key={cat}>
                <div className="flex justify-between text-[10px] font-bold uppercase mb-2">
                  <span className="text-slate-300">{cat}</span>
                  <span className="text-cyan-400">{hours.toFixed(1)}h</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${CATEGORY_COLORS[cat]}`} style={{ width: `${(hours / Math.max(parseFloat(totalHours), 0.1)) * 100}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

// --- Timer Component ---
const Timer = ({ drill, onComplete, onCancel }) => {
  const [timeLeft, setTimeLeft] = useState(drill.defaultTime * 60);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const audioCtxRef = useRef(null);
  
  useWakeLock(isActive); // Enable wake lock

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => time - 1);
      }, 1000);
    } else if (timeLeft === 0 && isActive) {
      setIsActive(false);
      setIsFinished(true);
      playRefereeWhistle();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);
  
  // Whistle Sound
  const playRefereeWhistle = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

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
      gain.gain.linearRampToValueAtTime(0.8, now + 0.1); 
      gain.gain.setValueAtTime(0.8, now + 2.5); 
      gain.gain.linearRampToValueAtTime(0, now + 3.0); 

      osc1.start(now);
      osc2.start(now);
      mod.start(now);

      osc1.stop(now + 3.0);
      osc2.stop(now + 3.0);
      mod.stop(now + 3.0);

    } catch (e) {
      console.error("Audio beep failed", e);
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

  const formatTotalTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <div 
      className={`flex flex-col items-center justify-center p-8 transition-all duration-500 ${
        isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'min-h-[600px] bg-transparent'
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black ${isFullscreen ? '' : 'rounded-3xl border border-white/10'} -z-10`} />

      <div className="absolute top-6 left-6 z-20">
        <button onClick={toggleFullscreen} className="p-3 bg-white/5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors backdrop-blur-sm">
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
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
          <p className="text-cyan-400 font-bold uppercase tracking-wider text-sm">{drill.category}</p>
        </div>
        
        <div className="relative group">
           {/* Time Controls */}
           {!isActive && !isFinished && (
            <div className={`absolute -right-4 md:-right-16 top-1/2 -translate-y-1/2 flex flex-col gap-2 transition-opacity ${isActive ? 'opacity-0' : 'opacity-100'}`}>
              <button onClick={() => adjustTime(1)} className="p-2 hover:bg-white/10 rounded-full text-white/30 hover:text-cyan-400 transition-colors">
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
              className="w-24 h-24 flex items-center justify-center rounded-full bg-cyan-400 hover:bg-cyan-300 text-black shadow-[0_0_30px_rgba(163,230,53,0.4)] transition-all hover:scale-105 active:scale-95"
            >
              {isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-2" />}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-4xl font-black text-cyan-400 uppercase tracking-tighter animate-bounce drop-shadow-[0_0_20px_rgba(163,230,53,0.5)]">DRILL COMPLETE!</div>
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

// --- DrillSelector Component ---
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
          <Activity className="text-cyan-400" /> Select Drill
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
        <Card className="bg-cyan-400/5 border-cyan-400/20 mb-4 animate-in fade-in slide-in-from-top-4">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-cyan-400 uppercase mb-2">New Drill Name</label>
              <input 
                type="text" 
                value={newDrill.name}
                onChange={(e) => setNewDrill({...newDrill, name: e.target.value})}
                className="w-full p-3 bg-black/40 border border-cyan-400/30 rounded-lg text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:outline-none transition-all placeholder:text-slate-600"
                placeholder="e.g. Penalty Kicks"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-cyan-400 uppercase mb-2">Duration (mins)</label>
                <input 
                  type="number" 
                  value={newDrill.defaultTime}
                  onChange={(e) => setNewDrill({...newDrill, defaultTime: parseInt(e.target.value)})}
                  className="w-full p-3 bg-black/40 border border-cyan-400/30 rounded-lg text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-cyan-400 uppercase mb-2">Category</label>
                <select 
                  value={newDrill.category}
                  onChange={(e) => setNewDrill({...newDrill, category: e.target.value})}
                  className="w-full p-3 bg-black/40 border border-cyan-400/30 rounded-lg text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:outline-none transition-all appearance-none"
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
            className="group relative bg-slate-900/60 backdrop-blur-md border border-white/5 p-5 rounded-2xl hover:border-cyan-400/30 transition-all duration-300 flex flex-col justify-between overflow-hidden"
          >
            {/* Hover Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/0 via-cyan-400/0 to-cyan-400/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            
            {/* Header: Name & Info */}
            <div className="relative z-10 mb-6">
               <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-white group-hover:text-cyan-400 transition-colors uppercase tracking-wide truncate max-w-[150px]">{drill.name}</h3>
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
                className="bg-cyan-400 hover:bg-cyan-300 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95"
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

// --- DailyHistory Component ---
const DailyHistory = ({ logs, onUpdateLog, onDeleteLog }) => {
  const [editingLog, setEditingLog] = useState(null);

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
        <span className="w-2 h-2 bg-cyan-400 rounded-full inline-block"></span> Today's Activity
      </h2>
      <div className="space-y-2">
        {todaysLogs.map(log => (
          <div key={log.id} className="bg-slate-900/40 border border-white/5 p-4 rounded-xl flex justify-between items-center group hover:border-cyan-400/30 transition-colors">
            <div>
              <div className="font-bold text-white">{log.drillName}</div>
              <div className="text-xs text-slate-500 uppercase flex gap-2 mt-1">
                 <span className="text-cyan-400">{log.duration} min</span> • {log.category}
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

// --- ActivitySelector Component ---
const ActivitySelector = ({ onLogActivity, onViewHistory }) => {
  const activities = [
    { name: "Self Training", icon: Target, color: "text-cyan-400", defaultMins: 30 },
    { name: "Training", icon: Dumbbell, color: "text-blue-400", defaultMins: 90 },
    { name: "Match", icon: Trophy, color: "text-yellow-400", defaultMins: 90 },
    { name: "School", icon: Calendar, color: "text-purple-400", defaultMins: 45 }
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="grid grid-cols-2 gap-4">
        {activities.map(act => (
          <button 
             key={act.name}
             onClick={() => onLogActivity(act.name, act.defaultMins)}
             className="bg-slate-900/60 border border-white/5 p-6 rounded-2xl flex flex-col items-center justify-center gap-4 hover:border-cyan-400/50 hover:bg-slate-800 transition-all group shadow-lg"
          >
             <div className={`p-4 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors`}>
               <act.icon size={32} className={`${act.color} group-hover:scale-110 transition-transform`} />
             </div>
             <span className="font-bold text-sm text-white uppercase tracking-wider">{act.name}</span>
          </button>
        ))}
      </div>
      
      <Button variant="secondary" onClick={onViewHistory} className="w-full flex justify-between items-center bg-slate-800/50 border-white/5 text-slate-300 hover:text-white">
        <span className="flex items-center gap-2"><History size={16} /> Manage Full History</span>
        <ChevronRight size={16} />
      </Button>
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
  const [goalCategories, setGoalCategories] = useState(["Self Training"]);
  const [user, setUser] = useState(null);
  const [manualEntryData, setManualEntryData] = useState(null); 
  const [runthroughQueue, setRunthroughQueue] = useState([]);
  const [runthroughRest, setRunthroughRest] = useState(30);
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

  // Fetch Logs (or load local)
  useEffect(() => {
    if (user && db) {
      const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'logs'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedLogs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        setLogs(fetchedLogs);
      }, (error) => console.error("Error fetching logs:", error));
      return () => unsubscribe();
    } else {
      const savedLogs = localStorage.getItem('soccer_logs_v6_local');
      if (savedLogs) {
        setLogs(JSON.parse(savedLogs));
      } else {
        const historicalData = generateHistoricalData();
        setLogs(historicalData);
        localStorage.setItem('soccer_logs_v6_local', JSON.stringify(historicalData));
      }
    }
  }, [user]);

  // Fetch Drills
  useEffect(() => {
    if (user && db) {
      const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'drills'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          setDrills(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        }
      }, (error) => console.error("Error fetching drills:", error));
      return () => unsubscribe();
    } else {
      const savedDrills = localStorage.getItem('soccer_drills');
      if (savedDrills) setDrills(JSON.parse(savedDrills));
    }
  }, [user]);

  const handleSeedData = () => {
    if (confirm("Reset local data to spreadsheet history (Weeks 1-4)? This will overwrite local changes.")) {
      const history = generateHistoricalData();
      setLogs(history);
      localStorage.setItem('soccer_logs_v6_local', JSON.stringify(history));
      alert("Local data reset successfully!");
    }
  };

  const handleSetGoal = (newGoal, newCategories) => {
    setWeeklyGoal(newGoal);
    localStorage.setItem('soccer_goal', newGoal.toString());
    
    if (newCategories) {
      setGoalCategories(newCategories);
      localStorage.setItem('soccer_goal_cats', JSON.stringify(newCategories));
    }
  };

  const handleSelectDrill = (drill) => {
    setActiveDrill(drill);
    setView('timer');
  };

  const handleAddDrill = async (drill) => {
    if (user && db) {
      const { id, ...drillData } = drill;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'drills'), drillData);
    } else {
      const updated = [...drills, drill];
      setDrills(updated);
      localStorage.setItem('soccer_drills', JSON.stringify(updated));
    }
  };

  const handleUpdateDrill = async (updatedDrill) => {
    if (user && db) {
      const { id, ...drillData } = updatedDrill;
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'drills', id), drillData);
    } else {
      const updated = drills.map(d => d.id === updatedDrill.id ? updatedDrill : d);
      setDrills(updated);
      localStorage.setItem('soccer_drills', JSON.stringify(updated));
    }
  };

  const handleDeleteDrill = async (id) => {
    if (user && db) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'drills', id));
    } else {
      const updated = drills.filter(d => d.id !== id);
      setDrills(updated);
      localStorage.setItem('soccer_drills', JSON.stringify(updated));
    }
  };

  const saveLog = async (newLog) => {
    if (user && db) {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'logs'), newLog);
    } else {
      const updatedLogs = [...logs, { ...newLog, id: Date.now().toString() }];
      setLogs(updatedLogs);
      localStorage.setItem('soccer_logs_v6_local', JSON.stringify(updatedLogs));
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
    saveLog(newLog, true); 
  };

  const handleDeleteLog = async (id) => {
    if (user && db) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'logs', id));
    } else {
      const updatedLogs = logs.filter(log => log.id !== id);
      setLogs(updatedLogs);
      localStorage.setItem('soccer_logs_v6_local', JSON.stringify(updatedLogs));
    }
  };

  const handleUpdateLog = async (updatedLog) => {
    if (user && db) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'logs', updatedLog.id), updatedLog);
    } else {
      const updatedLogs = logs.map(log => log.id === updatedLog.id ? updatedLog : log);
      setLogs(updatedLogs);
      localStorage.setItem('soccer_logs_v6_local', JSON.stringify(updatedLogs));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black font-sans text-white pb-20 selection:bg-cyan-500 selection:text-black">
      {/* Header */}
      {view !== 'runthrough_active' && view !== 'timer' && (
        <div className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-cyan-400 rounded-lg flex items-center justify-center text-black font-black text-xl shadow-[0_0_15px_rgba(163,230,53,0.4)] transform -skew-x-6">
                R
              </div>
              <h1 className="font-black text-xl italic uppercase tracking-tighter text-white hidden sm:block">Ray's Tracker</h1>
            </div>
            
            {/* Navigation Tabs */}
            <div className="flex bg-slate-900/50 rounded-full p-1 border border-white/5 overflow-x-auto">
              <button onClick={() => setView('drills')} className={`px-4 md:px-6 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${view === 'drills' || view === 'runthrough_setup' ? 'bg-cyan-400 text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}>Drills</button>
              <button onClick={() => setView('activities')} className={`px-4 md:px-6 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${view === 'activities' ? 'bg-cyan-400 text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}>Activities</button>
              <button onClick={() => setView('stats')} className={`px-4 md:px-6 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${view === 'stats' ? 'bg-cyan-400 text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}>Stats</button>
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
        
        {showHistoryModal && (
          <FullHistoryModal 
            logs={logs}
            onUpdateLog={handleUpdateLog}
            onDeleteLog={handleDeleteLog}
            onAddLog={saveLog}
            onClose={() => setShowHistoryModal(false)}
          />
        )}

        {view === 'runthrough_setup' && <RunthroughSetupModal drills={drills} onStart={handleStartRunthrough} onClose={() => setView('drills')} />}
        {view === 'runthrough_active' && <RunthroughTimer queue={runthroughQueue} restDuration={runthroughRest} onCompleteLog={handleRunthroughLog} onExit={() => setView('drills')} />}
        {view === 'stats' && <StatsDashboard logs={logs} weeklyGoal={weeklyGoal} goalCategories={goalCategories} setWeeklyGoal={handleSetGoal} />}

        {view === 'activities' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <section>
              <h2 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-2 mb-6"><Target className="text-cyan-400" /> Log Activity</h2>
              <ActivitySelector onLogActivity={handleActivityLog} onViewHistory={() => setShowHistoryModal(true)} />
            </section>
            <section><DailyHistory logs={logs} onUpdateLog={handleUpdateLog} onDeleteLog={handleDeleteLog} /></section>
          </div>
        )}

        {view === 'drills' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <section><DrillSelector drills={drills} onSelectDrill={handleSelectDrill} onManualLog={handleManualSubmit} onUpdateDrill={handleUpdateDrill} onAddDrill={handleAddDrill} onDeleteDrill={handleDeleteDrill} onStartRunthrough={() => setView('runthrough_setup')} /></section>
            <section><DailyHistory logs={logs} onUpdateLog={handleUpdateLog} onDeleteLog={handleDeleteLog} /></section>
            
            <div className={`mt-8 p-4 border text-xs rounded-xl flex items-center gap-3 transition-colors bg-slate-900/50 border-white/5 text-slate-400`}>
              <div className={!user ? 'animate-pulse' : ''}>
                {!user ? <Loader2 size={16} /> : <Cloud size={16} className="text-cyan-400" />}
              </div>
              <div className="flex-1">
                {!user ? <span>Connecting to Database... (Check Env Vars if stuck)</span> : <span><strong className="text-cyan-400 uppercase tracking-wide">Online:</strong> Database Connected.</span>}
              </div>
            </div>
          </div>
        )}

        {view === 'timer' && activeDrill && <Timer drill={activeDrill} onComplete={handleCompleteSession} onCancel={() => setView('drills')} />}
      </main>
    </div>
  );
}