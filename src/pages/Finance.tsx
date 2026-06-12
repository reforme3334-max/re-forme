import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Wallet, TrendingUp, TrendingDown, Activity, Calendar, ArrowUpRight, ArrowDownRight, FileSpreadsheet, Plus, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/modal';
import * as XLSX from 'xlsx';

export function Finance() {
  const [activeTab, setActiveTab] = useState('recettes');
  const [billings, setBillings] = useState<any[]>([]);
  const [unpaidBillings, setUnpaidBillings] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [dateFilter, setDateFilter] = useState('month'); // 'day', 'exact', 'week', 'month', 'all'
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Modal state
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({ amount: '', category: 'Matériel', description: '', date: new Date().toISOString().split('T')[0] });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettling, setIsSettling] = useState<string | null>(null);

  useEffect(() => {
    fetchFinancialData();
  }, []);

  const fetchFinancialData = async () => {
    setLoading(true);
    
    // Fetch user profile for permissions
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (profile) {
        setUserProfile(profile);
        // Set default tab based on permissions
        const hasRecettes = profile.role === 'admin' || profile.permissions?.includes('finance_recettes');
        if (!hasRecettes) {
          setActiveTab('depenses');
        }
      }
    }

    // Fetch billings (Recettes)
    const { data: billingData, error: bErr } = await supabase
      .from('billings')
      .select('*, patients(nom, prenom), appointments(id, date_heure)')
      .order('date_facturation', { ascending: false });
      
    if (bErr) console.error('Error fetching billings:', bErr);
      
    if (billingData) {
      // payment_status enum is 'En attente', 'Payé', 'Rejeté'
      setBillings(billingData.filter(b => b.statut === 'Payé'));
      setUnpaidBillings(billingData.filter(b => b.statut === 'En attente' || b.statut === 'Impayé' || b.statut === 'Rejeté'));
    } else {
      setBillings([]);
      setUnpaidBillings([]);
    }

    // Fetch expenses (Dépenses)
    const { data: expenseData, error: expenseError } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false });
      
    if (expenseData && !expenseError) {
      setExpenses(expenseData);
    } else {
      // Mock data if table doesn't exist yet
      setExpenses([
        { id: '1', amount: 150, category: 'Matériel', date: new Date().toISOString(), description: 'Bandes élastiques' },
        { id: '2', amount: 1200, category: 'Loyer', date: new Date(Date.now() - 86400000 * 2).toISOString(), description: 'Loyer cabinet' },
        { id: '3', amount: 80, category: 'Logiciel', date: new Date(Date.now() - 86400000 * 5).toISOString(), description: 'Abonnement Doctolib' },
      ]);
    }

    setLoading(false);
  };

  const hasPermission = (permission: string) => {
    if (!userProfile) return false;
    if (userProfile.role === 'admin') return true;
    return userProfile.permissions?.includes(permission);
  };

  // Calculate metrics based on filter
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)); // Monday
  
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const filterByDate = (items: any[], dateExtractor: (item: any) => Date) => {
    if (dateFilter === 'all') return items;
    
    return items.filter(item => {
      const itemDate = dateExtractor(item);
      if (dateFilter === 'day') {
        return itemDate >= today;
      } else if (dateFilter === 'week') {
        return itemDate >= startOfWeek;
      } else if (dateFilter === 'month') {
        return itemDate >= startOfMonth;
      } else if (dateFilter === 'exact') {
        const year = itemDate.getFullYear();
        const month = String(itemDate.getMonth() + 1).padStart(2, '0');
        const day = String(itemDate.getDate()).padStart(2, '0');
        const localDateString = `${year}-${month}-${day}`;
        return localDateString === customDate;
      }
      return true;
    });
  };

  const filteredBillings = filterByDate(billings, (b) => b.appointments?.date_heure ? new Date(b.appointments.date_heure) : new Date(b.date_facturation || new Date()));
  const filteredExpenses = filterByDate(expenses, (e) => new Date(e.date));

  const totalRecettes = filteredBillings.reduce((sum, b) => sum + Number(b.montant), 0);
  const totalUnpaid = unpaidBillings.reduce((sum, b) => sum + Number(b.montant), 0);
  const totalDepenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const caNet = totalRecettes - totalDepenses;
  const totalTransactions = filteredBillings.length;

  const getFilterLabel = () => {
    switch (dateFilter) {
      case 'day': return "Aujourd'hui";
      case 'exact': return new Date(customDate).toLocaleDateString('fr-FR');
      case 'week': return "Cette semaine";
      case 'month': return "Ce mois";
      case 'all': return "Global";
      default: return "";
    }
  };

  const filterLabel = getFilterLabel();

  const exportToExcel = () => {
    const data = filteredBillings.map(bill => {
      const date = bill.appointments?.date_heure ? new Date(bill.appointments.date_heure) : new Date(bill.date_facturation || new Date());
      return {
        'Date': date.toLocaleDateString('fr-FR'),
        'Référence': `FAC-${date.getFullYear()}-${bill.id.substring(0, 4).toUpperCase()}`,
        'Patient': bill.patients ? `${bill.patients.prenom} ${bill.patients.nom}` : 'Client divers',
        'Nature des actes': 'Séance de kinésithérapie',
        'Mode de paiement': bill.type_paiement,
        'Montant': bill.montant
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recettes");
    XLSX.writeFile(wb, `Journal_Recettes_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`);
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { data, error } = await supabase
      .from('expenses')
      .insert([
        { 
          amount: Number(newExpense.amount), 
          category: newExpense.category, 
          description: newExpense.description, 
          date: newExpense.date 
        }
      ])
      .select();

    if (!error && data) {
      setExpenses([data[0], ...expenses]);
      setIsExpenseModalOpen(false);
      setNewExpense({ amount: '', category: 'Matériel', description: '', date: new Date().toISOString().split('T')[0] });
    } else {
      console.error("Error adding expense:", error);
      alert("Erreur lors de l'ajout de la dépense. Assurez-vous que la table 'expenses' existe.");
    }
    
    setIsSubmitting(false);
  };

  const handleSettleBilling = async (billId: string, inputAppId: string | null) => {
    console.log("handleSettleBilling triggered for:", billId, inputAppId);
    
    setIsSettling(billId);
    
    try {
      // 1. Update billing status
      const { data: updatedBillings, error: billError } = await supabase
        .from('billings')
        .update({ 
          statut: 'Payé', 
          date_facturation: new Date().toISOString() 
        })
        .eq('id', billId)
        .select();
        
      if (billError) throw new Error("Erreur mise à jour facture: " + billError.message);
      
      console.log("Billing updated successfully", updatedBillings);

      // 2. Update appointment status if exists
      let appointmentId = inputAppId;
      if (!appointmentId && updatedBillings && updatedBillings.length > 0) {
        appointmentId = updatedBillings[0].appointment_id;
      }

      if (appointmentId) {
        console.log("Updating appointment status for:", appointmentId);
        const { error: apptError } = await supabase
          .from('appointments')
          .update({ statut: 'Effectué' })
          .eq('id', appointmentId);
          
        if (apptError) {
          console.warn("Could not update appointment status:", apptError.message);
        } else {
          console.log("Appointment status updated to Effectué");
        }
      }
      
      // 3. Refresh records without blocking the whole UI if possible
      // but fetchFinancialData uses setLoading(true) internally, let's keep it for now but maybe later refactor
      await fetchFinancialData();
    } catch (error: any) {
      console.error("Settle error details:", error);
      alert("Erreur lors du règlement : " + (error.message || "Erreur inconnue"));
    } finally {
      setIsSettling(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center min-h-[60vh]">
        <Activity className="h-8 w-8 text-primary-500 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tableau de Bord Financier</h1>
          <p className="text-slate-500 mt-1">Suivez vos recettes, vos dépenses et votre chiffre d'affaires net.</p>
        </div>
        <div className="flex items-center gap-2">
          {dateFilter === 'exact' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="p-1.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none shadow-sm"
            />
          )}
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
            <Calendar className="h-4 w-4 text-slate-400 ml-2" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer py-1 pr-8 pl-2 outline-none"
            >
              <option value="day">Aujourd'hui</option>
              <option value="exact">Date exacte</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="all">Tout le temps</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {hasPermission('finance_stats') && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">CA Net ({filterLabel})</CardTitle>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${caNet >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                <Wallet className={`h-4 w-4 ${caNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${caNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{caNet} DH</div>
              <p className="text-xs mt-1 text-slate-500">Recettes - Dépenses</p>
            </CardContent>
          </Card>
          
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Recettes ({filterLabel})</CardTitle>
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-blue-50">
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{totalRecettes} DH</div>
              <p className="text-xs mt-1 text-slate-500">Entrées brutes</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Dépenses ({filterLabel})</CardTitle>
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-orange-50">
                <TrendingDown className="h-4 w-4 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{totalDepenses} DH</div>
              <p className="text-xs mt-1 text-slate-500">Sorties brutes</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm border-t-4 border-t-rose-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Impayés</CardTitle>
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-rose-50">
                <AlertCircle className="h-4 w-4 text-rose-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">{totalUnpaid} DH</div>
              <p className="text-xs mt-1 text-slate-500">À recouvrer</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Transactions ({filterLabel})</CardTitle>
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-indigo-50">
                <Activity className="h-4 w-4 text-indigo-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{totalTransactions}</div>
              <p className="text-xs mt-1 text-slate-500">Nombre de paiements</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        {hasPermission('finance_recettes') && (
          <button
            onClick={() => setActiveTab('recettes')}
            className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'recettes'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Recettes
            </div>
          </button>
        )}
        {hasPermission('finance_recettes') && (
          <button
            onClick={() => setActiveTab('impayer')}
            className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'impayer'
                ? 'border-rose-500 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Impayés
              {unpaidBillings.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                  {unpaidBillings.length}
                </span>
              )}
            </div>
          </button>
        )}
        {(hasPermission('finance_depenses_view') || hasPermission('finance_depenses_edit')) && (
          <button
            onClick={() => setActiveTab('depenses')}
            className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'depenses'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4" />
              Dépenses
            </div>
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {activeTab === 'impayer' && hasPermission('finance_recettes') && (
          <>
            <div className="p-4 border-b border-slate-100 bg-rose-50/30">
              <h3 className="font-semibold text-rose-800">Séances en attente de règlement</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium">Patient</th>
                    <th className="px-6 py-4 font-medium">Mode</th>
                    <th className="px-6 py-4 font-medium text-right">Montant</th>
                    <th className="px-6 py-4 font-medium text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unpaidBillings.length > 0 ? unpaidBillings.map((bill) => {
                    const date = bill.appointments?.date_heure ? new Date(bill.appointments.date_heure) : new Date(bill.date_facturation || new Date());
                    return (
                    <tr key={bill.id} className="hover:bg-rose-50/30 transition-colors">
                      <td className="px-6 py-4 text-slate-600">
                        {date.toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {bill.patients ? `${bill.patients.prenom} ${bill.patients.nom}` : 'Client divers'}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <span className="bg-slate-100 px-2.5 py-1 rounded-md text-xs font-medium">
                          {bill.type_paiement}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-rose-600">
                        {bill.montant} DH
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const appId = bill.appointment_id || (bill.appointments && !Array.isArray(bill.appointments) ? bill.appointments.id : (bill.appointments?.[0]?.id));
                            handleSettleBilling(bill.id, appId);
                          }}
                          disabled={isSettling === bill.id}
                          size="sm"
                          className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs h-8"
                        >
                          {isSettling === bill.id ? "..." : "Régler"}
                        </Button>
                      </td>
                    </tr>
                  )}) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                        Aucun impayé en cours. Félicitations !
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'recettes' && hasPermission('finance_recettes') && (
          <>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-semibold text-slate-800">Historique des Recettes</h3>
              <Button 
                onClick={exportToExcel}
                variant="outline" 
                className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Télécharger le journal (Excel)
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium">Patient</th>
                    <th className="px-6 py-4 font-medium">Mode</th>
                    <th className="px-6 py-4 font-medium">Statut</th>
                    <th className="px-6 py-4 font-medium text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBillings.length > 0 ? filteredBillings.map((bill) => {
                    const date = bill.appointments?.date_heure ? new Date(bill.appointments.date_heure) : new Date(bill.date_facturation || new Date());
                    return (
                    <tr key={bill.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-600">
                        {date.toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {bill.patients ? `${bill.patients.prenom} ${bill.patients.nom}` : 'Client divers'}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <span className="bg-slate-100 px-2.5 py-1 rounded-md text-xs font-medium">
                          {bill.type_paiement}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          bill.statut === 'Payé' || bill.statut === 'Effectué' ? 'bg-emerald-100 text-emerald-700' :
                          bill.statut === 'Impayé' ? 'bg-rose-100 text-rose-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {bill.statut || 'Effectué'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        {bill.montant} DH
                      </td>
                    </tr>
                  )}) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                        Aucune recette enregistrée.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'depenses' && (hasPermission('finance_depenses_view') || hasPermission('finance_depenses_edit')) && (
          <>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-semibold text-slate-800">Historique des Dépenses</h3>
              {hasPermission('finance_depenses_edit') && (
                <Button 
                  onClick={() => setIsExpenseModalOpen(true)}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter une dépense
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium">Catégorie</th>
                    <th className="px-6 py-4 font-medium">Description</th>
                    <th className="px-6 py-4 font-medium text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.length > 0 ? filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-600">
                        {new Date(expense.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-md text-xs font-medium">
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {expense.description}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        - {expense.amount} DH
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                        Aucune dépense enregistrée.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add Expense Modal */}
      <Modal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} title="Ajouter une dépense">
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Date</label>
            <input
              type="date"
              required
              value={newExpense.date}
              onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Catégorie</label>
            <select
              value={newExpense.category}
              onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="Matériel">Matériel & Équipement</option>
              <option value="Loyer">Loyer & Charges</option>
              <option value="Logiciel">Logiciel & Abonnements</option>
              <option value="Salaire">Salaires & Honoraires</option>
              <option value="Autre">Autre</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Description</label>
            <input
              type="text"
              required
              placeholder="Ex: Achat de bandes élastiques"
              value={newExpense.description}
              onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Montant (DH)</label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              placeholder="0.00"
              value={newExpense.amount}
              onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsExpenseModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-orange-500 hover:bg-orange-600 text-white">
              {isSubmitting ? 'Ajout...' : 'Ajouter la dépense'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
