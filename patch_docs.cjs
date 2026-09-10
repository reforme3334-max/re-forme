const fs = require('fs');
let code = fs.readFileSync('src/pages/PatientPortal.tsx', 'utf-8');

// 1. Add state for localDocs
const stateHookPos = code.indexOf("const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });");
if (stateHookPos === -1) {
    console.error('Could not find profileMessage state hook');
    process.exit(1);
}
const stateHookInsert = `
  // Local Documents State (simulated)
  const [localDocs, setLocalDocs] = useState<any[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
`;
code = code.slice(0, stateHookPos + 80) + stateHookInsert + code.slice(stateHookPos + 80);

// 2. Add loading of local documents
const patientDataPos = code.indexOf("setPatient(patientData);");
if (patientDataPos === -1) {
    console.error('Could not find setPatient(patientData);');
    process.exit(1);
}
const loadDocsInsert = `
      try {
        const storedDocs = localStorage.getItem(\`reforme_docs_\${patientData.id}\`);
        if (storedDocs) {
          setLocalDocs(JSON.parse(storedDocs));
        }
      } catch(e) { console.error('Erreur lecture docs', e); }
`;
code = code.slice(0, patientDataPos + 24) + loadDocsInsert + code.slice(patientDataPos + 24);

// 3. Add function to handle file upload
const handleUpdateProfilePos = code.indexOf("const handleUpdateProfile = async");
if (handleUpdateProfilePos === -1) {
    console.error('Could not find handleUpdateProfile');
    process.exit(1);
}
const uploadFuncInsert = `
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !patient) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const newDoc = {
        id: Date.now().toString(),
        name: file.name,
        type: file.type,
        date: new Date().toISOString(),
        dataUrl: reader.result as string
      };
      
      const updatedDocs = [newDoc, ...localDocs];
      setLocalDocs(updatedDocs);
      try {
        localStorage.setItem(\`reforme_docs_\${patient.id}\`, JSON.stringify(updatedDocs));
      } catch(err) {
        alert('Stockage local saturé. Veuillez libérer de la mémoire.');
      }
    };
    reader.readAsDataURL(file);
  };
  
  const handleDeleteDoc = (id: string) => {
    if (!confirm('Supprimer ce document ?')) return;
    const updatedDocs = localDocs.filter(d => d.id !== id);
    setLocalDocs(updatedDocs);
    localStorage.setItem(\`reforme_docs_\${patient.id}\`, JSON.stringify(updatedDocs));
  };
`;
code = code.slice(0, handleUpdateProfilePos) + uploadFuncInsert + code.slice(handleUpdateProfilePos);

// 4. Update the documents tab render
const documentsTabRegex = /\{activeTab === 'documents' && \(\s*<div className="space-y-4">[\s\S]*?<\/div>\s*\)\}/;
const match = documentsTabRegex.exec(code);
if (!match) {
    console.error('Could not find documents tab');
    process.exit(1);
}

// We need to import some icons: Camera, Upload, Trash2, Image as icon if they don't exist.
// Let's just import them at the top.
code = code.replace(/import { LogOut.*? } from 'lucide-react';/, (m) => m.replace(" } from 'lucide-react'", ", Camera, Upload, Trash2, Image as ImageIcon } from 'lucide-react'"));


const newDocumentsTab = `{activeTab === 'documents' && (
          <div className="space-y-4">
            
            <div className="flex gap-3">
              <Button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-mint-600 hover:bg-mint-700 text-white shadow-sm flex items-center justify-center gap-2">
                <Upload className="h-4 w-4" /> Importer un document
              </Button>
              <Button onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.capture = "environment";
                    fileInputRef.current.click();
                  }
                }} 
                className="bg-slate-800 hover:bg-slate-900 text-white shadow-sm flex items-center justify-center gap-2"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            
            <input 
              type="file" 
              accept="image/*,application/pdf"
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileUpload}
            />

            {localDocs.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900 mb-2 px-1">Mes documents envoyés</h3>
                {localDocs.map(doc => (
                  <div key={doc.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center gap-3">
                    <div className="h-12 w-12 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0 border border-slate-100 overflow-hidden">
                      {doc.type.startsWith('image/') ? (
                        <img src={doc.dataUrl} alt={doc.name} className="h-full w-full object-cover" />
                      ) : (
                        <FileText className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{doc.name}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(doc.date).toLocaleDateString('fr-FR')} • {doc.type.startsWith('image/') ? 'Image' : 'Document'}
                      </p>
                    </div>
                    <button 
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm mt-4">
              <div className="h-12 w-12 bg-mint-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileText className="h-6 w-6 text-mint-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Prescriptions & Bilans</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                Prenez en photo vos ordonnances ou examens médicaux pour les partager avec votre thérapeute.
              </p>
            </div>
          </div>
        )}`;

code = code.replace(match[0], newDocumentsTab);

fs.writeFileSync('src/pages/PatientPortal.tsx', code);
console.log('Successfully patched PatientPortal.tsx');
