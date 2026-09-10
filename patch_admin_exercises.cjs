const fs = require('fs');
let code = fs.readFileSync('src/pages/PatientDetail.tsx', 'utf-8');

// 1. Add state for exercises
const stateHookPos = code.indexOf("const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);");
if (stateHookPos === -1) {
    console.error('Could not find isAccessModalOpen state hook');
    process.exit(1);
}
const stateHookInsert = `
  // Exercises/Videos State
  const [exercises, setExercises] = useState<any[]>([]);
  const [isNewVideoModalOpen, setIsNewVideoModalOpen] = useState(false);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
`;
code = code.slice(0, stateHookPos) + stateHookInsert + code.slice(stateHookPos);

// 2. Load exercises on fetch
const fetchEndPos = code.indexOf("setForfait(patientData.forfait_seances || 0);");
const loadExInsert = `
      // Load local exercises
      try {
        const storedEx = localStorage.getItem(\`reforme_exercises_\${patientData.id}\`);
        if (storedEx) {
          setExercises(JSON.parse(storedEx));
        } else {
          setExercises([]);
        }
      } catch(e) { console.error('Error loading exercises', e); }
`;
code = code.slice(0, fetchEndPos) + loadExInsert + code.slice(fetchEndPos);

// 3. Handlers for adding/removing exercises
const handlersPos = code.indexOf("const handleLogout =");
const handlersInsert = `
  const handleAddVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoUrl || !newVideoTitle) return;
    
    let embedUrl = newVideoUrl;
    // Basic conversion from regular youtube URL to embed URL
    if (newVideoUrl.includes('youtube.com/watch?v=')) {
        const videoId = newVideoUrl.split('v=')[1].split('&')[0];
        embedUrl = \`https://www.youtube.com/embed/\${videoId}\`;
    } else if (newVideoUrl.includes('youtu.be/')) {
        const videoId = newVideoUrl.split('youtu.be/')[1].split('?')[0];
        embedUrl = \`https://www.youtube.com/embed/\${videoId}\`;
    }

    const newEx = {
      id: Date.now().toString(),
      title: newVideoTitle,
      url: embedUrl,
      type: 'video',
      date: new Date().toISOString()
    };
    const updated = [newEx, ...exercises];
    setExercises(updated);
    localStorage.setItem(\`reforme_exercises_\${patient.id}\`, JSON.stringify(updated));
    setNewVideoUrl('');
    setNewVideoTitle('');
    setIsNewVideoModalOpen(false);
  };

  const handleDeleteExercise = (id: string) => {
    if (!confirm('Supprimer cette vidéo ?')) return;
    const updated = exercises.filter(e => e.id !== id);
    setExercises(updated);
    localStorage.setItem(\`reforme_exercises_\${patient.id}\`, JSON.stringify(updated));
  };
`;
// If handleLogout doesn't exist, just inject before return (
const returnPos = code.lastIndexOf("return (");
code = code.slice(0, returnPos) + handlersInsert + code.slice(returnPos);

// 4. Add the tab button
const facturationTabPos = code.indexOf("onClick={() => setActiveTab('facturation')}");
const buttonHtml = `        <button 
          onClick={() => setActiveTab('exercices')}
          className={\`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap \${activeTab === 'exercices' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}\`}
        >
          Vidéos & Exercices
        </button>
`;
// insert after facturation tab closing tag
const facturationEndTabRegex = /<button[\s\S]*?onClick=\{\(\) => setActiveTab\('facturation'\)\}[\s\S]*?<\/button>/;
const match = facturationEndTabRegex.exec(code);
if (match) {
    code = code.slice(0, match.index + match[0].length) + '\n' + buttonHtml + code.slice(match.index + match[0].length);
} else {
    console.error("Could not find facturation tab button");
}

// 5. Add the tab content
const facturationTabContentRegex = /\{activeTab === 'facturation' && \([\s\S]*?\n      \)\}/;
const matchContent = facturationTabContentRegex.exec(code);
const contentHtml = `
      {activeTab === 'exercices' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Programme d'exercices</h3>
              <p className="text-sm text-slate-500">Partagez des vidéos YouTube ou des liens avec le patient.</p>
            </div>
            <Button onClick={() => setIsNewVideoModalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Ajouter une vidéo
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exercises.length === 0 ? (
              <div className="col-span-full p-8 text-center text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
                Aucune vidéo assignée à ce patient pour le moment.
              </div>
            ) : (
              exercises.map(ex => (
                <Card key={ex.id} className="overflow-hidden shadow-sm border-0 ring-1 ring-slate-100">
                  <div className="aspect-video bg-slate-900 relative">
                    <iframe 
                      src={ex.url} 
                      className="w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                      allowFullScreen
                    ></iframe>
                  </div>
                  <CardContent className="p-4 flex justify-between items-center">
                    <h4 className="font-semibold text-slate-900 truncate" title={ex.title}>{ex.title}</h4>
                    <button 
                      onClick={() => handleDeleteExercise(ex.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors flex-shrink-0"
                      title="Supprimer la vidéo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
`;
if (matchContent) {
    code = code.slice(0, matchContent.index + matchContent[0].length) + '\n' + contentHtml + code.slice(matchContent.index + matchContent[0].length);
} else {
    console.error("Could not find facturation tab content");
}

// 6. Add modal for new video
const newVideoModalHtml = `
      {/* Modal Nouvelle Vidéo */}
      <Modal
        isOpen={isNewVideoModalOpen}
        onClose={() => setIsNewVideoModalOpen(false)}
        title="Ajouter une vidéo d'exercice"
      >
        <form onSubmit={handleAddVideo} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Titre de l'exercice *</label>
            <input
              type="text"
              required
              value={newVideoTitle}
              onChange={e => setNewVideoTitle(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Ex: Étirements lombaires"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Lien de la vidéo (YouTube) *</label>
            <input
              type="url"
              required
              value={newVideoUrl}
              onChange={e => setNewVideoUrl(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsNewVideoModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">
              Ajouter
            </Button>
          </div>
        </form>
      </Modal>
`;
// add before the very last </div>
const lastDivPos = code.lastIndexOf("</div>");
code = code.slice(0, lastDivPos) + newVideoModalHtml + code.slice(lastDivPos);


// Extra replace: import Play if missing
code = code.replace(/import \{.*?\} from 'lucide-react';/, (match) => {
    if (!match.includes('Play')) {
        return match.replace(" } from 'lucide-react'", ", Play } from 'lucide-react'");
    }
    return match;
});


fs.writeFileSync('src/pages/PatientDetail.tsx', code);
console.log('Successfully patched PatientDetail.tsx');
