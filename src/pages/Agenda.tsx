import { useState } from 'react';
import { format, addDays, startOfWeek, addHours, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { mockAppointments } from '../data/mockData';

export function Agenda() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // Start on Monday

  const weekDays = Array.from({ length: 6 }).map((_, i) => addDays(startDate, i)); // Mon-Sat
  const hours = Array.from({ length: 13 }).map((_, i) => i + 8); // 8:00 to 20:00

  const nextWeek = () => setCurrentDate(addDays(currentDate, 7));
  const prevWeek = () => setCurrentDate(addDays(currentDate, -7));
  const today = () => setCurrentDate(new Date());

  const getAppointmentsForSlot = (day: Date, hour: number) => {
    return mockAppointments.filter(app => {
      const appDate = new Date(app.date_heure);
      return isSameDay(appDate, day) && appDate.getHours() === hour;
    });
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Agenda</h1>
          <p className="text-slate-500 capitalize">
            {format(startDate, 'MMMM yyyy', { locale: fr })}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={today}>Aujourd'hui</Button>
          <div className="flex items-center rounded-md border border-slate-200 bg-white">
            <Button variant="ghost" size="icon" onClick={prevWeek} className="h-9 w-9 rounded-none border-r border-slate-200">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={nextWeek} className="h-9 w-9 rounded-none">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau RDV
          </Button>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <div className="min-w-[800px] h-full flex flex-col">
            {/* Header */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/50">
              <div className="p-3 border-r border-slate-200 text-center text-xs font-medium text-slate-500">
                Heure
              </div>
              {weekDays.map((day, i) => (
                <div key={i} className="p-3 border-r border-slate-200 text-center">
                  <div className="text-xs font-medium text-slate-500 uppercase">
                    {format(day, 'EEE', { locale: fr })}
                  </div>
                  <div className={`text-lg font-semibold mt-0.5 ${isSameDay(day, new Date()) ? 'text-primary-600' : 'text-slate-900'}`}>
                    {format(day, 'd')}
                  </div>
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto relative">
              {hours.map((hour) => (
                <div key={hour} className="grid grid-cols-7 border-b border-slate-100 min-h-[80px]">
                  <div className="p-2 border-r border-slate-200 text-right text-xs font-medium text-slate-400 sticky left-0 bg-white">
                    {hour}:00
                  </div>
                  {weekDays.map((day, dayIdx) => {
                    const slotAppointments = getAppointmentsForSlot(day, hour);
                    return (
                      <div key={dayIdx} className="border-r border-slate-100 p-1 relative group hover:bg-slate-50 transition-colors">
                        {slotAppointments.map((app) => (
                          <div 
                            key={app.id} 
                            className={`absolute left-1 right-1 rounded px-2 py-1 text-xs border shadow-sm cursor-pointer transition-transform hover:scale-[1.02] z-10 ${
                              app.statut === 'Confirmé' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                              app.statut === 'Effectué' ? 'bg-mint-50 border-mint-200 text-mint-700' :
                              'bg-slate-100 border-slate-200 text-slate-700'
                            }`}
                            style={{
                              top: `${(new Date(app.date_heure).getMinutes() / 60) * 100}%`,
                              height: `${(app.duree / 60) * 100}%`,
                              minHeight: '40px'
                            }}
                          >
                            <div className="font-semibold truncate">{app.patient_name}</div>
                            <div className="truncate opacity-80">{app.motif}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
