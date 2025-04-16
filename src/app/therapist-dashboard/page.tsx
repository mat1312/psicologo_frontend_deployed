'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter 
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiClient } from '@/lib/apiClient'
import { toast } from 'sonner'
import { 
  Users, 
  BarChart4, 
  BrainCircuit,
  Microscope,
  Search,
  Filter,
  CalendarDays,
  Clock,
  UserCircle,
  FileEdit,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  BadgeInfo,
  PlusCircle,
  Brain,
  HeartPulse,
  Sparkles,
  LogOut
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

// Interfaccia per i dati del paziente
interface Patient {
  id: string
  email: string
  first_name?: string
  last_name?: string
  created_at: string
  last_session?: string
  sessions_count?: number
  status?: 'active' | 'inactive'
  note?: string
  sessions?: Array<{
    id: string
    created_at: string
    last_updated: string
    title?: string
  }>
}

export default function TherapistDashboardPage() { 
  const { user, loading, signOut } = useAuthStore()
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [sessionSummary, setSessionSummary] = useState<string>('')
  const [moodAnalysis, setMoodAnalysis] = useState<string>('')
  const [pathologyAnalysis, setPathologyAnalysis] = useState<any>(null)
  const [editingNote, setEditingNote] = useState(false)
  const [patientNote, setPatientNote] = useState('')
  const [stats, setStats] = useState({
    totalPatients: 0,
    activePatientsPercent: 0,
    totalSessions: 0,
    avgSessionsPerPatient: 0
  })
  const [isLoading, setIsLoading] = useState({
    patients: false,
    summary: false,
    mood: false,
    pathology: false,
    saveNote: false
  })

  useEffect(() => {
    // Reindirizza se l'utente non è autenticato o non è un terapeuta
    if (!loading) {
      if (!user) {
        router.push('/login')
      } else if (user.role !== 'therapist') {
        router.push('/patient-dashboard')
      } else {
        // Debug info
        console.log('User authenticated:', { 
          id: user.id,
          role: user.role,
          idType: typeof user.id
        })
        
        // Per verificare direttamente la tabella therapist_patients
        supabase
          .from('therapist_patients')
          .select('*')
          .then(({ data, error }) => {
            console.log('DEBUG - Tutti i record therapist_patients:', data, 'Error:', error)
          })
        
        // Carica i pazienti
        fetchPatients()
      }
    }
  }, [user, loading, router])

  useEffect(() => {
    if (patients.length > 0) {
      filterPatients()
    }
  }, [searchQuery, statusFilter, patients])

  const filterPatients = () => {
    let filtered = [...patients]

    // Filtra per query di ricerca
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(patient => 
        (patient.first_name?.toLowerCase().includes(query) || false) || 
        (patient.last_name?.toLowerCase().includes(query) || false) || 
        patient.email.toLowerCase().includes(query)
      )
    }

    // Filtra per stato
    if (statusFilter !== 'all') {
      filtered = filtered.filter(patient => patient.status === statusFilter)
    }

    setFilteredPatients(filtered)
  }

  const fetchPatients = async () => {
    setIsLoading(prev => ({ ...prev, patients: true }))
    try {
      console.log('fetchPatients - inizio', 'user ID:', user?.id, 'Tipo:', typeof user?.id)
      
      // Tentativo di recupero diretto da Supabase
      console.log('1. Tentativo di recupero diretto da Supabase')
      const { data: allRelationships, error: allRelError } = await supabase
        .from('therapist_patients')
        .select('*')
      
      console.log('DEBUG - Tutte le relazioni:', allRelationships, 'Error:', allRelError)
      
      // 2. Se i dati Supabase non funzionano, prova l'API server (bypass RLS)
      if (!allRelationships || allRelationships.length === 0) {
        console.log('2. Supabase non ha trovato relazioni, provo API server...')
        try {
          // Recupera le relazioni dall'API server che fa il bypass di RLS
          const response = await fetch('/api/debug/get-profiles', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          })
          
          if (response.ok) {
            const serverData = await response.json()
            console.log('DEBUG - Dati dal server (bypass RLS):', serverData)
            
            // Se abbiamo ottenuto le relazioni dal server
            if (serverData.relations && serverData.relations.length > 0) {
              // Filtra le relazioni per trovare quelle relative a questo terapeuta
              const myRelations = serverData.relations.filter(
                (rel: any) => rel?.therapist_id === user?.id
              )
              
              console.log('Relazioni dal server per questo terapeuta:', myRelations)
              
              if (myRelations.length > 0) {
                // Estrai gli ID dei pazienti
                const patientIds = myRelations.map((rel: any) => rel.patient_id)
                console.log('IDs dei pazienti associati:', patientIds)
                
                // Ottieni i profili dei pazienti dal server
                const patientProfiles = serverData.profiles.filter(
                  (profile: any) => patientIds.includes(profile.id) && profile.role === 'patient'
                )
                
                console.log('Profili dei pazienti:', patientProfiles)
                
                // Continua con il recupero delle sessioni per ogni paziente
                const patientsWithSessions = await Promise.all(
                  patientProfiles.map(async (patient: any) => {
                    const { data: sessions, error: sessionsError } = await supabase
                      .from('chat_sessions')
                      .select('*')
                      .eq('patient_id', patient.id)
                      .order('last_updated', { ascending: false })
                    
                    console.log(`Sessioni per paziente ${patient.id}:`, sessions)
                    
                    // Ottieni la nota relativa al paziente
                    const { data: notes, error: notesError } = await supabase
                      .from('patient_notes')
                      .select('*')
                      .eq('patient_id', patient.id)
                      
                    console.log(`Note per paziente ${patient.id}:`, notes && notes.length > 0 ? notes[0] : null, 'Errore:', notesError)
                    
                    // Se non troviamo note con query diretta, proviamo a usare l'API server
                    let patientNote = '';
                    if (notesError || !notes || notes.length === 0) {
                      try {
                        // Prova a recuperare le note dal server (bypass RLS)
                        const response = await fetch(`/api/debug/get-note?patient_id=${patient.id}`, {
                          method: 'GET',
                          headers: { 'Content-Type': 'application/json' }
                        });
                        
                        if (response.ok) {
                          const noteData = await response.json();
                          console.log(`Note (via server) per paziente ${patient.id}:`, noteData);
                          patientNote = noteData.note?.content || '';
                        }
                      } catch (serverError) {
                        console.error(`Errore recupero note dal server per paziente ${patient.id}:`, serverError);
                      }
                    } else {
                      patientNote = notes[0]?.content || '';
                    }
                    
                    const sessionsData = sessionsError ? [] : sessions || []
                    const lastSessionDate = sessionsData[0]?.last_updated || null
                    
                    // Determina lo stato del paziente
                    const isActive = lastSessionDate ? 
                      (new Date().getTime() - new Date(lastSessionDate).getTime()) < 30 * 24 * 60 * 60 * 1000 
                      : false
                    
                    return {
                      ...patient,
                      sessions: sessionsData,
                      sessions_count: sessionsData.length,
                      last_session: lastSessionDate,
                      status: isActive ? 'active' : 'inactive',
                      note: patientNote
                    }
                  })
                )
                
                console.log('Pazienti con sessioni:', patientsWithSessions)
                
                // Calcola le statistiche
                const totalPatients = patientsWithSessions.length
                const activePatients = patientsWithSessions.filter(p => p.status === 'active').length
                const totalSessions = patientsWithSessions.reduce((acc, p) => acc + (p.sessions_count || 0), 0)
                
                setStats({
                  totalPatients,
                  activePatientsPercent: totalPatients > 0 ? Math.round((activePatients / totalPatients) * 100) : 0,
                  totalSessions,
                  avgSessionsPerPatient: totalPatients > 0 ? Math.round(totalSessions / totalPatients * 10) / 10 : 0
                })
                
                setPatients(patientsWithSessions)
                setFilteredPatients(patientsWithSessions)
                console.log('fetchPatients - completato con successo via server API', patientsWithSessions.length)
                setIsLoading(prev => ({ ...prev, patients: false }))
                return
              }
            }
          } else {
            console.error('Errore nel recupero profili dal server:', await response.text())
          }
        } catch (serverError) {
          console.error('Errore nella chiamata al server:', serverError)
        }
      }
      
      // 3. Continua con il metodo originale se i metodi precedenti falliscono
      // Ora con il filtro
      let relationData;
      let relationError;
      
      const { data: initialRelationships, error: initialRelationshipError } = await supabase
        .from('therapist_patients')
        .select('patient_id, therapist_id')
        .eq('therapist_id', String(user?.id))  // Converti esplicitamente in stringa
      
      relationData = initialRelationships;
      relationError = initialRelationshipError;
      
      console.log('Relazioni terapeuta-paziente:', relationData, 'Errore:', relationError)
      
      // Se la query precedente non funziona, proviamo con un approccio alternativo
      if (!relationData || relationData.length === 0) {
        console.log('Provo approccio alternativo con .or')
        const { data: altRelationships, error: altError } = await supabase
          .from('therapist_patients')
          .select('patient_id, therapist_id')
          .or(`therapist_id.eq.${user?.id},therapist_id.eq.${String(user?.id)}`)
        
        console.log('Approccio alternativo:', altRelationships, 'Errore:', altError)
        
        // Se trovati con l'approccio alternativo, usa questi
        if (altRelationships && altRelationships.length > 0) {
          console.log('Usando risultati dell\'approccio alternativo')
          relationData = altRelationships;
          relationError = altError;
        }
      }
      
      if (relationError) throw relationError
      
      if (!relationData || relationData.length === 0) {
        console.log('Nessuna relazione trovata per il terapeuta (tutti i metodi falliti)')
        setPatients([])
        setFilteredPatients([])
        setIsLoading(prev => ({ ...prev, patients: false }))
        return
      }
      
      // Estrai gli ID dei pazienti collegati a questo terapeuta
      const patientIds = relationData.map(rel => rel.patient_id)
      console.log('IDs dei pazienti associati:', patientIds)
      
      // Ottieni i dettagli di questi pazienti specifici
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'patient')
        .in('id', patientIds)
      
      console.log('Profili dei pazienti:', data, 'Errore:', error)
      
      if (error) throw error
      
      // Ottieni le sessioni per ogni paziente
      const patientsWithSessions = await Promise.all(
        data.map(async (patient) => {
          const { data: sessions, error: sessionsError } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('patient_id', patient.id)
            .order('last_updated', { ascending: false })
          
          console.log(`Sessioni per paziente ${patient.id}:`, sessions)
          
          // Ottieni la nota relativa al paziente
          const { data: notes, error: notesError } = await supabase
            .from('patient_notes')
            .select('*')
            .eq('patient_id', patient.id)
            
          console.log(`Note per paziente ${patient.id}:`, notes && notes.length > 0 ? notes[0] : null, 'Errore:', notesError)
          
          // Se non troviamo note con query diretta, proviamo a usare l'API server
          let patientNote = '';
          if (notesError || !notes || notes.length === 0) {
            try {
              // Prova a recuperare le note dal server (bypass RLS)
              const response = await fetch(`/api/debug/get-note?patient_id=${patient.id}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              });
              
              if (response.ok) {
                const noteData = await response.json();
                console.log(`Note (via server) per paziente ${patient.id}:`, noteData);
                patientNote = noteData.note?.content || '';
              }
            } catch (serverError) {
              console.error(`Errore recupero note dal server per paziente ${patient.id}:`, serverError);
            }
          } else {
            patientNote = notes[0]?.content || '';
          }
          
          const sessionsData = sessionsError ? [] : sessions
          const lastSessionDate = sessionsData[0]?.last_updated || null
          
          // Determina lo stato del paziente
          const isActive = lastSessionDate ? 
            (new Date().getTime() - new Date(lastSessionDate).getTime()) < 30 * 24 * 60 * 60 * 1000 
            : false
          
          return {
            ...patient,
            sessions: sessionsData,
            sessions_count: sessionsData.length,
            last_session: lastSessionDate,
            status: isActive ? 'active' : 'inactive',
            note: patientNote
          }
        })
      )
      
      console.log('Pazienti con sessioni:', patientsWithSessions)
      
      // Calcola le statistiche
      const totalPatients = patientsWithSessions.length
      const activePatients = patientsWithSessions.filter(p => p.status === 'active').length
      const totalSessions = patientsWithSessions.reduce((acc, p) => acc + (p.sessions_count || 0), 0)
      
      setStats({
        totalPatients,
        activePatientsPercent: totalPatients > 0 ? Math.round((activePatients / totalPatients) * 100) : 0,
        totalSessions,
        avgSessionsPerPatient: totalPatients > 0 ? Math.round(totalSessions / totalPatients * 10) / 10 : 0
      })
      
      setPatients(patientsWithSessions)
      setFilteredPatients(patientsWithSessions)
      console.log('fetchPatients - completato con successo', patientsWithSessions.length)
    } catch (error) {
      console.error('Errore nel recupero dei pazienti:', error)
      toast.error('Errore', { description: 'Impossibile recuperare i pazienti' })
    } finally {
      setIsLoading(prev => ({ ...prev, patients: false }))
    }
  }

  const fetchSessionSummary = async (sessionId: string) => {
    setIsLoading(prev => ({ ...prev, summary: true }))
    try {
      const response = await apiClient.getSessionSummary(sessionId)
      setSessionSummary(response.summary_html)
    } catch (error) {
      console.error('Errore nel recupero del riepilogo della sessione:', error)
      toast.error('Errore', { description: 'Impossibile recuperare il riepilogo della sessione' })
    } finally {
      setIsLoading(prev => ({ ...prev, summary: false }))
    }
  }

  const fetchMoodAnalysis = async (sessionId: string) => {
    setIsLoading(prev => ({ ...prev, mood: true }))
    try {
      const response = await apiClient.getMoodAnalysis(sessionId)
      setMoodAnalysis(response.mood_analysis)
    } catch (error) {
      console.error('Errore nell\'analisi dell\'umore:', error)
      toast.error('Errore', { description: 'Impossibile recuperare l\'analisi dell\'umore' })
    } finally {
      setIsLoading(prev => ({ ...prev, mood: false }))
    }
  }

  const fetchPathologyAnalysis = async (sessionId: string) => {
    setIsLoading(prev => ({ ...prev, pathology: true }))
    try {
      const response = await apiClient.getPathologyAnalysis(sessionId)
      setPathologyAnalysis(response)
    } catch (error) {
      console.error('Errore nell\'analisi delle patologie:', error)
      toast.error('Errore', { description: 'Impossibile recuperare l\'analisi delle patologie' })
    } finally {
      setIsLoading(prev => ({ ...prev, pathology: false }))
    }
  }

  const handleSelectSession = (sessionId: string) => {
    setSelectedSession(sessionId)
    // Carica i dati della sessione
    fetchSessionSummary(sessionId)
    fetchMoodAnalysis(sessionId)
    fetchPathologyAnalysis(sessionId)
  }

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient)
    setPatientNote(patient.note || '')
    setEditingNote(false)
    setSelectedSession(null)
  }

  const savePatientNote = async () => {
    if (!selectedPatient) return
    
    setIsLoading(prev => ({ ...prev, saveNote: true }))
    try {
      // Prima prova con la nuova API server (che bypassa RLS)
      try {
        const response = await fetch('/api/debug/save-note', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            patient_id: selectedPatient.id,
            content: patientNote,
            therapist_id: user?.id
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('Risposta salvataggio nota:', result);
          
          if (result.success) {
            // Aggiorna la lista pazienti e il paziente selezionato
            setPatients(patients.map(p => 
              p.id === selectedPatient.id ? { ...p, note: patientNote } : p
            ));
            
            // Assicuriamoci che il paziente selezionato mostri la nota aggiornata
            setSelectedPatient({
              ...selectedPatient,
              note: patientNote
            });
            
            toast.success('Nota salvata', { 
              description: 'La nota è stata salvata con successo tramite server' 
            });
            setEditingNote(false);
            setIsLoading(prev => ({ ...prev, saveNote: false }));
            return;
          }
        }
      } catch (serverError) {
        console.error('Errore API server per note:', serverError);
      }
      
      // Se l'API server fallisce, tenta con Supabase diretto
      console.log('Fallback a salvataggio nota tramite Supabase diretto');
      
      // Controlla se esiste già una nota per questo paziente
      const { data, error } = await supabase
        .from('patient_notes')
        .select('*')
        .eq('patient_id', selectedPatient.id);
      
      if (error) throw error;
      
      // Se esiste almeno una nota, aggiornala
      if (data && data.length > 0) {
        const { error: updateError } = await supabase
          .from('patient_notes')
          .update({ content: patientNote })
          .eq('id', data[0].id);  // Aggiorna la prima nota trovata
        
        if (updateError) throw updateError;
      } else {
        // Altrimenti crea una nuova nota
        const { error: insertError } = await supabase
          .from('patient_notes')
          .insert([{ 
            patient_id: selectedPatient.id, 
            content: patientNote,
            therapist_id: user?.id 
          }]);
        
        if (insertError) throw insertError;
      }
      
      // Aggiorna la lista pazienti con la nuova nota
      setPatients(patients.map(p => 
        p.id === selectedPatient.id ? { ...p, note: patientNote } : p
      ));
      
      // Aggiorna anche il paziente selezionato direttamente
      setSelectedPatient({
        ...selectedPatient,
        note: patientNote
      });
      
      toast.success('Nota salvata', { description: 'La nota è stata salvata con successo' });
      setEditingNote(false);
    } catch (error) {
      console.error('Errore nel salvataggio della nota:', error);
      toast.error('Errore', { description: 'Impossibile salvare la nota' });
    } finally {
      setIsLoading(prev => ({ ...prev, saveNote: false }));
    }
  };

  // Estendi la funzione testTherapistPatientRelation
  const testTherapistPatientRelation = async () => {
    console.log('-------- TEST THERAPIST-PATIENT RELATION --------')
    console.log('User attuale:', user)
    
    try {
      // 1. Verifica user ID
      if (!user || !user.id) {
        console.error('User non autenticato o mancante ID')
        toast.error('Errore', { description: 'User non autenticato o mancante ID' })
        return
      }
      
      // 2. Test query diretta con ID utente formattati in diversi modi
      console.log('Test con diversi formati ID')
      
      // Prova come stringa
      const { data: test1, error: error1 } = await supabase
        .from('therapist_patients')
        .select('*')
        .eq('therapist_id', String(user.id))
      
      console.log('Test come stringa:', { data: test1, error: error1 })
      
      // Prova come UUID (se appropriato)
      const { data: test2, error: error2 } = await supabase
        .from('therapist_patients')
        .select('*')
      
      console.log('Test tutti i record:', { data: test2, error: error2 })
      
      // 3. Verifica le colonne della tabella e i tipi di dati
      if (test2 && test2.length > 0) {
        console.log('Schema della tabella (primo record):', 
          Object.keys(test2[0]).map(key => `${key}: ${typeof test2[0][key]} (${test2[0][key]})`))
        
        // 4. Controlla se l'utente corrente ha relazioni
        const userRelations = test2.filter(rel => 
          String(rel.therapist_id) === String(user.id)
        )
        
        console.log('Relazioni filtrate manualmente:', userRelations)
        
        // 5. Se trovate relazioni, recupera manualmente i pazienti
        if (userRelations.length > 0) {
          toast.success('Trovate relazioni', { 
            description: `Trovate ${userRelations.length} relazioni, ma la query fallisce` 
          })
          
          // Recupera pazienti manualmente
          const patientIds = userRelations.map(rel => rel.patient_id)
          console.log('IDs pazienti da recuperare:', patientIds)
          
          const { data: patientsData, error: patientsError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', patientIds)
          
          console.log('Pazienti recuperati manualmente:', patientsData, 'Errore:', patientsError)
          
          if (patientsData && patientsData.length > 0) {
            // Aggiorna la UI con questi pazienti recuperati manualmente
            const updatedPatients = await Promise.all(
              patientsData.map(async (patient) => {
                const { data: sessions, error: sessionsError } = await supabase
                  .from('chat_sessions')
                  .select('*')
                  .eq('patient_id', patient.id)
                  .order('last_updated', { ascending: false })
                
                const sessionsData = sessionsError ? [] : sessions
                const lastSessionDate = sessionsData[0]?.last_updated || null
                
                const isActive = lastSessionDate ? 
                  (new Date().getTime() - new Date(lastSessionDate).getTime()) < 30 * 24 * 60 * 60 * 1000 
                  : false
                
                return {
                  ...patient,
                  sessions: sessionsData,
                  sessions_count: sessionsData.length,
                  last_session: lastSessionDate,
                  status: isActive ? 'active' : 'inactive',
                  note: ''
                }
              })
            )
            
            // Aggiorna l'interfaccia utente
            setPatients(updatedPatients)
            setFilteredPatients(updatedPatients)
            toast.success('Pazienti recuperati manualmente', { 
              description: `Trovati ${updatedPatients.length} pazienti` 
            })
          } else {
            toast.error('Nessun paziente trovato', { description: 'Nessun paziente trovato con gli ID specificati' })
          }
        } else {
          toast.warning('Nessuna relazione', { 
            description: 'Nessuna relazione trovata per questo terapeuta' 
          })
        }
      } else {
        toast.error('Tabella vuota', { description: 'La tabella therapist_patients è vuota o non accessibile' })
      }
      
    } catch (error) {
      console.error('Errore test:', error)
      toast.error('Errore test', { description: String(error) })
    }
  }

  // Mostra il loader mentre verifichiamo l'autenticazione
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Caricamento...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      {/* Header migliorato */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Psicologo</h1>
          <p className="text-muted-foreground mt-1">
            Benvenuto, {user?.first_name || 'Terapeuta'}. Gestisci i tuoi pazienti e analizza le loro sessioni.
          </p>
        </div>
        <Button variant="outline" onClick={signOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Esci
        </Button>
      </div>

      {/* Cards statistiche principali con effetti hover e gradienti */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Panoramica
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <Card className="card-hover-effect overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-orange-500"></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pazienti totali</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalPatients}</div>
              <div className="mt-2 flex items-center text-muted-foreground text-sm">
                <Users className="h-4 w-4 mr-1" />
                Pazienti in cura
              </div>
            </CardContent>
          </Card>
          
          <Card className="card-hover-effect overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-600"></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pazienti attivi</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.activePatientsPercent}%</div>
              <div className="mt-2 flex items-center text-muted-foreground text-sm">
                <HeartPulse className="h-4 w-4 mr-1 text-rose-500" />
                Attivi negli ultimi 30 giorni
              </div>
            </CardContent>
          </Card>
          
          <Card className="card-hover-effect overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-red-500"></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sessioni totali</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalSessions}</div>
              <div className="mt-2 flex items-center text-muted-foreground text-sm">
                <BrainCircuit className="h-4 w-4 mr-1 text-amber-600" />
                Consulti completati
              </div>
            </CardContent>
          </Card>
          
          <Card className="card-hover-effect overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-rose-500"></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Media sessioni</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.avgSessionsPerPatient}</div>
              <div className="mt-2 flex items-center text-muted-foreground text-sm">
                <Brain className="h-4 w-4 mr-1 text-orange-600" />
                Sessioni per paziente
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lista pazienti con ricerca e filtri */}
        <Card className="lg:col-span-1 backdrop-blur-sm bg-card/95 border border-amber-100 dark:border-amber-900/30 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="h-5 w-5 mr-2 text-amber-500" />
              I tuoi pazienti
            </CardTitle>
            <CardDescription>
              Gestisci i tuoi pazienti e visualizza le loro sessioni
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Cerca paziente..."
                className="pl-8 border-amber-200 dark:border-amber-800/50 transition-all focus:border-amber-400 dark:focus:border-amber-600"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant={statusFilter === 'all' ? 'default' : 'outline'} 
                onClick={() => setStatusFilter('all')}
                className={`flex-1 text-xs ${statusFilter === 'all' ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700' : 'hover:bg-amber-100 dark:hover:bg-amber-900/20'}`}
              >
                Tutti
              </Button>
              <Button 
                size="sm" 
                variant={statusFilter === 'active' ? 'default' : 'outline'} 
                onClick={() => setStatusFilter('active')}
                className={`flex-1 text-xs ${statusFilter === 'active' ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700' : 'hover:bg-amber-100 dark:hover:bg-amber-900/20'}`}
              >
                Attivi
              </Button>
              <Button 
                size="sm" 
                variant={statusFilter === 'inactive' ? 'default' : 'outline'} 
                onClick={() => setStatusFilter('inactive')}
                className={`flex-1 text-xs ${statusFilter === 'inactive' ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700' : 'hover:bg-amber-100 dark:hover:bg-amber-900/20'}`}
              >
                Inattivi
              </Button>
            </div>
            
            <Separator className="bg-amber-200/50 dark:bg-amber-800/20" />
            
            {isLoading.patients ? (
              <p className="text-center py-4">Caricamento pazienti...</p>
            ) : filteredPatients.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <p className="text-gray-500">Nessun paziente trovato</p>
                {searchQuery && (
                  <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/20">
                    Cancella ricerca
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                {filteredPatients.map((patient) => (
                  <div
                    key={patient.id}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      selectedPatient?.id === patient.id 
                        ? 'bg-gradient-to-r from-amber-100 to-amber-200/70 dark:from-amber-900/40 dark:to-amber-800/20 shadow-md' 
                        : 'hover:bg-amber-50 dark:hover:bg-amber-900/10 hover:shadow-sm'
                    }`}
                    onClick={() => handleSelectPatient(patient)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`rounded-full p-2 ${selectedPatient?.id === patient.id ? 'bg-amber-200 dark:bg-amber-700' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                        <UserCircle className={`h-6 w-6 ${selectedPatient?.id === patient.id ? 'text-amber-700 dark:text-amber-300' : 'text-amber-500 dark:text-amber-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {patient.first_name 
                            ? `${patient.first_name} ${patient.last_name || ''}` 
                            : patient.email}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                          <CalendarDays className="h-3 w-3" />
                          <span>
                            {patient.sessions_count || 0} sessioni
                          </span>
                        </div>
                      </div>
                      <Badge variant={patient.status === 'active' ? 'default' : 'outline'} className={patient.status === 'active' ? 'status-badge-active text-white' : 'status-badge-inactive'}>
                        {patient.status === 'active' ? 'Attivo' : 'Inattivo'}
                      </Badge>
                    </div>
                    {patient.last_session && (
                      <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Ultima sessione: {new Date(patient.last_session).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-300" onClick={() => toast.info('Funzionalità in arrivo', { description: 'La possibilità di aggiungere nuovi pazienti sarà disponibile presto.' })}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Aggiungi paziente
            </Button>
          </CardFooter>
        </Card>

        {/* Dettagli paziente e sessioni */}
        <div className="lg:col-span-3 space-y-6">
          {selectedPatient ? (
            <>
              {/* Informazioni sul paziente */}
              <Card className="backdrop-blur-sm bg-card/95 overflow-hidden border border-amber-100 dark:border-amber-900/30 shadow-lg">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-orange-600"></div>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        <div className="rounded-full p-1.5 bg-amber-100 dark:bg-amber-900/50">
                          <UserCircle className="h-5 w-5 text-amber-700 dark:text-amber-300" />
                        </div>
                        {selectedPatient.first_name 
                          ? `${selectedPatient.first_name} ${selectedPatient.last_name || ''}`
                          : selectedPatient.email}
                      </CardTitle>
                      <CardDescription>
                        Email: {selectedPatient.email}
                      </CardDescription>
                    </div>
                    <Badge variant={selectedPatient.status === 'active' ? 'default' : 'outline'} className={`ml-auto ${selectedPatient.status === 'active' ? 'status-badge-active text-white' : 'status-badge-inactive'}`}>
                      {selectedPatient.status === 'active' ? 'Attivo' : 'Inattivo'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border border-amber-200 dark:border-amber-800/30 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-900/10 transition-all hover:shadow-md">
                      <div className="text-sm text-amber-600 dark:text-amber-300 font-medium mb-1 flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Data registrazione
                      </div>
                      <div>{new Date(selectedPatient.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="border border-amber-200 dark:border-amber-800/30 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-900/10 transition-all hover:shadow-md">
                      <div className="text-sm text-amber-600 dark:text-amber-300 font-medium mb-1 flex items-center gap-1">
                        <BrainCircuit className="h-3.5 w-3.5" />
                        Sessioni totali
                      </div>
                      <div>{selectedPatient.sessions_count || 0}</div>
                    </div>
                    <div className="border border-amber-200 dark:border-amber-800/30 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-900/10 transition-all hover:shadow-md">
                      <div className="text-sm text-amber-600 dark:text-amber-300 font-medium mb-1 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Ultima attività
                      </div>
                      <div>
                        {selectedPatient.last_session 
                          ? new Date(selectedPatient.last_session).toLocaleDateString() 
                          : 'Nessuna sessione'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Note sul paziente */}
                  <div className="border border-amber-200 dark:border-amber-800/30 rounded-lg p-4 bg-amber-50/30 dark:bg-amber-900/10 transition-all hover:shadow-md">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-medium flex items-center text-amber-700 dark:text-amber-300">
                        <FileEdit className="h-4 w-4 mr-2" />
                        Note sul paziente
                      </div>
                      {!editingNote ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setEditingNote(true)}
                          className="hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                        >
                          Modifica
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              setEditingNote(false)
                              setPatientNote(selectedPatient.note || '')
                            }}
                            className="border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Annulla
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={savePatientNote} 
                            disabled={isLoading.saveNote}
                            className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                          >
                            <Save className="h-4 w-4 mr-1" />
                            Salva
                          </Button>
                        </div>
                      )}
                    </div>
                    {editingNote ? (
                      <div className="mt-2">
                        <textarea
                          value={patientNote}
                          onChange={(e) => setPatientNote(e.target.value)}
                          className="w-full min-h-[100px] p-2 border border-amber-200 dark:border-amber-800/50 rounded-md focus:border-amber-400 dark:focus:border-amber-600 focus:ring-amber-300 dark:focus:ring-amber-700/50 transition-colors bg-white/80 dark:bg-black/20"
                          placeholder="Inserisci note sul paziente..."
                        />
                      </div>
                    ) : (
                      <div className="mt-2 text-sm">
                        {selectedPatient.note ? (
                          <p className="whitespace-pre-line">{selectedPatient.note}</p>
                        ) : (
                          <p className="text-gray-500 italic">Nessuna nota disponibile. Clicca su "Modifica" per aggiungere una nota.</p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              {/* Sessioni del paziente */}
              <Card className="backdrop-blur-sm bg-card/95 overflow-hidden border border-amber-100 dark:border-amber-900/30 shadow-lg">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-red-500"></div>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="rounded-full p-1.5 bg-orange-100 dark:bg-orange-900/50">
                      <BrainCircuit className="h-5 w-5 text-orange-700 dark:text-orange-300" />
                    </div>
                    Sessioni di {selectedPatient.first_name || selectedPatient.email}
                  </CardTitle>
                  <CardDescription>
                    Seleziona una sessione per visualizzare i dettagli
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!selectedPatient.sessions || selectedPatient.sessions.length === 0 ? (
                    <div className="text-center py-10 border border-amber-200/50 dark:border-amber-800/20 border-dashed rounded-lg bg-amber-50/30 dark:bg-amber-900/10">
                      <AlertCircle className="h-10 w-10 text-amber-400 dark:text-amber-500/70 mx-auto mb-4" />
                      <p className="text-amber-700 dark:text-amber-300">
                        Nessuna sessione disponibile per questo paziente
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedPatient.sessions.map((session) => (
                        <div
                          key={session.id}
                          className={`p-4 border rounded-lg cursor-pointer transition-all ${
                            selectedSession === session.id 
                              ? 'border-orange-400 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/20 shadow-md' 
                              : 'border-amber-200 dark:border-amber-800/30 hover:bg-amber-50 dark:hover:bg-amber-900/10 hover:border-amber-300 dark:hover:border-amber-700 hover:shadow'
                          }`}
                          onClick={() => handleSelectSession(session.id)}
                        >
                          <h3 className={`font-medium ${selectedSession === session.id ? 'text-orange-700 dark:text-orange-300' : ''}`}>
                            {session.title || `Sessione ${new Date(session.created_at).toLocaleDateString()}`}
                          </h3>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="outline" className={`text-xs ${selectedSession === session.id ? 'border-orange-300 dark:border-orange-700 bg-orange-100/50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' : 'border-amber-200 dark:border-amber-800'}`}>
                              {new Date(session.created_at).toLocaleDateString()}
                            </Badge>
                            {new Date(session.created_at).toDateString() !== 
                             new Date(session.last_updated).toDateString() && (
                              <Badge variant="outline" className={`text-xs ${selectedSession === session.id ? 'border-orange-300 dark:border-orange-700 bg-orange-100/50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' : 'border-amber-200 dark:border-amber-800'}`}>
                                Aggiornata: {new Date(session.last_updated).toLocaleDateString()}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* Analisi della sessione */}
              {selectedSession && (
                <Card className="backdrop-blur-sm bg-card/95 overflow-hidden border border-amber-100 dark:border-amber-900/30 shadow-lg">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-rose-600"></div>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="rounded-full p-1.5 bg-rose-100 dark:bg-rose-900/50">
                        <Microscope className="h-5 w-5 text-rose-700 dark:text-rose-300" />
                      </div>
                      Analisi della sessione
                    </CardTitle>
                    <CardDescription>
                      Riepilogo e analisi della sessione selezionata
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="summary">
                      <TabsList className="mb-4 bg-amber-100 dark:bg-amber-900/30 p-1">
                        <TabsTrigger value="summary" className="flex items-center data-[state=active]:bg-white dark:data-[state=active]:bg-black/20 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-300">
                          <BadgeInfo className="h-4 w-4 mr-2" />
                          Riepilogo
                        </TabsTrigger>
                        <TabsTrigger value="mood" className="flex items-center data-[state=active]:bg-white dark:data-[state=active]:bg-black/20 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-300">
                          <BarChart4 className="h-4 w-4 mr-2" />
                          Analisi umore
                        </TabsTrigger>
                        <TabsTrigger value="pathology" className="flex items-center data-[state=active]:bg-white dark:data-[state=active]:bg-black/20 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-300">
                          <Microscope className="h-4 w-4 mr-2" />
                          Analisi patologie
                        </TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="summary" className="mt-0">
                        {isLoading.summary ? (
                          <div className="text-center py-8">
                            <p>Caricamento riepilogo...</p>
                          </div>
                        ) : (
                          <div 
                            className="prose prose-amber dark:prose-invert max-w-none p-4 rounded-lg border border-amber-200/50 dark:border-amber-800/20 bg-amber-50/30 dark:bg-amber-900/10"
                            dangerouslySetInnerHTML={{ __html: sessionSummary }}
                          />
                        )}
                      </TabsContent>
                      
                      <TabsContent value="mood" className="mt-0">
                        {isLoading.mood ? (
                          <div className="text-center py-8">
                            <p>Caricamento analisi dell'umore...</p>
                          </div>
                        ) : (
                          <div 
                            className="prose prose-amber dark:prose-invert max-w-none p-4 rounded-lg border border-amber-200/50 dark:border-amber-800/20 bg-amber-50/30 dark:bg-amber-900/10"
                            dangerouslySetInnerHTML={{ __html: moodAnalysis }}
                          />
                        )}
                      </TabsContent>
                      
                      <TabsContent value="pathology" className="mt-0">
                        {isLoading.pathology ? (
                          <div className="text-center py-8">
                            <p>Caricamento analisi delle patologie...</p>
                          </div>
                        ) : pathologyAnalysis ? (
                          <div className="space-y-6 p-4 rounded-lg border border-amber-200/50 dark:border-amber-800/20 bg-amber-50/30 dark:bg-amber-900/10">
                            <div className="prose prose-amber dark:prose-invert max-w-none">
                              <h3>Riepilogo dell'analisi</h3>
                              <p>{pathologyAnalysis.analysis_summary}</p>
                            </div>
                            
                            <div>
                              <h3 className="text-lg font-medium mb-4 text-amber-800 dark:text-amber-200">Possibili patologie rilevate</h3>
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {pathologyAnalysis.possible_pathologies.map((pathology: any, index: number) => (
                                  <div key={index} className="border border-amber-200 dark:border-amber-800/30 rounded-lg p-4 bg-white/80 dark:bg-black/20 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-2">
                                      <h4 className="font-medium text-amber-700 dark:text-amber-300">{pathology.name}</h4>
                                      <Badge className="bg-gradient-to-r from-amber-500 to-orange-600">
                                        {Math.round(pathology.confidence * 100)}%
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                                      {pathology.description}
                                    </p>
                                    <div>
                                      <h5 className="text-sm font-medium mb-1 text-amber-600 dark:text-amber-400">Sintomi chiave:</h5>
                                      <ul className="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside">
                                        {pathology.key_symptoms.map((symptom: string, symIdx: number) => (
                                          <li key={symIdx}>{symptom}</li>
                                        ))}
                                      </ul>
                                    </div>
                                    {pathology.source && (
                                      <div className="mt-2 text-xs text-gray-500">
                                        Fonte: {pathology.source}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            Nessuna analisi disponibile
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center py-16 px-6 max-w-md mx-auto bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 rounded-xl border border-amber-100 dark:border-amber-800/20 shadow-xl">
                <div className="rounded-full p-4 bg-amber-100 dark:bg-amber-900/50 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                  <UserCircle className="h-10 w-10 text-amber-500 dark:text-amber-300" />
                </div>
                <h3 className="text-xl font-medium mb-3 text-amber-700 dark:text-amber-300">Seleziona un paziente</h3>
                <p className="text-amber-600 dark:text-amber-400 mb-8">
                  Seleziona un paziente dalla lista per visualizzare i dettagli e le sessioni
                </p>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center bg-white/60 dark:bg-black/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800/30 shadow-sm">
                    <CheckCircle2 className="h-5 w-5 text-amber-500 mr-2 flex-shrink-0" />
                    <span className="text-sm">Visualizza le sessioni dei pazienti</span>
                  </div>
                  <div className="flex items-center bg-white/60 dark:bg-black/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800/30 shadow-sm">
                    <CheckCircle2 className="h-5 w-5 text-amber-500 mr-2 flex-shrink-0" />
                    <span className="text-sm">Gestisci le note sui pazienti</span>
                  </div>
                  <div className="flex items-center bg-white/60 dark:bg-black/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800/30 shadow-sm">
                    <CheckCircle2 className="h-5 w-5 text-amber-500 mr-2 flex-shrink-0" />
                    <span className="text-sm">Analizza le sessioni di terapia</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}