const fs = require('fs');
let code = fs.readFileSync('src/pages/PatientPortal.tsx', 'utf-8');

// 1. Add state for exercises
const stateHookPos = code.indexOf("const [localDocs, setLocalDocs]");
if (stateHookPos === -1) {
    console.error('Could not find localDocs state hook');
    process.exit(1);
}
const stateHookInsert = `
  const [exercises, setExercises] = useState<any[]>([]);
`;
code = code.slice(0, stateHookPos) + stateHookInsert + code.slice(stateHookPos);

// 2. Load exercises on fetch
const loadDocsPos = code.indexOf("setLocalDocs(JSON.parse(storedDocs));");
const loadExInsert = `
        const storedEx = localStorage.getItem(\`reforme_exercises_\${patientData.id}\`);
        if (storedEx) {
          setExercises(JSON.parse(storedEx));
        }
`;
code = code.slice(0, loadDocsPos + 39) + loadExInsert + code.slice(loadDocsPos + 39);

// 3. Update the documents tab button or add a new tab
const docsTabPos = code.indexOf("onClick={() => setActiveTab('documents')}");
code = code.replace(
    /<button \s*onClick=\{\(\) => setActiveTab\('documents'\)\}[\s\S]*?<\/button>/,
    `<button 
            onClick={() => setActiveTab('documents')}
            className={\`pb-2 \${activeTab === 'documents' ? 'border-b-2 border-mint-500 text-mint-700' : 'text-slate-500'}\`}
          >
            Documents & Vidéos
          </button>`
);

// 4. Update the documents tab render
const docsTabContentPos = code.indexOf("Mes documents envoyés");
if (docsTabContentPos === -1) {
    console.error("Could not find docs section");
}
const exHtml = `
            {exercises.length > 0 && (
              <div className="space-y-3 mt-8">
                <h3 className="text-sm font-bold text-slate-900 mb-2 px-1 flex items-center gap-2">
                  <Play className="h-4 w-4 text-mint-500" /> Programme d'exercices vidéo
                </h3>
                <div className="space-y-4">
                  {exercises.map(ex => (
                    <div key={ex.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                      <div className="aspect-video bg-slate-900">
                        <iframe 
                          src={ex.url} 
                          className="w-full h-full border-0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                          allowFullScreen
                        ></iframe>
                      </div>
                      <div className="p-4">
                        <h4 className="font-bold text-slate-900">{ex.title}</h4>
                        <p className="text-xs text-slate-500 mt-1">Ajouté le {new Date(ex.date).toLocaleDateString('fr-FR')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
`;

// Insert the exHtml right before the "Prescriptions & Bilans" section
const prescriptionSectionPos = code.indexOf('<div className="bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm mt-4">');
if (prescriptionSectionPos !== -1) {
    code = code.slice(0, prescriptionSectionPos) + exHtml + code.slice(prescriptionSectionPos);
} else {
    console.error("Could not find Prescriptions & Bilans section");
}


// Extra replace: import Play if missing
code = code.replace(/import \{.*?\} from 'lucide-react';/, (match) => {
    if (!match.includes('Play')) {
        return match.replace(" } from 'lucide-react'", ", Play } from 'lucide-react'");
    }
    return match;
});


fs.writeFileSync('src/pages/PatientPortal.tsx', code);
console.log('Successfully patched PatientPortal.tsx');
