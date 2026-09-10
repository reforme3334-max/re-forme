const fs = require('fs');
let code = fs.readFileSync('src/pages/PatientDetail.tsx', 'utf-8');

// Remove the wrongly placed handlers
const handlersStart = code.indexOf("const handleAddVideo = (e: React.FormEvent) => {");
const handlersEnd = code.indexOf("};", code.indexOf("const handleDeleteExercise =")) + 2;

if (handlersStart !== -1) {
    code = code.slice(0, handlersStart) + code.slice(handlersEnd);
}

// Now put it right before the main return statement of PatientDetail
// Let's find "if (loading) return (" or something similar.
const mainReturnPos = code.indexOf("if (loading) {");
if (mainReturnPos === -1) {
    console.error("Cannot find main return!");
}

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

code = code.slice(0, mainReturnPos) + handlersInsert + code.slice(mainReturnPos);

fs.writeFileSync('src/pages/PatientDetail.tsx', code);
console.log('Fixed PatientDetail.tsx');
