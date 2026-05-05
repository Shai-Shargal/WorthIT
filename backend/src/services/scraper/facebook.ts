import type { Listing } from '../../types/listing.js';
import { chromium } from 'playwright';
import { makeListingId, parsePrice, toAbsoluteUrl } from './utils.js';

const FACEBOOK_ORIGIN = 'https://www.facebook.com';

export async function scrapeFacebook(query: string): Promise<Listing[]> {
  const userDataDir = process.env.FB_USER_DATA_DIR;
  if (!userDataDir) {
    throw new Error('FB_USER_DATA_DIR is required for authenticated Facebook scraping.');
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });

  try {
    const page = await context.newPage();
    await page.goto(
      `${FACEBOOK_ORIGIN}/marketplace/search?query=${encodeURIComponent(query)}`,
      { waitUntil: 'domcontentloaded', timeout: 45000 },
    );
    await page.waitForTimeout(3500);

    const rows = await page.$$eval('a[href*="/marketplace/item/"]', (cards) => {
      type Raw = { title: string; link: string; priceText: string; image: string; location: string };
      return (cards as any[]).slice(0, 40).map((anchor: any): Raw => {
        const link = (anchor.getAttribute?.('href') as string) ?? '';
        const textLines = ((anchor.innerText as string | undefined) ?? '')
          .split('\n')
          .map((x: string) => x.trim())
          .filter(Boolean);
        const title =
          textLines.find((line) => !/(?:₪|\$|€|£)\s?[\d,.]+|[\d,.]+\s?(?:₪|NIS|ILS|USD|US\$)/i.test(line)) ??
          textLines[0] ??
          '';

        let node: any = anchor;
        let priceText = '';
        let image = '';
        let location = '';
        for (let depth = 0; depth < 6 && node; depth += 1) {
          const text = (node.innerText as string | undefined) ?? '';
          if (!priceText) {
            const m = text.match(/(?:₪|\$|€|£)\s?[\d,.]+|[\d,.]+\s?(?:₪|NIS|ILS|USD)/i);
            if (m) priceText = m[0];
          }
          if (!image) {
            const img = node.querySelector?.('img') as any;
            image = (img?.src as string | undefined) ?? '';
          }
          if (!location) {
            const lines = text
              .split('\n')
              .map((x: string) => x.trim())
              .filter(Boolean);
            location =
              lines.find(
                (line: string) =>
                  line.length > 1 &&
                  !line.includes('Sponsored') &&
                  !/(?:₪|\$|€|£)\s?[\d,.]+|[\d,.]+\s?(?:₪|NIS|ILS|USD|US\$)/i.test(line),
              ) ?? '';
          }
          node = node.parentElement;
        }

        return { title, link, priceText, image, location };
      });
    });

    const now = new Date();
    const mapped = rows
      .map((row, index): Listing | null => {
        const price = parsePrice(row.priceText);
        const url = toAbsoluteUrl(row.link, FACEBOOK_ORIGIN);
        if (!price || !url || !row.title) return null;
        return {
          id: makeListingId('facebook', row.title, index),
          title: row.title,
          price,
          source: 'facebook' as const,
          url,
          image: row.image || undefined,
          location: row.location || undefined,
          extractedAt: now,
        };
      })
      .filter((x): x is Listing => x !== null);
    return mapped;
  } finally {
    await context.close();
  }
}
