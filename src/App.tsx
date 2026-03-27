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
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MILITARY_MEMBERS } from './constants';
import { cn } from './lib/utils';
import { db, auth } from './firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  serverTimestamp, 
  getDocFromServer
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
  const [searchTerm, setSearchTerm] = useState('');
  const [presence, setPresence] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!isAuthReady) return;

    const path = 'attendance';
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      const newPresence: Record<number, boolean> = {};
      snapshot.docs.forEach((doc) => {
        newPresence[Number(doc.id)] = doc.data().present;
      });
      setPresence(newPresence);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  const togglePresence = async (id: number) => {
    if (!user) return;
    
    const path = `attendance/${id}`;
    const isCurrentlyPresent = !!presence[id];
    
    try {
      await setDoc(doc(db, 'attendance', String(id)), {
        present: !isCurrentlyPresent,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const selectAll = async () => {
    if (!user) return;
    
    // In a real app, we might want to use a batch, but for simplicity:
    for (const member of MILITARY_MEMBERS) {
      if (!presence[member.id]) {
        try {
          await setDoc(doc(db, 'attendance', String(member.id)), {
            present: true,
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          console.error(`Error selecting ${member.id}:`, err);
        }
      }
    }
  };

  const clearAll = async () => {
    if (!user) return;
    
    for (const member of MILITARY_MEMBERS) {
      if (presence[member.id]) {
        try {
          await setDoc(doc(db, 'attendance', String(member.id)), {
            present: false,
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          console.error(`Error clearing ${member.id}:`, err);
        }
      }
    }
  };

  const filteredMembers = useMemo(() => {
    return MILITARY_MEMBERS.filter(member => {
      const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           member.re.includes(searchTerm) ||
                           member.code.includes(searchTerm);
      
      const isPresent = presence[member.id];
      const matchesFilter = filter === 'all' || 
                           (filter === 'present' && isPresent) || 
                           (filter === 'absent' && !isPresent);
      
      return matchesSearch && matchesFilter;
    });
  }, [searchTerm, presence, filter]);

  const stats = useMemo(() => {
    const total = MILITARY_MEMBERS.length;
    const presentCount = Object.values(presence).filter(Boolean).length;
    const absentCount = total - presentCount;
    const percentage = Math.round((presentCount / total) * 100);
    return { total, presentCount, absentCount, percentage };
  }, [presence]);

  const copyToWhatsApp = () => {
    const presentList = MILITARY_MEMBERS
      .filter(m => presence[m.id])
      .map((m, i) => `${i + 1}- Nº PM: ${m.re} | ${m.name} ${m.role ? `(${m.role})` : ''} *${m.code}*`)
      .join('\n');
    
    const absentList = MILITARY_MEMBERS
      .filter(m => !presence[m.id])
      .map((m, i) => `${i + 1}- ${m.name}`)
      .join('\n');

    const text = `*PRESENÇA TURMA Y*\n*Data:* ${new Date().toLocaleDateString('pt-BR')}\n\n*RESUMO:*\n✅ *Presentes:* ${stats.presentCount}\n❌ *Ausentes:* ${stats.absentCount}\n📊 *Total:* ${stats.total}\n\n*LISTA DE PRESENTES:*\n${presentList || '_Nenhum militar presente._'}\n\n*LISTA DE AUSENTES:*\n${absentList || '_Nenhum militar ausente._'}`;
    
    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encodedText}`, '_blank');
    
    // Also copy to clipboard as fallback
    navigator.clipboard.writeText(text);
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
              <div className="bg-[#F27D26] p-2 rounded-xl shadow-lg">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-black tracking-tight uppercase">Turma Y</h1>
                <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest opacity-80">Controle de Presença</p>
              </div>
              <div className="sm:hidden">
                <h1 className="text-lg font-black uppercase">Turma Y</h1>
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
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#F27D26] transition-colors" />
            <input
              type="text"
              placeholder="Buscar por nome, RE ou código..."
              className="w-full pl-12 pr-4 py-4 bg-white border-none rounded-2xl shadow-sm focus:ring-2 focus:ring-[#F27D26] transition-all outline-none text-base font-medium placeholder:text-gray-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
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
                onClick={() => togglePresence(member.id)}
                className={cn(
                  "group relative transition-all duration-200 select-none active:scale-[0.98] cursor-pointer",
                  viewMode === 'grid' 
                    ? "p-5 rounded-[2rem] border-2" 
                    : "p-4 rounded-2xl border-l-4",
                  presence[member.id]
                    ? "bg-white border-green-500 shadow-lg shadow-green-500/5"
                    : "bg-white border-transparent hover:border-gray-200 shadow-sm"
                )}
              >
                <div className={cn(
                  "flex items-center justify-between",
                  viewMode === 'grid' ? "flex-col items-start gap-4" : "flex-row"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0",
                      presence[member.id] ? "bg-green-500 text-white" : "bg-gray-100 text-gray-400"
                    )}>
                      {presence[member.id] ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-black text-[#F27D26] bg-orange-50 px-1.5 py-0.5 rounded">
                          Nº PM {member.re}
                        </span>
                        {member.role && (
                          <span className="text-[8px] font-black bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded uppercase">
                            {member.role}
                          </span>
                        )}
                      </div>
                      <h3 className={cn(
                        "font-black text-sm md:text-base leading-tight uppercase tracking-tight",
                        presence[member.id] ? "text-green-900" : "text-gray-800"
                      )}>
                        {member.name}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-gray-400">
                      *{member.code}*
                    </span>
                  </div>
                </div>

                {/* Status Indicator for List Mode */}
                {viewMode === 'list' && presence[member.id] && (
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

      {/* Mobile Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-xl border-t border-gray-100 z-50 md:p-6">
        <div className="max-w-xl mx-auto flex gap-3">
          <button 
            onClick={copyToWhatsApp}
            className="flex-1 flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-black text-xs md:text-sm transition-all active:scale-95 shadow-xl shadow-green-600/20 uppercase tracking-widest"
          >
            <Share2 className="w-5 h-5" />
            WhatsApp
          </button>
          
          <button 
            onClick={() => window.print()}
            className="flex items-center justify-center px-6 bg-[#1B2B3A] text-white rounded-2xl transition-all active:scale-95 shadow-xl shadow-blue-900/20"
            title="Imprimir Relatório"
          >
            <ClipboardCheck className="w-6 h-6" />
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
    </div>
  );
}
