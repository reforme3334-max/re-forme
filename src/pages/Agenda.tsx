import { CalendarView } from '../components/agenda/CalendarView';

export function Agenda() {
  return (
    <div className="h-full flex flex-col space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Agenda</h1>
        <p className="text-slate-500">Gérez vos rendez-vous et bilans de la semaine.</p>
      </div>
      
      <div className="flex-1 min-h-0">
        <CalendarView />
      </div>
    </div>
  );
}
