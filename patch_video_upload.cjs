const fs = require('fs');

// --- PatientDetail.tsx ---
let adminCode = fs.readFileSync('src/pages/PatientDetail.tsx', 'utf-8');

// Add videoInputRef
const adminStateHookPos = adminCode.indexOf("const [newVideoTitle, setNewVideoTitle] = useState('');");
if (adminStateHookPos !== -1) {
    adminCode = adminCode.slice(0, adminStateHookPos + 55) + "\n  const videoInputRef = React.useRef<HTMLInputElement>(null);" + adminCode.slice(adminStateHookPos + 55);
}

// Add handleVideoUpload
const handleAddVideoPos = adminCode.indexOf("const handleAddVideo = (e: React.FormEvent) => {");
const handleVideoUploadStr = `
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const newEx = {
        id: Date.now().toString(),
        title: file.name || 'Vidéo enregistrée',
        url: reader.result as string,
        type: 'video',
        date: new Date().toISOString()
      };
      const updated = [newEx, ...exercises];
      setExercises(updated);
      try {
        localStorage.setItem(\`reforme_exercises_\${patient.id}\`, JSON.stringify(updated));
      } catch(err) {
        alert('Stockage local saturé. La vidéo est trop volumineuse pour être sauvegardée de manière permanente, mais elle est ajoutée temporairement.');
      }
      if (videoInputRef.current) videoInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };
`;
if (handleAddVideoPos !== -1) {
    adminCode = adminCode.slice(0, handleAddVideoPos) + handleVideoUploadStr + adminCode.slice(handleAddVideoPos);
}

// Replace button
const btnRegex = /<Button onClick=\{\(\) => setIsNewVideoModalOpen\(true\)\} className="gap-2">\s*<Plus className="h-4 w-4" \/> Ajouter une vidéo\s*<\/Button>/;
const btnReplace = `
            <div className="flex gap-2">
              <Button onClick={() => setIsNewVideoModalOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Lien YouTube
              </Button>
              <Button onClick={() => videoInputRef.current?.click()} className="gap-2 bg-slate-800 hover:bg-slate-900 text-white">
                <Camera className="h-4 w-4" /> Vidéo (Fichier / Caméra)
              </Button>
              <input type="file" accept="video/*" ref={videoInputRef} onChange={handleVideoUpload} className="hidden" />
            </div>
`;
adminCode = adminCode.replace(btnRegex, btnReplace);

// Replace iframe render
const iframeRegexAdmin = /<iframe[\s\S]*?<\/iframe>/;
const iframeReplaceAdmin = `
                    {ex.url.startsWith('data:video') ? (
                      <video src={ex.url} controls className="w-full h-full object-cover"></video>
                    ) : (
                      <iframe 
                        src={ex.url} 
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                      ></iframe>
                    )}
`;
adminCode = adminCode.replace(iframeRegexAdmin, iframeReplaceAdmin);

// Import Camera in PatientDetail if not present
adminCode = adminCode.replace(/import \{.*?\} from 'lucide-react';/, (match) => {
    if (!match.includes('Camera')) {
        return match.replace(" } from 'lucide-react'", ", Camera } from 'lucide-react'");
    }
    return match;
});

fs.writeFileSync('src/pages/PatientDetail.tsx', adminCode);

// --- PatientPortal.tsx ---
let portalCode = fs.readFileSync('src/pages/PatientPortal.tsx', 'utf-8');

// Replace iframe render in PatientPortal
const iframeRegexPortal = /<iframe[\s\S]*?<\/iframe>/;
const iframeReplacePortal = `
                        {ex.url.startsWith('data:video') ? (
                          <video src={ex.url} controls className="w-full h-full object-cover"></video>
                        ) : (
                          <iframe 
                            src={ex.url} 
                            className="w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowFullScreen
                          ></iframe>
                        )}
`;
portalCode = portalCode.replace(iframeRegexPortal, iframeReplacePortal);

fs.writeFileSync('src/pages/PatientPortal.tsx', portalCode);

console.log('Successfully added video upload functionality.');
