export default function CaseBrief({ text }: { text: string }) {
  const inline = (value: string) => value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**')
    ? <strong key={index} className="font-semibold text-slate-50">{part.slice(2, -2)}</strong> : part);
  return <div className="space-y-3 font-sans text-[15px] leading-7 text-slate-300">
    {text.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
      const heading = line.match(/^#{1,6}\s+(.+)$/) || line.match(/^\*\*(.+)\*\*:?$/);
      if (heading) return <h4 key={index} className="!mt-6 border-b border-sky-400/20 pb-2 text-base font-semibold tracking-wide text-sky-200">{inline(heading[1])}</h4>;
      const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
      return bullet ? <div key={index} className="flex gap-3"><span aria-hidden="true" className="text-sky-300">•</span><p className="min-w-0">{inline(bullet[1])}</p></div> : <p key={index}>{inline(line)}</p>;
    })}
  </div>;
}
