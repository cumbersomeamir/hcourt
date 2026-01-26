// Server-only module - ensure this is not imported in client code
if (typeof window !== 'undefined') {
  throw new Error('lib/parser.ts can only be used on the server');
}

import * as cheerio from 'cheerio';

export interface ParsedCourtCase {
  courtNo: string;
  serialNo: string | null;
  list: string | null;
  progress: string | null;
  caseDetails: {
    caseNumber: string;
    title: string;
    petitionerCounsels: string[];
    respondentCounsels: string[];
  } | null;
  isInSession: boolean;
}

export function parseCourtSchedule(html: string): ParsedCourtCase[] {
  const $ = cheerio.load(html);
  const courts: ParsedCourtCase[] = [];

  // Find the main table
  const table = $('table').first();
  
  // Skip header row and iterate through data rows
  table.find('tr').slice(1).each((index, element) => {
    const $row = $(element);
    const cells = $row.find('td');
    
    if (cells.length === 0) return;

    const courtNo = $(cells[0]).text().trim();
    const serialNoText = $(cells[1]).text().trim();
    const listText = $(cells[2]).text().trim();
    const progressText = $(cells[3]).text().trim();
    const caseDetailsCell = $(cells[4]);
    const caseDetailsText = caseDetailsCell.text().trim();
    
    // Check if court is in session
    const isInSession = !serialNoText.includes('NOT in session') && !caseDetailsText.includes('NOT in session');
    
    let serialNo: string | null = null;
    let list: string | null = null;
    let progress: string | null = null;
    let caseDetails: ParsedCourtCase['caseDetails'] = null;

    if (isInSession) {
      serialNo = serialNoText || null;
      list = listText || null;
      progress = progressText || null;

      // Parse case details
      if (caseDetailsText && caseDetailsText.length > 0) {
        let caseNumber = '';
        let title = '';
        const petitionerCounsels: string[] = [];
        const respondentCounsels: string[] = [];

        // Extract Case Details - format: "Case Details - CASE123/2023"
        const caseDetailsMatch = caseDetailsText.match(/Case\s+Details\s*[–\-]\s*([A-Z0-9\/]+)/i);
        if (caseDetailsMatch) {
          caseNumber = caseDetailsMatch[1].trim();
        }

        // Extract Title - can span multiple lines
        // Format: "Title :TITLE TEXT" (may continue on next line with spaces)
        const titleMatch = caseDetailsText.match(/Title\s*:\s*([^\n]+(?:\n\s+[^\n]+)*?)(?:\s+Petitioner|$)/);
        if (titleMatch) {
          title = titleMatch[1]
            .replace(/\s+/g, ' ')
            .replace(/Vs\./g, 'Vs.')
            .trim();
        }

        // Extract Petitioner's Counsels
        const petitionerMatch = caseDetailsText.match(/Petitioner'?s?\s+Counsels?\s*[–\-]\s*([^\n]+?)(?:\s+Respondent|$)/);
        if (petitionerMatch) {
          const counselsText = petitionerMatch[1].trim();
          const counsels = counselsText.split(',').map(c => c.trim()).filter(c => c);
          petitionerCounsels.push(...counsels);
        }

        // Extract Respondent's Counsel
        const respondentMatch = caseDetailsText.match(/Respondent'?s?\s+Counsels?\s*[–\-]\s*(.+?)(?:\s*$|$)/);
        if (respondentMatch) {
          const counselsText = respondentMatch[1].trim();
          const counsels = counselsText.split(',').map(c => c.trim()).filter(c => c);
          respondentCounsels.push(...counsels);
        }

        // If we have at least a case number or title, create case details
        if (caseNumber || title) {
          caseDetails = {
            caseNumber: caseNumber || 'N/A',
            title: title || 'N/A',
            petitionerCounsels: petitionerCounsels.filter(c => c),
            respondentCounsels: respondentCounsels.filter(c => c),
          };
        }
      }
    }

    courts.push({
      courtNo,
      serialNo,
      list,
      progress,
      caseDetails,
      isInSession,
    });
  });

  return courts;
}
