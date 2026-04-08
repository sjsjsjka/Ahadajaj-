/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Terminal, 
  ShieldAlert, 
  Zap, 
  Database, 
  Cpu, 
  Globe, 
  Mail, 
  Loader2, 
  Copy, 
  Check, 
  ChevronRight,
  Activity,
  Lock,
  Unlock,
  User,
  LogOut,
  CreditCard,
  Settings,
  Plus,
  Minus,
  Calculator,
  CheckCircle2,
  XCircle,
  Menu,
  X,
  History,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  db, 
  UserProfile, 
  PaymentRequest 
} from './firebase';
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  serverTimestamp, 
  updateDoc,
  increment,
  Timestamp
} from 'firebase/firestore';

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface IntelResult {
  name: string;
  email: string | null;
  phone: string | null;
  link: string | null;
  category: string;
  details: string;
  source: string;
}

type View = 'scan' | 'pricing' | 'admin' | 'history';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('scan');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Scan States
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<IntelResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [scanStatus, setScanStatus] = useState<string>('');
  const [isDecrypted, setIsDecrypted] = useState(false);

  // Pricing States
  const [targetCount, setTargetCount] = useState(100);
  const [costPerTarget, setCostPerTarget] = useState(0.05); // $0.05 per target cost
  const [sellingPrice, setSellingPrice] = useState(0.15); // $0.15 per target selling price
  const [paymentMethod, setPaymentMethod] = useState<'bkash' | 'nagad' | 'gumroad'>('bkash');
  const [transactionId, setTransactionId] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Admin States
  const [pendingPayments, setPendingPayments] = useState<PaymentRequest[]>([]);

  // Admin: Pending Payments Listener
  useEffect(() => {
    const q = query(
      collection(db, 'payments'),
      where('status', '==', 'pending'),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentRequest));
      setPendingPayments(payments);
    });
    return unsubscribe;
  }, []);

  const exportToCSV = () => {
    if (results.length === 0) return;
    const headers = ["Name", "Email", "Phone", "Link", "Category", "Details", "Source"];
    const csvContent = [
      headers.join(","),
      ...results.map(r => [
        `"${(r.name || '').replace(/"/g, '""')}"`,
        `"${(r.email || '').replace(/"/g, '""')}"`,
        `"${(r.phone || '').replace(/"/g, '""')}"`,
        `"${(r.link || '').replace(/"/g, '""')}"`,
        `"${(r.category || '').replace(/"/g, '""')}"`,
        `"${(r.details || '').replace(/"/g, '""')}"`,
        `"${(r.source || '').replace(/"/g, '""')}"`
      ].join(","))
    ].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `nexus_intel_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const extractIntel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    const countMatch = command.match(/(\d+)/);
    const totalRequested = countMatch ? Math.min(parseInt(countMatch[1]), 500) : 50;

    setLoading(true);
    setError(null);
    setResults([]);
    setIsDecrypted(false);

    let currentResults: IntelResult[] = [];

    const runBatch = async (batchNum: number) => {
      setScanStatus(`Executing Batch ${batchNum}: Scanning Matrix...`);
      try {
        const response = await genAI.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Execute this extraction command: "${command}". 
          IMPORTANT: The user wants a total of ${totalRequested} targets. 
          I currently have ${currentResults.length} targets. Find the NEXT batch of unique targets (aim for 40-50 new ones).
          DO NOT repeat these already found targets: ${currentResults.slice(-15).map(r => r.name).join(', ')}.
          Return JSON array of objects: name, email, phone, link, category, details, source.`,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  email: { type: Type.STRING, nullable: true },
                  phone: { type: Type.STRING, nullable: true },
                  link: { type: Type.STRING, nullable: true },
                  category: { type: Type.STRING },
                  details: { type: Type.STRING },
                  source: { type: Type.STRING }
                },
                required: ["name", "category", "details", "source"]
              }
            }
          },
        });

        const text = response.text;
        if (text) {
          const data = JSON.parse(text) as IntelResult[];
          if (data.length === 0) return false;
          currentResults = [...currentResults, ...data];
          setResults([...currentResults]);
          setIsDecrypted(true);
          return data.length > 0;
        }
        return false;
      } catch (err) {
        console.error(`Batch ${batchNum} failed:`, err);
        return false;
      }
    };

    try {
      let batch = 1;
      let hasMore = true;
      while (currentResults.length < totalRequested && hasMore && batch <= 10) {
        hasMore = await runBatch(batch);
        batch++;
        if (currentResults.length >= totalRequested) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (currentResults.length === 0) {
        throw new Error("Matrix connection lost. No data returned.");
      }
    } catch (err: any) {
      setError("CRITICAL ERROR: Matrix extraction failed. The niche might be too obscure or the firewall is too strong.");
    } finally {
      setLoading(false);
      setScanStatus('');
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) return;

    setPaymentLoading(true);
    try {
      await addDoc(collection(db, 'payments'), {
        email: 'anonymous@nexus.intel',
        amount: targetCount * sellingPrice,
        credits: targetCount,
        method: paymentMethod,
        transactionId: transactionId,
        status: 'pending',
        timestamp: serverTimestamp()
      });
      setPaymentSuccess(true);
      setTransactionId('');
      setTimeout(() => setPaymentSuccess(false), 5000);
    } catch (err) {
      setError("Payment submission failed.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const approvePayment = async (payment: PaymentRequest) => {
    try {
      // Update payment status
      await updateDoc(doc(db, 'payments', payment.id), {
        status: 'approved'
      });
      // Add credits to user
      await updateDoc(doc(db, 'users', payment.uid), {
        credits: increment(payment.credits)
      });
    } catch (err) {
      setError("Failed to approve payment.");
    }
  };

  const rejectPayment = async (paymentId: string) => {
    try {
      await updateDoc(doc(db, 'payments', paymentId), {
        status: 'rejected'
      });
    } catch (err) {
      setError("Failed to reject payment.");
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const totalCost = targetCount * costPerTarget;
  const totalRevenue = targetCount * sellingPrice;
  const totalProfit = totalRevenue - totalCost;

  return (
    <div className="min-h-screen bg-[#050505] text-[#00ff9d] font-sans selection:bg-[#00ff9d]/30 overflow-x-hidden">
      {/* Matrix Background */}
      <div className="fixed inset-0 pointer-events-none opacity-10 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#00ff9d]/10 via-transparent to-transparent"></div>
        <div className="grid grid-cols-6 md:grid-cols-12 h-full w-full">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="border-r border-[#00ff9d]/5 h-full"></div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative z-50 border-b border-[#00ff9d]/20 bg-black/80 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('scan')}>
            <Database className="w-6 h-6 text-[#00ff9d]" />
            <h1 className="text-xl font-black tracking-tighter uppercase italic hidden sm:block">Nexus Intel</h1>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => setCurrentView('scan')} className={`text-xs font-bold tracking-widest uppercase transition-colors ${currentView === 'scan' ? 'text-[#00ff9d]' : 'text-[#00ff9d]/40 hover:text-[#00ff9d]'}`}>Scan</button>
            <button onClick={() => setCurrentView('pricing')} className={`text-xs font-bold tracking-widest uppercase transition-colors ${currentView === 'pricing' ? 'text-[#00ff9d]' : 'text-[#00ff9d]/40 hover:text-[#00ff9d]'}`}>Pricing</button>
            <button onClick={() => setCurrentView('admin')} className={`text-xs font-bold tracking-widest uppercase transition-colors ${currentView === 'admin' ? 'text-[#00ff9d]' : 'text-[#00ff9d]/40 hover:text-[#00ff9d]'}`}>Admin</button>
          </div>

          {/* Mobile Menu Toggle */}
          <button className="md:hidden p-2" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-[#00ff9d]/10 bg-black overflow-hidden"
            >
              <div className="p-6 flex flex-col gap-6">
                <button onClick={() => { setCurrentView('scan'); setIsMenuOpen(false); }} className="text-left text-lg font-bold">Scan</button>
                <button onClick={() => { setCurrentView('pricing'); setIsMenuOpen(false); }} className="text-left text-lg font-bold">Pricing</button>
                <button onClick={() => { setCurrentView('admin'); setIsMenuOpen(false); }} className="text-left text-lg font-bold">Admin</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-16">
        
        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between text-red-500"
            >
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-5 h-5" />
                <span className="text-sm font-bold">{error}</span>
              </div>
              <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {currentView === 'scan' && (
          <div className="max-w-5xl mx-auto">
            {/* Hero Section */}
            <div className="mb-12 text-center md:text-left">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00ff9d]/10 border border-[#00ff9d]/20 text-[10px] font-bold tracking-widest uppercase mb-6"
              >
                <Activity className="w-3 h-3" />
                Neural Extraction Engine v4.0
              </motion.div>
              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-7xl font-black mb-6 uppercase tracking-tighter italic leading-none"
              >
                Matrix <span className="text-white">Uplink</span>
              </motion.h2>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-[#00ff9d]/60 max-w-2xl mx-auto md:mx-0 text-sm md:text-base leading-relaxed"
              >
                Execute deep-matrix scans to extract business intelligence. Our neural network bypasses regional firewalls to decrypt high-value contact metadata in real-time.
              </motion.p>
            </div>

            {/* Search Terminal */}
            <motion.form 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              onSubmit={extractIntel}
              className="relative group mb-16"
            >
              <div className="absolute -inset-1 bg-[#00ff9d]/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
              <div className="relative bg-black border border-[#00ff9d]/20 rounded-2xl overflow-hidden flex flex-col md:flex-row">
                <div className="flex-1 flex items-center p-4 md:p-6">
                  <Terminal className="w-6 h-6 text-[#00ff9d]/40 mr-4 shrink-0" />
                  <input
                    type="text"
                    placeholder="E.G. SCRAP 100 REAL ESTATE BUSINESSES IN NEW YORK..."
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 w-full text-lg md:text-xl font-bold placeholder:text-[#00ff9d]/10 outline-none uppercase tracking-wider"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !command.trim()}
                  className="bg-[#00ff9d] text-black px-8 py-4 md:py-0 font-black uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6 fill-current" />}
                  <span>Execute</span>
                </button>
              </div>
            </motion.form>

            {/* Loading Progress */}
            <AnimatePresence>
              {loading && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="mb-16 p-8 border border-[#00ff9d]/20 bg-[#00ff9d]/5 rounded-2xl relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 h-1 bg-[#00ff9d] w-full animate-pulse"></div>
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="relative">
                      <div className="w-20 h-20 border-4 border-[#00ff9d]/10 border-t-[#00ff9d] rounded-full animate-spin"></div>
                      <Cpu className="absolute inset-0 m-auto w-8 h-8 text-[#00ff9d] animate-pulse" />
                    </div>
                    <div className="text-center md:text-left">
                      <h3 className="text-2xl font-black mb-2 tracking-widest uppercase">Scanning Matrix</h3>
                      <p className="text-[#00ff9d]/60 text-sm font-mono animate-pulse">{scanStatus || "Initializing neural protocols..."}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results */}
            {results.length > 0 && (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#00ff9d]/20 pb-6">
                  <div className="flex items-center gap-3">
                    <Unlock className="w-6 h-6" />
                    <h3 className="text-2xl font-black uppercase tracking-widest">Intel Decrypted</h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={exportToCSV}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-[#00ff9d]/10 border border-[#00ff9d]/20 rounded-xl text-xs font-black hover:bg-[#00ff9d]/20 transition-colors"
                    >
                      <Database className="w-4 h-4" />
                      EXPORT CSV
                    </button>
                    <div className="text-right">
                      <div className="text-[10px] text-[#00ff9d]/40 uppercase tracking-widest">Total Targets</div>
                      <div className="text-xl font-black">{results.length}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {results.map((target, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group relative bg-black/40 border border-[#00ff9d]/10 rounded-2xl p-6 hover:border-[#00ff9d]/40 transition-all"
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-8">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <h4 className="text-xl font-black uppercase tracking-tight">{target.name}</h4>
                            <span className="text-[10px] bg-[#00ff9d]/10 px-2 py-0.5 rounded-full border border-[#00ff9d]/20 text-[#00ff9d]/60 font-bold uppercase">
                              {target.category}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-6 text-xs text-[#00ff9d]/60">
                            <div className="flex items-center gap-2">
                              <ChevronRight className="w-3 h-3" />
                              <span>{target.details}</span>
                            </div>
                            {target.link && (
                              <a href={target.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-[#00ff9d] transition-colors">
                                <Globe className="w-3 h-3" />
                                <span>{new URL(target.link).hostname.replace('www.', '')}</span>
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="md:w-1/3 space-y-3">
                          <div className="bg-black/60 border border-[#00ff9d]/10 p-3 rounded-xl flex items-center gap-3 group/item">
                            <Mail className="w-4 h-4 text-[#00ff9d]/40 group-hover/item:text-[#00ff9d] transition-colors" />
                            <span className="text-sm font-bold truncate flex-1">{target.email || "ENCRYPTED"}</span>
                            {target.email && (
                              <button onClick={() => copyToClipboard(target.email!, idx)} className="p-2 hover:bg-[#00ff9d]/10 rounded-lg transition-colors">
                                {copiedIndex === idx ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                          {target.phone && (
                            <div className="bg-black/60 border border-[#00ff9d]/10 p-3 rounded-xl flex items-center gap-3">
                              <Zap className="w-4 h-4 text-[#00ff9d]/40" />
                              <span className="text-sm font-bold truncate flex-1">{target.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State Info */}
            {results.length === 0 && !loading && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                {[
                  { icon: Cpu, title: "Neural Scan", desc: "Advanced AI algorithms identifying high-value targets across the global matrix." },
                  { icon: Globe, title: "Global Nodes", desc: "Accessing decentralized data points to bypass regional information firewalls." },
                  { icon: ShieldCheck, title: "Secure Intel", desc: "Encrypted data extraction protocols ensuring high-fidelity business metadata." }
                ].map((item, i) => (
                  <div key={i} className="p-8 bg-[#00ff9d]/5 border border-[#00ff9d]/10 rounded-3xl hover:bg-[#00ff9d]/10 transition-colors group">
                    <item.icon className="w-10 h-10 mb-6 text-[#00ff9d]/40 group-hover:text-[#00ff9d] transition-colors" />
                    <h4 className="text-lg font-black uppercase tracking-widest mb-3">{item.title}</h4>
                    <p className="text-xs text-[#00ff9d]/40 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentView === 'pricing' && (
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter italic mb-6">Credit <span className="text-white">Matrix</span></h2>
              <p className="text-[#00ff9d]/60 max-w-2xl mx-auto">Purchase credits to unlock deep-matrix extraction capabilities. Credits are valid for all niches and extraction types.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              {/* Credit Packages for Users */}
              <div className="lg:col-span-7 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { name: "Starter", credits: 100, price: 15, desc: "Perfect for small research tasks." },
                    { name: "Professional", credits: 500, price: 60, desc: "Ideal for growing businesses." },
                    { name: "Enterprise", credits: 2000, price: 200, desc: "Full-scale matrix extraction." },
                    { name: "Custom", credits: targetCount, price: totalRevenue, desc: "Tailored to your specific needs.", isCustom: true }
                  ].map((pkg, i) => (
                    <div 
                      key={i} 
                      onClick={() => pkg.isCustom ? null : setTargetCount(pkg.credits)}
                      className={`p-8 rounded-3xl border transition-all cursor-pointer ${targetCount === pkg.credits ? 'bg-[#00ff9d]/10 border-[#00ff9d]' : 'bg-[#00ff9d]/5 border-[#00ff9d]/10 hover:border-[#00ff9d]/30'}`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="text-xl font-black uppercase italic">{pkg.name}</h4>
                        <div className="text-2xl font-black text-white">${pkg.price.toFixed(0)}</div>
                      </div>
                      <div className="text-3xl font-black mb-2">{pkg.credits} <span className="text-xs text-[#00ff9d]/40 uppercase tracking-widest">Credits</span></div>
                      <p className="text-xs text-[#00ff9d]/40 leading-relaxed mb-6">{pkg.desc}</p>
                      {pkg.isCustom && (
                        <input 
                          type="range" 
                          min="50" 
                          max="5000" 
                          step="50" 
                          value={targetCount} 
                          onChange={(e) => setTargetCount(parseInt(e.target.value))}
                          className="w-full accent-[#00ff9d] bg-[#00ff9d]/10 h-2 rounded-full appearance-none cursor-pointer"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Form */}
              <div className="lg:col-span-5">
                <div className="p-8 bg-black border border-[#00ff9d]/20 rounded-3xl sticky top-24">
                  <div className="flex items-center gap-3 mb-8">
                    <CreditCard className="w-6 h-6" />
                    <h3 className="text-xl font-black uppercase tracking-widest">Acquire Credits</h3>
                  </div>

                  <form onSubmit={handlePaymentSubmit} className="space-y-6">
                    <div className="grid grid-cols-3 gap-3">
                      {['bkash', 'nagad', 'gumroad'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPaymentMethod(m as any)}
                          className={`py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${paymentMethod === m ? 'bg-[#00ff9d] text-black border-[#00ff9d]' : 'bg-black text-[#00ff9d]/40 border-[#00ff9d]/10 hover:border-[#00ff9d]/40'}`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>

                    <div className="p-4 bg-[#00ff9d]/5 border border-[#00ff9d]/10 rounded-2xl">
                      <div className="text-[10px] text-[#00ff9d]/40 uppercase mb-2">Payment Instructions</div>
                      <p className="text-xs leading-relaxed">
                        {paymentMethod === 'gumroad' ? 
                          "Click the link below to pay via Gumroad. Once paid, enter your receipt ID below." : 
                          `Send ${totalRevenue.toFixed(2)} USD equivalent to our ${paymentMethod} merchant number: +8801XXXXXXXXX. Enter the Transaction ID below for verification.`
                        }
                      </p>
                      {paymentMethod === 'gumroad' && (
                        <a href="https://gumroad.com" target="_blank" className="inline-block mt-3 text-[#00ff9d] text-xs font-bold underline">Open Gumroad Checkout</a>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] text-[#00ff9d]/40 uppercase mb-2">Transaction ID / Receipt ID</label>
                      <input 
                        type="text" 
                        required
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        placeholder="ENTER TXID..."
                        className="w-full bg-black border border-[#00ff9d]/20 rounded-xl px-4 py-3 text-sm font-bold focus:border-[#00ff9d] outline-none transition-colors uppercase"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={paymentLoading}
                      className="w-full bg-[#00ff9d] text-black py-4 rounded-xl font-black uppercase tracking-widest hover:scale-[1.02] transition-transform disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      {paymentLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-current" />}
                      <span>Submit for Approval</span>
                    </button>
                    
                    {paymentSuccess && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 bg-[#00ff9d]/10 border border-[#00ff9d] rounded-xl flex items-center gap-3 text-[#00ff9d]"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-xs font-bold uppercase">Request submitted! Admin will approve shortly.</span>
                      </motion.div>
                    )}
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'admin' && (
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-5xl font-black uppercase tracking-tighter italic">Admin <span className="text-white">Panel</span></h2>
              <div className="bg-[#00ff9d]/10 border border-[#00ff9d]/20 px-4 py-2 rounded-xl">
                <span className="text-[10px] text-[#00ff9d]/40 uppercase block">Pending Requests</span>
                <span className="text-2xl font-black">{pendingPayments.length}</span>
              </div>
            </div>

            {/* Profit Calculator (Admin Only) */}
            <div className="mb-12 p-8 bg-[#00ff9d]/5 border border-[#00ff9d]/20 rounded-3xl">
              <div className="flex items-center gap-3 mb-8">
                <Calculator className="w-6 h-6" />
                <h3 className="text-xl font-black uppercase tracking-widest">Internal Profit Calculator</h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <div>
                    <div className="flex justify-between items-end mb-4">
                      <label className="text-xs font-bold uppercase tracking-widest text-[#00ff9d]/40">Simulation Volume</label>
                      <span className="text-3xl font-black">{targetCount} <span className="text-sm text-[#00ff9d]/40">Targets</span></span>
                    </div>
                    <input 
                      type="range" 
                      min="50" 
                      max="5000" 
                      step="50" 
                      value={targetCount} 
                      onChange={(e) => setTargetCount(parseInt(e.target.value))}
                      className="w-full accent-[#00ff9d] bg-[#00ff9d]/10 h-2 rounded-full appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-[#00ff9d]/40 mb-3">My Actual Cost ($)</label>
                      <div className="flex items-center gap-4">
                        <button onClick={() => setCostPerTarget(Math.max(0.01, costPerTarget - 0.01))} className="p-2 border border-[#00ff9d]/20 rounded-lg hover:bg-[#00ff9d]/10"><Minus className="w-4 h-4" /></button>
                        <span className="text-xl font-black w-20 text-center">${costPerTarget.toFixed(2)}</span>
                        <button onClick={() => setCostPerTarget(costPerTarget + 0.01)} className="p-2 border border-[#00ff9d]/20 rounded-lg hover:bg-[#00ff9d]/10"><Plus className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-[#00ff9d]/40 mb-3">Selling Price ($)</label>
                      <div className="flex items-center gap-4">
                        <button onClick={() => setSellingPrice(Math.max(0.01, sellingPrice - 0.01))} className="p-2 border border-[#00ff9d]/20 rounded-lg hover:bg-[#00ff9d]/10"><Minus className="w-4 h-4" /></button>
                        <span className="text-xl font-black w-20 text-center">${sellingPrice.toFixed(2)}</span>
                        <button onClick={() => setSellingPrice(sellingPrice + 0.01)} className="p-2 border border-[#00ff9d]/20 rounded-lg hover:bg-[#00ff9d]/10"><Plus className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 bg-black/40 p-6 rounded-2xl border border-[#00ff9d]/10">
                  <div className="text-center">
                    <div className="text-[10px] text-[#00ff9d]/40 uppercase mb-1">Total Cost</div>
                    <div className="text-xl font-black text-white">${totalCost.toFixed(2)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-[#00ff9d]/40 uppercase mb-1">Revenue</div>
                    <div className="text-xl font-black text-white">${totalRevenue.toFixed(2)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-[#00ff9d]/40 uppercase mb-1">Net Profit</div>
                    <div className="text-2xl font-black text-[#00ff9d]">${totalProfit.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {pendingPayments.length === 0 ? (
                <div className="p-20 border-2 border-dashed border-[#00ff9d]/10 rounded-3xl flex flex-col items-center justify-center text-[#00ff9d]/20">
                  <History className="w-16 h-16 mb-4" />
                  <p className="text-xl font-black uppercase tracking-widest">No pending payments</p>
                </div>
              ) : (
                pendingPayments.map((p) => (
                  <motion.div 
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 bg-black border border-[#00ff9d]/20 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-8"
                  >
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <span className="text-[10px] text-[#00ff9d]/40 uppercase block mb-1">User</span>
                        <span className="text-sm font-bold block truncate">{p.email}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#00ff9d]/40 uppercase block mb-1">Amount / Credits</span>
                        <span className="text-sm font-bold block">${p.amount.toFixed(2)} / {p.credits}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#00ff9d]/40 uppercase block mb-1">Method</span>
                        <span className="text-sm font-bold block uppercase">{p.method}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#00ff9d]/40 uppercase block mb-1">Transaction ID</span>
                        <span className="text-sm font-bold block truncate text-white">{p.transactionId}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => approvePayment(p)}
                        className="flex-1 md:flex-none bg-[#00ff9d] text-black px-6 py-3 rounded-xl font-black uppercase text-xs hover:scale-105 transition-transform flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Approve
                      </button>
                      <button 
                        onClick={() => rejectPayment(p.id)}
                        className="flex-1 md:flex-none bg-red-500/10 text-red-500 border border-red-500/20 px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-red-500/20 transition-colors flex items-center gap-2"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        )}

      </main>

      <footer className="relative z-10 py-12 border-t border-[#00ff9d]/10 bg-black/50 mt-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4 text-[10px] tracking-[0.3em] uppercase font-bold text-[#00ff9d]/40">
            <span>&copy; NEXUS_INTEL_SYSTEM</span>
            <span className="w-1 h-1 bg-[#00ff9d]/40 rounded-full"></span>
            <span>VER_5.0.0_PRODUCTION</span>
          </div>
          <div className="flex gap-8">
            {['LOGS', 'NODES', 'PROTOCOLS', 'UPLINK'].map((item) => (
              <button key={item} className="text-[10px] font-black tracking-widest hover:text-white transition-colors uppercase">
                {item}
              </button>
            ))}
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          background: #00ff9d;
          border-radius: 50%;
          cursor: pointer;
          border: 4px solid #050505;
          box-shadow: 0 0 10px rgba(0, 255, 157, 0.5);
        }
      `}</style>
    </div>
  );
}
