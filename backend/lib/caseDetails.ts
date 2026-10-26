export type CaseDetailSection = { title: string; columns: string[]; rows: string[][] };

export function buildCaseSections(details: {
  keyValues: Array<{ key: string; value: string }>;
  listingHistory: Array<Record<string, string>>;
  iaDetails: Array<Record<string, string>>;
}): CaseDetailSection[] {
  const registration: string[][] = [], status: string[][] = [], parties: string[][] = [], acts: string[][] = [], category: string[][] = [];
  const fields = details.keyValues;
  for (let i = 0; i < fields.length; i++) {
    const { key, value } = fields[i];
    if (/^petitioner$/i.test(key.trim()) && /^respondent$/i.test(value.trim()) && fields[i + 1]) {
      const next = fields[++i];
      parties.push(['Petitioner', next.key], ['Respondent', next.value]);
    } else if (/^under act/i.test(key) && /^under section/i.test(value) && fields[i + 1]) {
      const next = fields[++i];
      acts.push(['Under Act(s)', next.key], ['Under Section(s)', next.value]);
    } else if (/^(filing\s*(no|number|date)|cnr|date of registration|registration)/i.test(key)) registration.push([key, value]);
    else if (/^(petitioner|respondent|appellant|applicant|opposite party|advocate|counsel)/i.test(key)) parties.push([key, value]);
    else if (/^under (act|section)/i.test(key)) acts.push([key, value]);
    else if (/^(sub\s*category|category)/i.test(key)) category.push([key, value]);
    else status.push([key, value]);
  }
  const sections: CaseDetailSection[] = [];
  for (const row of parties) {
    row[1] = row[1].replace(/\s*Advocate\s*-\s*/gi, '\n\nAdvocate - ').replace(/([A-Za-z)])(\d+\.\s)/g, '$1\n$2').trim();
  }
  for (const [title, rows] of [['Registration Details', registration], ['Case Status', status], ['Petitioner/Respondent and their Advocate(s)', parties], ['Acts', acts], ['Category Details', category]] as const) {
    if (rows.length) sections.push(rows === parties || rows === acts
      ? { title, columns: rows.map(row => row[0]), rows: [rows.map(row => row[1])] }
      : { title, columns: ['Particulars', 'Details'], rows });
  }
  for (const [title, records] of [['IA Details', details.iaDetails], ['Listing History', details.listingHistory]] as const) {
    if (!records.length) continue;
    const columns = [...new Set(records.flatMap(record => Object.keys(record)))];
    sections.push({ title, columns, rows: records.map(record => columns.map(column => record[column] || '')) });
  }
  return sections;
}
