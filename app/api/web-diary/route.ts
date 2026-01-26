import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// Ensure this is server-only
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WEB_DIARY_URL = 'https://www.allahabadhighcourt.in/calendar/dateWise.jsp';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');
    const date = searchParams.get('date');

    let url = WEB_DIARY_URL;
    if (month && year) {
      url += `?month=${month}&year=${year}`;
    }

    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Parse calendar structure
    const calendarData: {
      months: string[];
      years: string[];
      currentMonth: string;
      currentYear: string;
      calendar: Array<Array<number | null>>;
      diaryLinks?: Array<{ judge: string; link: string }>;
      notifications?: Array<{ title: string; pdfLink?: string; date: string; allLinks?: Array<{ type: string; link: string }> }>;
    } = {
      months: [],
      years: [],
      currentMonth: '',
      currentYear: '',
      calendar: [],
      diaryLinks: [],
    };

    // Extract month options
    $('select[name="month"] option').each((_, el) => {
      const monthValue = $(el).attr('value') || $(el).text().trim();
      if (monthValue) {
        calendarData.months.push(monthValue);
      }
    });

    // Extract year options
    $('select[name="year"] option').each((_, el) => {
      const yearValue = $(el).attr('value') || $(el).text().trim();
      if (yearValue && !isNaN(parseInt(yearValue))) {
        calendarData.years.push(yearValue);
      }
    });

    // Get current selected month and year
    const selectedMonth = $('select[name="month"]').val() as string || '';
    const selectedYear = $('select[name="year"]').val() as string || '';
    calendarData.currentMonth = selectedMonth;
    calendarData.currentYear = selectedYear;

    // Parse calendar table
    const calendarTable = $('table').first();
    const rows: Array<Array<number | null>> = [];

    calendarTable.find('tr').each((rowIndex, row) => {
      const cells: Array<number | null> = [];
      $(row).find('td').each((_, cell) => {
        const text = $(cell).text().trim();
        const day = parseInt(text);
        if (!isNaN(day)) {
          cells.push(day);
        } else if (text === '') {
          cells.push(null);
        }
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });

    calendarData.calendar = rows;

    // If date is provided, fetch diary links for that date
    if (date) {
      // Parse date - can be in format "day/month/year" or separate params
      let day: string, monthNum: string, yearNum: string;
      
      if (date.includes('/')) {
        [day, monthNum, yearNum] = date.split('/');
      } else {
        // If only day is provided, use current month/year from params
        day = date;
        monthNum = month || '';
        yearNum = year || '';
      }
      
      if (day && monthNum && yearNum) {
        // The actual content is in frame.jsp, not dateWise.jsp
        // Convert month number to month name
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[parseInt(monthNum) - 1] || monthNum;
        
        const frameUrl = `https://www.allahabadhighcourt.in/calendar/frame.jsp?date=${day}&month=${monthName}&year=${yearNum}`;
        
        try {
          // Create AbortController for timeout with longer timeout for slow connections
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
          
          let dateResponse: Response;
          try {
            dateResponse = await fetch(frameUrl, {
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
            });
            clearTimeout(timeoutId);
          } catch (fetchError) {
            clearTimeout(timeoutId);
            // If timeout or network error, log and continue with empty data
            if (fetchError instanceof Error && (fetchError.name === 'AbortError' || fetchError.message.includes('timeout'))) {
              console.error(`Timeout fetching diary for date ${day}/${monthNum}/${yearNum}`);
              calendarData.diaryLinks = [];
              calendarData.notifications = [];
              return NextResponse.json({
                success: true,
                data: calendarData,
              });
            }
            throw fetchError; // Re-throw other errors
          }
          
          if (dateResponse.ok) {
            const dateHtml = await dateResponse.text();
            const $date = cheerio.load(dateHtml);
            
            const links: Array<{ judge: string; link: string }> = [];
            const notifications: Array<{ title: string; pdfLink?: string; date: string; allLinks?: Array<{ type: string; link: string }> }> = [];
            
            // The content is in <LI> elements with <FONT> and <A> tags
            // Structure: <LI><FONT>TEXT <A HREF="pdf">PDF</A></FONT></LI>
            // Each <LI> represents one notification/entry
            $date('li').each((_, li) => {
              const $li = $date(li);
              
              // Get all links in this LI (PDF, ODT, DOC, HTML)
              const $allLinks = $li.find('a');
              
              if ($allLinks.length === 0) {
                return; // Skip LIs without links
              }
              
              // Get text only from FONT elements within this specific LI
              let description = '';
              
              // Get text from FONT children only
              $li.find('font').each((_, font) => {
                const $font = $date(font);
                // Clone and remove links to get clean text
                const fontElement = $font.get(0);
                if (!fontElement) return;
                const $fontClone = $date(fontElement.cloneNode(true));
                $fontClone.find('a').remove();
                const fontText = $fontClone.text().trim();
                // Only add meaningful text (not just "PDF", "ODT", etc.)
                if (fontText && !fontText.match(/^\s*(PDF|ODT|DOC|HTML)\s*$/i) && fontText.length > 3) {
                  if (description) {
                    description += ' ' + fontText;
                  } else {
                    description = fontText;
                  }
                }
              });
              
              // Clean up the description
              description = description.replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').trim();
              
              if (!description) {
                return; // Skip if no description
              }
              
              // Collect all links for this notification
              const allLinks: Array<{ type: string; link: string }> = [];
              let pdfLink: string | undefined;
              
              $allLinks.each((_, link) => {
                const $link = $date(link);
                const href = $link.attr('href') || '';
                const linkText = $link.text().trim().toUpperCase();
                
                if (href) {
                  const fullUrl = href.startsWith('http') ? href : `https://www.allahabadhighcourt.in${href}`;
                  const linkType = linkText || (href.includes('.pdf') ? 'PDF' : href.includes('.odt') ? 'ODT' : href.includes('.doc') ? 'DOC' : href.includes('.html') ? 'HTML' : 'Link');
                  
                  allLinks.push({ type: linkType, link: fullUrl });
                  
                  // Set PDF link if available
                  if (!pdfLink && (linkText === 'PDF' || href.includes('.pdf'))) {
                    pdfLink = fullUrl;
                  }
                  
                  // Also add to legacy links array for backward compatibility
                  if (linkText === 'PDF' || href.includes('.pdf')) {
                    if (!links.some(l => l.link === fullUrl)) {
                      links.push({ judge: description, link: fullUrl });
                    }
                  }
                }
              });
              
              // Create notification entry
              notifications.push({
                title: description,
                pdfLink,
                date: `${day}/${monthNum}/${yearNum}`,
                allLinks: allLinks.length > 0 ? allLinks : undefined,
              });
            });
            
            // Fallback: Look for any PDF links not in list items
            $date('a[href*=".pdf"], a[href*=".PDF"]').each((_, link) => {
              const $link = $date(link);
              const href = $link.attr('href') || '';
              const linkText = $link.text().trim().toUpperCase();
              
              // Skip if already processed in list items
              const alreadyAdded = links.some(l => {
                const url = href.startsWith('http') ? href : `https://www.allahabadhighcourt.in${href}`;
                return l.link === url;
              });
              
              if (href && !alreadyAdded && (linkText === 'PDF' || href.includes('.pdf'))) {
                // Try to get description from parent elements
                let description = '';
                let $parent = $link.parent();
                
                for (let i = 0; i < 3 && $parent.length; i++) {
                  const $clone = $parent.clone();
                  $clone.find('a').remove();
                  const parentText = $clone.text().trim().replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ');
                  if (parentText && !parentText.match(/^\s*(PDF|ODT|DOC|HTML)\s*$/i)) {
                    description = parentText;
                    break;
                  }
                  $parent = $parent.parent();
                }
                
                const fullUrl = href.startsWith('http') ? href : `https://www.allahabadhighcourt.in${href}`;
                const displayText = description || 'Diary PDF';
                
                links.push({ judge: displayText, link: fullUrl });
              }
            });

            // Method 3: Look for list items with buttons/links (judge buttons)
            $date('li button, li a, li input[type="button"]').each((_, el) => {
              const $el = $date(el);
              const text = $el.text().trim() || $el.attr('value') || $el.attr('title') || '';
              const onclick = $el.attr('onclick') || '';
              const href = $el.attr('href') || '';
              
              let pdfUrl = '';
              
              if (onclick) {
                const patterns = [
                  /(?:window\.open|loadPDF|location\.href)\s*\(\s*['"]([^'"]+\.pdf[^'"]*)['"]/i,
                  /(?:href|src|url)\s*[=:]\s*['"]([^'"]+\.pdf[^'"]*)['"]/i,
                  /(https?:\/\/[^\s'"]+\.pdf)/i,
                  /(\/[^\s'"]+\.pdf)/i,
                ];
                
                for (const pattern of patterns) {
                  const match = onclick.match(pattern);
                  if (match) {
                    pdfUrl = match[1];
                    break;
                  }
                }
              }
              
              if (!pdfUrl && href) {
                pdfUrl = href;
              }
              
              if (pdfUrl && text) {
                const fullUrl = pdfUrl.startsWith('http') ? pdfUrl : `https://www.allahabadhighcourt.in${pdfUrl}`;
                if (!links.some(l => l.link === fullUrl && l.judge === text)) {
                  links.push({ judge: text, link: fullUrl });
                }
              }
            });

            // Method 4: Check iframe - might contain the actual content
            const iframes: string[] = [];
            $date('iframe').each((_, iframe) => {
              const src = $date(iframe).attr('src');
              if (src) {
                iframes.push(src);
              }
            });
            
            // Process iframes sequentially
            for (const iframeSrc of iframes) {
              const iframeUrl = iframeSrc.startsWith('http') ? iframeSrc : `https://www.allahabadhighcourt.in${iframeSrc}`;
              
              // If iframe contains PDF directly
              if (iframeSrc.includes('.pdf')) {
                if (!links.some(l => l.link === iframeUrl)) {
                  links.push({ judge: 'Diary PDF', link: iframeUrl });
                }
              } else {
                // Try to fetch iframe content
                try {
                  const iframeResponse = await fetch(iframeUrl, {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                  });
                  
                  if (iframeResponse.ok) {
                    const iframeHtml = await iframeResponse.text();
                    const $iframe = cheerio.load(iframeHtml);
                    
                    // Parse links from iframe
                    $iframe('a[href*="pdf"], a[href*="PDF"]').each((_, link) => {
                      const $link = $iframe(link);
                      const href = $link.attr('href') || '';
                      
                      if (href) {
                        // Get row text
                        const $row = $link.closest('tr');
                        let description = '';
                        
                        if ($row.length) {
                          const $rowClone = $row.clone();
                          $rowClone.find('a').remove();
                          description = $rowClone.text().trim().replace(/\s+/g, ' ');
                        }
                        
                        const fullUrl = href.startsWith('http') ? href : `https://www.allahabadhighcourt.in${href}`;
                        const displayText = description || $link.text().trim() || 'Diary PDF';
                        
                        if (!links.some(l => l.link === fullUrl)) {
                          links.push({ judge: displayText, link: fullUrl });
                        }
                      }
                    });
                  }
                } catch (err) {
                  console.error('Error fetching iframe content:', err);
                }
              }
            }

            calendarData.diaryLinks = links;
            calendarData.notifications = notifications;
          }
        } catch (err) {
          console.error('Error fetching date-specific diary:', err);
          // If there's a timeout or connection error, still return empty arrays
          // The error is logged but we don't want to fail the entire request
          calendarData.diaryLinks = [];
          calendarData.notifications = [];
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: calendarData,
    });
  } catch (error) {
    console.error('Error fetching web diary:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

