import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// Ensure this is server-only
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WEB_DIARY_URL = 'https://www.allahabadhighcourt.in/calendar/dateWise.jsp';
const WEB_DIARY_BASE_URL = 'https://www.allahabadhighcourt.in';
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parseMonthToNumber(input: string | null): number | null {
  if (!input) return null;
  const value = input.trim();
  if (!value) return null;

  if (/^\d{1,2}$/.test(value)) {
    const month = parseInt(value, 10);
    return month >= 1 && month <= 12 ? month : null;
  }

  const index = MONTH_NAMES.findIndex((name) => name.toLowerCase() === value.toLowerCase());
  return index >= 0 ? index + 1 : null;
}

function parseYear(input: string | null): number | null {
  if (!input) return null;
  const value = input.trim();
  if (!/^\d{4}$/.test(value)) return null;
  return parseInt(value, 10);
}

function isSelectedDateLabel(label: string, day: number, month: number, year: number): boolean {
  const match = label.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return false;
  const labelDay = parseInt(match[1], 10);
  const labelMonth = parseInt(match[2], 10);
  const labelYear = parseInt(match[3], 10);
  return labelDay === day && labelMonth === month && labelYear === year;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');
    const date = searchParams.get('date');

    let url = WEB_DIARY_URL;
    const requestedMonthNumber = parseMonthToNumber(month);
    const requestedYear = parseYear(year);
    const requestedMonthName =
      requestedMonthNumber !== null ? MONTH_NAMES[requestedMonthNumber - 1] : month?.trim() || '';

    if (requestedMonthName && requestedYear !== null) {
      url += `?month=${encodeURIComponent(requestedMonthName)}&year=${requestedYear}`;
    }

    const response = await fetch(url, {
      cache: 'no-store',
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
      let dayNum: number | null = null;
      let monthNum: number | null = null;
      let yearNum: number | null = null;

      if (date.includes('/')) {
        const [dayPart, monthPart, yearPart] = date.split('/');
        dayNum = /^\d{1,2}$/.test(dayPart) ? parseInt(dayPart, 10) : null;
        monthNum = /^\d{1,2}$/.test(monthPart)
          ? parseInt(monthPart, 10)
          : parseMonthToNumber(monthPart);
        yearNum = parseYear(yearPart);
      } else {
        dayNum = /^\d{1,2}$/.test(date) ? parseInt(date, 10) : null;
        monthNum = parseMonthToNumber(month);
        yearNum = parseYear(year);
      }

      if (dayNum && monthNum && yearNum) {
        const monthName = MONTH_NAMES[monthNum - 1];
        const frameUrl =
          `${WEB_DIARY_BASE_URL}/calendar/frame.jsp?` +
          `date=${dayNum}&month=${encodeURIComponent(monthName)}&year=${yearNum}`;

        try {
          // Create AbortController for timeout with longer timeout for slow connections
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
          
          let dateResponse: Response;
          try {
            dateResponse = await fetch(frameUrl, {
              signal: controller.signal,
              cache: 'no-store',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
            });
            clearTimeout(timeoutId);
          } catch (fetchError) {
            clearTimeout(timeoutId);
            // If timeout or network error, log and continue with empty data
            if (fetchError instanceof Error && (fetchError.name === 'AbortError' || fetchError.message.includes('timeout'))) {
              console.error(`Timeout fetching diary for date ${dayNum}/${monthNum}/${yearNum}`);
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

            const daySection = $date('#datacontainer > ul > li')
              .filter((_, dayLi) => {
                const dayLabel = $date(dayLi)
                  .clone()
                  .children()
                  .remove()
                  .end()
                  .text()
                  .replace(/\u00a0/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                return isSelectedDateLabel(dayLabel, dayNum as number, monthNum as number, yearNum as number);
              })
              .first();

            if (daySection.length > 0) {
              daySection.find('> ul > li').each((_, entry) => {
                const $entry = $date(entry);
                const entryLinks = $entry.find('a');

                if (entryLinks.length === 0) {
                  return;
                }

                let description = '';
                $entry.find('font').each((_, font) => {
                  const fontElement = $date(font).get(0);
                  if (!fontElement) return;
                  const $fontClone = $date(fontElement.cloneNode(true));
                  $fontClone.find('a').remove();
                  const fontText = $fontClone
                    .text()
                    .replace(/\u00a0/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                  if (fontText && !fontText.match(/^\s*(PDF|ODT|DOC|HTML)\s*$/i) && fontText.length > 3) {
                    description = description ? `${description} ${fontText}` : fontText;
                  }
                });

                if (!description) {
                  const $entryClone = $entry.clone();
                  $entryClone.find('a').remove();
                  description = $entryClone
                    .text()
                    .replace(/\u00a0/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                }

                if (!description) {
                  return;
                }

                const allLinks: Array<{ type: string; link: string }> = [];
                let pdfLink: string | undefined;

                entryLinks.each((_, link) => {
                  const $link = $date(link);
                  const href = ($link.attr('href') || '').trim();
                  const linkText = ($link.text() || '').trim().toUpperCase();

                  if (!href) return;

                  const fullUrl = href.startsWith('http') ? href : `${WEB_DIARY_BASE_URL}${href}`;
                  let linkType = linkText;
                  if (!linkType) {
                    if (/\.pdf(\?|$)/i.test(href)) linkType = 'PDF';
                    else if (/\.odt(\?|$)/i.test(href)) linkType = 'ODT';
                    else if (/\.doc(\?|$)/i.test(href)) linkType = 'DOC';
                    else if (/\.html?(\?|$)/i.test(href)) linkType = 'HTML';
                    else linkType = 'LINK';
                  }

                  if (!allLinks.some((item) => item.link === fullUrl && item.type === linkType)) {
                    allLinks.push({ type: linkType, link: fullUrl });
                  }

                  if (!pdfLink && (linkType === 'PDF' || /\.pdf(\?|$)/i.test(href))) {
                    pdfLink = fullUrl;
                  }

                  if ((linkType === 'PDF' || /\.pdf(\?|$)/i.test(href)) && !links.some((l) => l.link === fullUrl)) {
                    links.push({ judge: description, link: fullUrl });
                  }
                });

                notifications.push({
                  title: description,
                  pdfLink,
                  date: `${dayNum}/${monthNum}/${yearNum}`,
                  allLinks: allLinks.length > 0 ? allLinks : undefined,
                });
              });
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
