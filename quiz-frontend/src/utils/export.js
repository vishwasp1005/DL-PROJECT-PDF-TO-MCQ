/**
 * Export questions array to a downloadable HTML file.
 */
export function exportToHTML(questions, title = "QuizGenius Export") {
  const rows = questions
    .map((q, i) => {
      const opts = (Array.isArray(q.options) ? q.options : [])
        .map((opt) => {
          const letter = opt.charAt(0);
          const isCorrect = letter === q.correct;
          return `<li style="padding:.5rem 1rem;border-radius:6px;margin:.3rem 0;
            background:${isCorrect ? "#fff7ed" : "#fafafa"};
            border-left:3px solid ${isCorrect ? "#e84c1e" : "transparent"};
            color:${isCorrect ? "#e84c1e" : "#555"};font-size:.9rem;">
            ${escHtml(opt)}
          </li>`;
        })
        .join("");
      return `<div style="margin-bottom:1.5rem;padding:1.5rem;border:1px solid #e5e7eb;
        border-radius:12px;background:#fff;">
        <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;
          color:#9ca3af;margin-bottom:.5rem;">Q${i + 1} · ${q.type || "MCQ"}</div>
        <div style="font-size:1rem;font-weight:700;color:#111;margin-bottom:.875rem;">
          ${escHtml(q.question)}</div>
        <ul style="list-style:none;padding:0;margin:0;">${opts}</ul>
      </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escHtml(title)}</title>
<style>body{font-family:system-ui;max-width:800px;margin:3rem auto;
  padding:0 1.5rem;background:#f8f5f0;}</style></head>
<body>
<h1 style="font-weight:800;color:#111;">${escHtml(title)}</h1>
<p style="color:#9ca3af;">${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })} · QuizGenius AI</p>
${rows}
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// Alias for backward compatibility
export const exportHTML = exportToHTML;

/**
 * Export questions as a printable PDF via browser print dialog.
 */
export function exportPDF(questions, title = "QuizGenius Export") {
  const rows = questions.map((q, i) => {
    const opts = (Array.isArray(q.options) ? q.options : [])
      .map(opt => {
        const isCorrect = opt.charAt(0) === q.correct;
        return `<div style="padding:.4rem .75rem;border-radius:6px;margin:.25rem 0;
                    background:${isCorrect ? "#ecfdf5" : "#f9fafb"};
                    border-left:3px solid ${isCorrect ? "#10B981" : "transparent"};
                    color:${isCorrect ? "#065f46" : "#374151"};font-size:.85rem;">
                    ${isCorrect ? "✓ " : ""}${escHtml(opt)}
                </div>`;
      }).join("");
    return `<div style="page-break-inside:avoid;margin-bottom:1.5rem;padding:1.25rem;
            border:1px solid #e5e7eb;border-radius:10px;background:#fff;">
            <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:.4rem;">
                Q${i + 1} · ${q.type || "MCQ"} · ${q.difficulty || ""}
            </div>
            <div style="font-weight:700;color:#111;margin-bottom:.75rem;font-size:.95rem;">${escHtml(q.question)}</div>
            ${opts}
        </div>`;
  }).join("");

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>${escHtml(title)}</title>
    <style>
        body{font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1.5rem;background:#f8fafc;color:#111}
        h1{font-size:1.5rem;font-weight:800;margin-bottom:.25rem}
        .meta{color:#9ca3af;font-size:.8rem;margin-bottom:1.5rem}
        @media print{body{margin:0}@page{margin:1.5cm}}
    </style></head><body>
    <h1>${escHtml(title)}</h1>
    <div class="meta">${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })} · QuizGenius AI</div>
    ${rows}
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`);
  win.document.close();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
