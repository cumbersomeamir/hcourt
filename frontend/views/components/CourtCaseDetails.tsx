type Section = { title: string; columns: string[]; rows: string[][] };

export default function CourtCaseDetails({ sections }: { sections: Section[] }) {
  return (
    <div className="mt-6 space-y-5 rounded-xl border border-slate-700/60 bg-slate-900 p-3 text-slate-200 sm:p-5">
      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`}>
          <h3 className={`mb-2 text-center text-sm font-semibold sm:text-base ${section.title === 'Case Status' ? 'text-red-300' : 'text-slate-100'}`}>{section.title}</h3>
          <div className="overflow-x-auto">
            <table className={`w-full border-collapse text-left text-xs sm:text-sm ${section.columns.length === 2 ? 'table-fixed' : ''} ${section.title === 'Case Status' ? 'bg-red-500/5 text-red-300' : section.title === 'Acts' ? 'bg-emerald-500/5 text-emerald-200' : section.title === 'Listing History' ? 'bg-amber-500/10 text-amber-200' : 'bg-slate-900'}`}>
              {section.columns[0] !== 'Particulars' && (
                <thead className="bg-white/[0.025]">
                  <tr>{section.columns.map((column, i) => <th key={i} className="border border-current/40 px-2 py-1.5 align-top font-semibold">{column}</th>)}</tr>
                </thead>
              )}
              <tbody>{section.rows.map((row, i) => (
                <tr key={i}>{section.columns.map((_, j) => (
                  <td key={j} className={`border border-current/40 px-2 py-1.5 align-top whitespace-pre-wrap break-words ${section.columns[0] === 'Particulars' && j === 0 ? 'w-2/5 font-medium' : ''} ${section.columns.length > 2 ? 'min-w-32' : ''}`}>
                    {row[j] || '—'}
                  </td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
