import { useState, useMemo, useEffect } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Search, 
  Users, 
  ClipboardCheck, 
  Shield, 
  ShieldCheck,
  Share2,
  CheckSquare,
  Square,
  LayoutGrid,
  List as ListIcon,
  Info,
  AlertTriangle,
  ChevronDown,
  Edit2,
  Phone,
  MessageCircle,
  X,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TURMAS, MilitaryMember } from './data/turmas';
import { cn } from './lib/utils';
import { db, auth } from './firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc,
  serverTimestamp, 
  getDocFromServer,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';

// Error Handling Spec for Firestore Operations
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [selectedTurmaId, setSelectedTurmaId] = useState('Y');
  const [searchTerm, setSearchTerm] = useState('');
  const [presence, setPresence] = useState<Record<number, { present: boolean, funcao?: string, telefone?: string, warName?: string }>>({});
  const [filter, setFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<MilitaryMember[]>([]);
  const [editingMember, setEditingMember] = useState<MilitaryMember | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasLoadedMembers, setHasLoadedMembers] = useState(false);
  const [editForm, setEditForm] = useState<{ name: string, warName: string, funcao: string, code: string, telefone: string, re: string }>({ name: '', warName: '', funcao: '', code: '', telefone: '', re: '' });

  // Initialize edit form when opening modal
  useEffect(() => {
    if (editingMember) {
      setEditForm({
        name: editingMember.name,
        warName: presence[editingMember.id]?.warName || editingMember.warName || '',
        funcao: presence[editingMember.id]?.funcao || editingMember.role || '',
        code: editingMember.code,
        telefone: presence[editingMember.id]?.telefone || editingMember.phone || '',
        re: editingMember.re
      });
    } else if (isAddingMember) {
      setEditForm({ name: '', warName: '', funcao: '', code: '', telefone: '', re: '' });
    }
  }, [editingMember, isAddingMember]); // Only run when opening the modal

  const FUNCTIONS = [
    'P1', 'AUX DE P1', 'P2', 'AUX DE P2', 'P3', 'AUX DE P3', 
    'P4', 'AUX DE P4', 'XERIFE', 'SUB XERIFE', 'TCA', 'AUX DE TCA', 
    'P5', 'AUX DE P5', 'OUTRAS'
  ];

  const currentTurma = useMemo(() => TURMAS[selectedTurmaId], [selectedTurmaId]);
  const MILITARY_MEMBERS = hasLoadedMembers ? members : currentTurma.members;

  // Migration and Sync Members
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const membersPath = `turmas/${selectedTurmaId}/members`;
    
    // Sync members
    const q = query(collection(db, membersPath), orderBy('code', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMembers: MilitaryMember[] = snapshot.docs.map(doc => ({
        ...doc.data() as MilitaryMember,
        id: Number(doc.id)
      }));
      setMembers(newMembers);
      setHasLoadedMembers(true);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, membersPath);
    });

    // Migration check (only if we haven't migrated yet)
    const checkMigration = async () => {
      try {
        const snapshot = await getDocs(collection(db, membersPath));
        // Only migrate if Firestore is empty AND we haven't loaded anything yet
        if (snapshot.empty) {
          console.log("Migrating members to Firestore...");
          for (const member of currentTurma.members) {
            await setDoc(doc(db, membersPath, String(member.id)), {
              ...member,
              createdAt: serverTimestamp()
            });
          }
        }
      } catch (err) {
        console.error("Migration error:", err);
      }
    };

    checkMigration();

    return () => unsubscribe();
  }, [isAuthReady, user, selectedTurmaId, currentTurma]);

  // Initialize Auth
  useEffect(() => {
    // Enforce local persistence to prevent login loops
    setPersistence(auth, browserLocalPersistence).catch(err => console.error("Persistence Error:", err));

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log("Auth State Changed:", currentUser?.email);
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    // Add custom parameters to force account selection if needed
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        setUser(result.user);
        setError(null);
      }
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.code === 'auth/popup-blocked') {
        setError("O popup de login foi bloqueado. Por favor, autorize popups neste site.");
      } else if (err.code === 'auth/cancelled-popup-request') {
        // User closed the popup, no need to show error
      } else {
        setError("Falha ao entrar. Tente abrir o app em uma nova aba se o erro persistir.");
      }
    }
  };

  const handleLogout = () => signOut(auth);

  // Test Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
          setError("Erro de conexão com o banco de dados.");
        }
      }
    }
    testConnection();
  }, []);

  // Real-time Sync
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const path = `turmas/${selectedTurmaId}/attendance`;
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      const newPresence: Record<number, { present: boolean, funcao?: string, telefone?: string, warName?: string }> = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        newPresence[Number(doc.id)] = {
          present: data.present,
          funcao: data.funcao,
          telefone: data.telefone,
          warName: data.warName
        };
      });
      setPresence(newPresence);
    }, (err) => {
      console.error("Erro de sincronização em tempo real:", err);
    });

    return () => unsubscribe();
  }, [isAuthReady, user, selectedTurmaId]);

  const togglePresence = async (id: number) => {
    if (!user) return;
    
    const path = `turmas/${selectedTurmaId}/attendance/${id}`;
    const currentData = presence[id] || {};
    const isCurrentlyPresent = !!currentData?.present;
    
    // Remove undefined values to prevent Firestore errors
    const cleanData = Object.fromEntries(
      Object.entries(currentData).filter(([_, v]) => v !== undefined)
    );
    
    try {
      await setDoc(doc(db, 'turmas', selectedTurmaId, 'attendance', String(id)), {
        ...cleanData,
        present: !isCurrentlyPresent,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const saveMemberDetails = async (id: number, details: any) => {
    if (!user) return;
    
    try {
      // Update in members collection if it's a core detail
      const coreFields = ['name', 're', 'code', 'warName', 'role', 'phone'];
      const coreDetails = Object.fromEntries(
        Object.entries(details).filter(([k]) => coreFields.includes(k))
      );

      if (Object.keys(coreDetails).length > 0) {
        await setDoc(doc(db, 'turmas', selectedTurmaId, 'members', String(id)), {
          ...coreDetails,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // Update in attendance collection for transient/presence details
      const attendanceFields = ['funcao', 'telefone', 'warName', 'present'];
      const attendanceDetails = Object.fromEntries(
        Object.entries(details).filter(([k]) => attendanceFields.includes(k))
      );

      if (Object.keys(attendanceDetails).length > 0) {
        await setDoc(doc(db, 'turmas', selectedTurmaId, 'attendance', String(id)), {
          ...attendanceDetails,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `turmas/${selectedTurmaId}`);
    }
  };

  const addMember = async () => {
    if (!user) return;
    setIsProcessing(true);
    setError(null);
    const id = Date.now();
    try {
      await setDoc(doc(db, 'turmas', selectedTurmaId, 'members', String(id)), {
        id,
        name: editForm.name,
        warName: editForm.warName,
        re: editForm.re,
        code: editForm.code,
        role: editForm.funcao,
        phone: editForm.telefone,
        createdAt: serverTimestamp()
      });
      setIsAddingMember(false);
    } catch (err) {
      setError("Erro ao adicionar militar. Verifique os campos.");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateMember = async () => {
    if (!user || !editingMember) return;
    setIsProcessing(true);
    setError(null);
    try {
      await saveMemberDetails(editingMember.id, {
        name: editForm.name,
        warName: editForm.warName,
        re: editForm.re,
        code: editForm.code,
        role: editForm.funcao,
        phone: editForm.telefone,
        funcao: editForm.funcao, // Also update attendance
        telefone: editForm.telefone
      });
      setEditingMember(null);
    } catch (err) {
      setError("Erro ao atualizar militar.");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteMember = async (id: number) => {
    if (!user) return;
    setIsProcessing(true);
    setError(null);
    try {
      await deleteDoc(doc(db, 'turmas', selectedTurmaId, 'members', String(id)));
      await deleteDoc(doc(db, 'turmas', selectedTurmaId, 'attendance', String(id)));
      setEditingMember(null);
      setIsDeleting(false);
    } catch (err) {
      setError("Erro ao excluir militar. Verifique sua conexão.");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const selectAll = async () => {
    if (!user) return;
    
    for (const member of MILITARY_MEMBERS) {
      if (!presence[member.id]?.present) {
        try {
          await setDoc(doc(db, 'turmas', selectedTurmaId, 'attendance', String(member.id)), {
            present: true,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error(`Error selecting ${member.id}:`, err);
        }
      }
    }
  };

  const clearAll = async () => {
    if (!user) return;
    
    for (const member of MILITARY_MEMBERS) {
      if (presence[member.id]?.present) {
        try {
          await setDoc(doc(db, 'turmas', selectedTurmaId, 'attendance', String(member.id)), {
            present: false,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error(`Error clearing ${member.id}:`, err);
        }
      }
    }
  };

  const filteredMembers = useMemo(() => {
    return MILITARY_MEMBERS.filter(member => {
      const activeWarName = presence[member.id]?.warName || member.warName;
      const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           activeWarName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           member.re.includes(searchTerm) ||
                           member.code.includes(searchTerm);
      
      const isPresent = presence[member.id]?.present;
      const matchesFilter = filter === 'all' || 
                           (filter === 'present' && isPresent) || 
                           (filter === 'absent' && !isPresent);
      
      return matchesSearch && matchesFilter;
    });
  }, [searchTerm, presence, filter]);

  const stats = useMemo(() => {
    const total = MILITARY_MEMBERS.length;
    const values = Object.values(presence) as { present: boolean }[];
    const presentCount = values.filter(p => p.present).length;
    const absentCount = total - presentCount;
    const percentage = Math.round((presentCount / total) * 100);
    return { total, presentCount, absentCount, percentage };
  }, [presence]);

  const copyToWhatsApp = async () => {
    const presentList = MILITARY_MEMBERS
      .filter(m => presence[m.id]?.present)
      .map((m, i) => {
        const p = presence[m.id];
        const role = p?.funcao;
        const activeWarName = p?.warName || m.warName;
        const nameWithBoldWarName = activeWarName 
          ? m.name.replace(new RegExp(`(${activeWarName})`, 'gi'), '*$1*') 
          : m.name;
        return `${i + 1}- Nº PM: ${m.re} | ${nameWithBoldWarName} ${role ? `(${role})` : ''} *${m.code}*`;
      })
      .join('\n');
    
    const absentList = MILITARY_MEMBERS
      .filter(m => !presence[m.id]?.present)
      .map((m, i) => {
        const p = presence[m.id];
        const activeWarName = p?.warName || m.warName;
        const nameWithBoldWarName = activeWarName 
          ? m.name.replace(new RegExp(`(${activeWarName})`, 'gi'), '*$1*') 
          : m.name;
        return `${i + 1}- ${nameWithBoldWarName}`;
      })
      .join('\n');

    const text = `*PRESENÇA ${currentTurma.name.toUpperCase()}*\n*Data:* ${new Date().toLocaleDateString('pt-BR')}\n\n*RESUMO:*\n✅ *Presentes:* ${stats.presentCount}\n❌ *Ausentes:* ${stats.absentCount}\n📊 *Total:* ${stats.total}\n\n*LISTA DE PRESENTES:*\n${presentList || '_Nenhum militar presente._'}\n\n*LISTA DE AUSENTES:*\n${absentList || '_Nenhum militar ausente._'}`;
    
    const encodedText = encodeURIComponent(text);
    
    // Try to copy to clipboard first (with fallback)
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch (err) {
      console.warn('Clipboard API failed, using fallback:', err);
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (copyErr) {
        console.error('Fallback copy failed:', copyErr);
      }
      document.body.removeChild(textArea);
    }

    // Open WhatsApp
    window.open(`https://wa.me/?text=${encodedText}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-[#1C1E21] font-sans pb-32">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between gap-2 z-[60] sticky top-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-bold">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs font-black uppercase">Fechar</button>
        </div>
      )}

      {/* Header - Compact & Modern */}
      <header className="bg-[#1B2B3A] text-white shadow-2xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-[#F27D26] p-2 rounded-xl shadow-lg shrink-0">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-white font-black uppercase text-xl md:text-2xl tracking-tight leading-none">
                  {currentTurma.name}
                </h1>
                <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest mt-1">
                  Controle de Presença
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {user && (
                <div className="hidden md:flex items-center gap-2 bg-white/5 px-3 py-1 rounded-lg border border-white/10">
                  <img 
                    src={user.photoURL || ''} 
                    alt="User" 
                    className="w-5 h-5 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-[10px] font-bold truncate max-w-[100px]">
                    {user.displayName?.split(' ')[0]}
                  </span>
                  <button onClick={handleLogout} className="text-[8px] text-red-400 font-black uppercase hover:text-red-300">Sair</button>
                </div>
              )}
              <div className="bg-black/20 px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-black">{stats.presentCount}/{stats.total}</span>
              </div>
              <button 
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
              >
                {viewMode === 'grid' ? <ListIcon className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Login Overlay */}
      {!user && isAuthReady && (
        <div className="fixed inset-0 bg-[#1B2B3A]/95 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-md p-8 rounded-[2.5rem] shadow-2xl text-center"
          >
            <div className="bg-[#F27D26] w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-orange-500/20">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-black text-[#1B2B3A] mb-2 uppercase tracking-tight">Acesso Turma Y</h2>
            <p className="text-gray-500 text-sm mb-8 font-medium">Para marcar presença e ver as atualizações em tempo real, entre com sua conta Google.</p>
            
            <button 
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 hover:border-[#F27D26] text-gray-700 py-4 rounded-2xl font-black text-sm transition-all active:scale-95 shadow-sm"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
              Entrar com Google
            </button>
            
            <p className="mt-8 text-[10px] text-gray-400 font-bold uppercase tracking-widest">Estado Maior Turma Y</p>
          </motion.div>
        </div>
      )}

      {/* Loading State */}
      {!isAuthReady && (
        <div className="fixed inset-0 bg-[#1B2B3A] z-[110] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-white/20 border-t-[#F27D26] rounded-full animate-spin" />
            <p className="text-white text-[10px] font-black uppercase tracking-widest animate-pulse">Verificando Acesso...</p>
          </div>
        </div>
      )}

      {/* Stats Progress Bar - Mobile Focus */}
      <div className="bg-white border-b border-gray-200 sticky top-[68px] z-30">
        <div className="h-1.5 bg-gray-100 w-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${stats.percentage}%` }}
            className="h-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
          />
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Search & Quick Actions */}
        <div className="space-y-4 mb-8">
          <div className="flex gap-2">
            <div className="relative group flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#F27D26] transition-colors" />
              <input
                type="text"
                placeholder="Buscar por nome, RE ou código..."
                className="w-full pl-12 pr-4 py-4 bg-white border-none rounded-2xl shadow-sm focus:ring-2 focus:ring-[#F27D26] transition-all outline-none text-base font-medium placeholder:text-gray-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
              onClick={() => setIsAddingMember(true)}
              className="p-4 bg-[#F27D26] text-white rounded-2xl shadow-sm hover:bg-[#d66d1e] transition-all"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-2">
            <div className="flex p-1 bg-gray-200/50 rounded-2xl shrink-0">
              {(['all', 'present', 'absent'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] md:text-xs font-black transition-all uppercase tracking-wider",
                    filter === f 
                      ? "bg-[#1B2B3A] text-white shadow-lg" 
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {f === 'all' ? 'Todos' : f === 'present' ? 'Presentes' : 'Ausentes'}
                </button>
              ))}
            </div>

            <div className="flex gap-2 shrink-0">
              <button 
                onClick={selectAll}
                className="p-2 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                title="Selecionar Todos"
              >
                <CheckSquare className="w-5 h-5" />
              </button>
              <button 
                onClick={clearAll}
                className="p-2 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                title="Limpar Tudo"
              >
                <Square className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Member List/Grid */}
        <div className={cn(
          "grid gap-3",
          viewMode === 'grid' 
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" 
            : "grid-cols-1"
        )}>
          <AnimatePresence mode="popLayout">
            {filteredMembers.map((member) => (
              <motion.div
                layout
                key={member.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "group relative transition-all duration-200 select-none active:scale-[0.98]",
                  viewMode === 'grid' 
                    ? "p-5 rounded-[2rem] border-2" 
                    : "p-4 rounded-2xl border-l-4",
                  presence[member.id]?.present
                    ? "bg-white border-green-500 shadow-lg shadow-green-500/5"
                    : "bg-white border-transparent hover:border-gray-200 shadow-sm"
                )}
              >
                <div className={cn(
                  "flex items-center justify-between",
                  viewMode === 'grid' ? "flex-col items-start gap-4" : "flex-row"
                )}>
                  <div className="flex items-center gap-3 w-full">
                    <div 
                      onClick={() => togglePresence(member.id)}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0 cursor-pointer",
                        presence[member.id]?.present ? "bg-green-500 text-white" : "bg-gray-100 text-gray-400"
                      )}
                    >
                      {presence[member.id]?.present ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                    </div>
                    <div className="flex-1 min-w-0" onClick={() => togglePresence(member.id)}>
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[9px] font-black text-[#F27D26] bg-orange-50 px-1.5 py-0.5 rounded">
                          Nº PM {member.re}
                        </span>
                        {(presence[member.id]?.funcao) && (
                          <span className="text-[8px] font-black bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded uppercase">
                            {presence[member.id]?.funcao}
                          </span>
                        )}
                      </div>
                      <h3 className={cn(
                        "font-medium text-sm md:text-base leading-tight uppercase tracking-tight truncate max-w-[200px] sm:max-w-none",
                        presence[member.id]?.present ? "text-green-900" : "text-gray-800"
                      )}>
                        {(() => {
                          const activeWarName = presence[member.id]?.warName || member.warName;
                          if (!activeWarName) return <span>{member.name}</span>;
                          
                          const parts = member.name.split(new RegExp(`(${activeWarName})`, 'gi'));
                          return parts.map((part, i) => 
                            part.toLowerCase() === activeWarName.toLowerCase() ? (
                              <span key={i} className="font-black text-[#F27D26]">{part}</span>
                            ) : (
                              <span key={i}>{part}</span>
                            )
                          );
                        })()}
                      </h3>
                    </div>
                  </div>

                  <div className={cn(
                    "flex items-center gap-2 shrink-0",
                    viewMode === 'grid' ? "w-full justify-end mt-2" : ""
                  )}>
                    {(presence[member.id]?.telefone || member.phone) && (
                      <a 
                        href={`https://wa.me/${(presence[member.id]?.telefone || member.phone || '').replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    )}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingMember(member);
                      }}
                      className="p-2 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] font-mono font-bold text-gray-400 ml-2">
                      *{member.code}*
                    </span>
                  </div>
                </div>

                {/* Status Indicator for List Mode */}
                {viewMode === 'list' && presence[member.id]?.present && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredMembers.length === 0 && (
          <div className="text-center py-24">
            <div className="bg-gray-200 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Info className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Nenhum militar encontrado</h3>
            <p className="text-sm text-gray-500">Verifique os filtros ou a busca.</p>
          </div>
        )}
      </main>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-xl border-t border-gray-100 z-50 md:p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <div className="max-w-6xl mx-auto flex justify-center md:justify-end gap-3">
          <button 
            onClick={copyToWhatsApp}
            className="flex-1 md:flex-none md:px-8 flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-black text-xs md:text-sm transition-all active:scale-95 shadow-xl shadow-green-600/20 uppercase tracking-widest"
          >
            <Share2 className="w-5 h-5" />
            <span className="hidden sm:inline">Compartilhar no </span>WhatsApp
          </button>
          
          <button 
            onClick={() => window.print()}
            className="flex items-center justify-center px-6 bg-[#1B2B3A] text-white rounded-2xl transition-all active:scale-95 shadow-xl shadow-blue-900/20 hover:bg-[#2a4054]"
            title="Imprimir Relatório"
          >
            <ClipboardCheck className="w-6 h-6" />
            <span className="hidden sm:inline ml-2 font-bold text-sm uppercase tracking-wider">Imprimir</span>
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          .fixed, header, .no-print, .bg-white\/80 { display: none !important; }
          main { padding: 0 !important; max-width: 100% !important; }
          .grid { display: block !important; }
          .rounded-2xl, .rounded-\[2rem\] { 
            border-radius: 4px !important; 
            border: 1px solid #ddd !important; 
            margin-bottom: 4px !important; 
            padding: 8px !important;
            page-break-inside: avoid; 
          }
          body { background: white !important; }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Edit/Add Modal */}
      <AnimatePresence>
        {(editingMember || isAddingMember) && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
            <motion.div 
              key="edit-modal"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="bg-[#1B2B3A] p-6 text-white flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight">
                    {isAddingMember ? 'Adicionar Militar' : 'Editar Militar'}
                  </h2>
                  <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mt-1">
                    {isAddingMember ? 'Novo Registro' : editingMember?.name}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setEditingMember(null);
                    setIsAddingMember(false);
                    setIsDeleting(false);
                  }}
                  className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto no-scrollbar">
                {isDeleting ? (
                  <div className="text-center py-8 space-y-6">
                    <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                      <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Confirmar Exclusão</h3>
                      <p className="text-sm text-gray-500 mt-2">Tem certeza que deseja excluir permanentemente o registro de <span className="font-bold text-gray-700">{editingMember?.name}</span>?</p>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setIsDeleting(false)}
                        disabled={isProcessing}
                        className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={() => editingMember && deleteMember(editingMember.id)}
                        disabled={isProcessing}
                        className="flex-1 bg-red-500 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isProcessing ? (
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : null}
                        {isProcessing ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 mb-4">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                        <p className="text-xs text-red-600 font-bold">{error}</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nome Completo</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-[#F27D26] transition-all uppercase"
                        value={editForm.name}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setEditForm(prev => ({ ...prev, name: val }));
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">RE</label>
                        <input 
                          type="text"
                          className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-[#F27D26] transition-all uppercase"
                          value={editForm.re}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setEditForm(prev => ({ ...prev, re: val }));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nº de Curso</label>
                        <input 
                          type="text"
                          className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-[#F27D26] transition-all uppercase"
                          value={editForm.code}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setEditForm(prev => ({ ...prev, code: val }));
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nome de Guerra</label>
                      <input 
                        type="text"
                        placeholder="Ex: SILVA"
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-[#F27D26] transition-all uppercase"
                        value={editForm.warName}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setEditForm(prev => ({ ...prev, warName: val }));
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Função</label>
                      <div className="relative">
                        <select 
                          className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-[#F27D26] transition-all appearance-none"
                          value={FUNCTIONS.includes(editForm.funcao) ? editForm.funcao : (editForm.funcao ? 'OUTRAS' : '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditForm(prev => ({ ...prev, funcao: val }));
                          }}
                        >
                          <option value="">Nenhuma</option>
                          {FUNCTIONS.map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                      
                      {(!FUNCTIONS.includes(editForm.funcao) || editForm.funcao === 'OUTRAS') && (
                        <input 
                          type="text"
                          placeholder="Especifique a função..."
                          className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-[#F27D26] transition-all mt-2"
                          value={editForm.funcao === 'OUTRAS' ? '' : editForm.funcao}
                          onChange={(e) => {
                            setEditForm(prev => ({ ...prev, funcao: e.target.value }));
                          }}
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Telefone (WhatsApp)</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                          type="tel"
                          placeholder="(00) 00000-0000"
                          className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl pl-12 pr-4 py-3 font-bold text-sm outline-none focus:border-[#F27D26] transition-all"
                          value={editForm.telefone}
                          onChange={(e) => {
                            setEditForm(prev => ({ ...prev, telefone: e.target.value }));
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button 
                        onClick={() => {
                          if (isAddingMember) {
                            addMember();
                          } else {
                            updateMember();
                          }
                        }}
                        disabled={isProcessing}
                        className="flex-1 bg-[#F27D26] text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-orange-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isProcessing ? (
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : null}
                        {isAddingMember ? (isProcessing ? 'Adicionando...' : 'Adicionar') : (isProcessing ? 'Salvando...' : 'Concluir')}
                      </button>
                      {!isAddingMember && editingMember && (
                        <button 
                          onClick={() => setIsDeleting(true)}
                          disabled={isProcessing}
                          className="flex-1 bg-red-500 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50"
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
