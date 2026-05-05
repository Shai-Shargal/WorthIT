import type { Listing } from '../../types/listing.js';
import { chromium } from 'playwright';
import { makeListingId, parsePrice, toAbsoluteUrl } from './utils.js';

const YAD2_ORIGIN = 'https://www.yad2.co.il';

export async function scrapeYad2(query: string): Promise<Listing[]> {
  const userDataDir = process.env.YAD2_USER_DATA_DIR;
  const context = userDataDir
    ? await chromium.launchPersistentContext(userDataDir, {
        headless: true,
        viewport: { width: 1440, height: 900 },
      })
    : await chromium.launchPersistentContext('/tmp/worthit-yad2-profile', {
        headless: true,
        viewport: { width: 1440, height: 900 },
      });
  try {
    const page = await context.newPage();
    await page.goto(`${YAD2_ORIGIN}/products?query=${encodeURIComponent(query)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(3500);
    const title = await page.title();
    if (title.toLowerCase().includes('captcha')) {
      throw new Error('Yad2 challenge page detected (captcha). Run with a solved profile via YAD2_USER_DATA_DIR.');
    }

    const rows = await page.$$eval('a[href*="/item/"], a[href*="/product/"]', (anchors) => {
      type Raw = { title: string; link: string; priceText: string; image: string; location: string };
      return (anchors as any[]).slice(0, 60).map((anchor: any): Raw => {
        const link = (anchor.getAttribute?.('href') as string) ?? '';
        const title =
          ((anchor.querySelector?.('h2, h3, [class*=title]')?.textContent as string | undefined)?.trim()) ??
          ((anchor.textContent as string | undefined)
            ?.split('\n')
            .map((x: string) => x.trim())
            .find(Boolean) as string | undefined) ??
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
            const maybe = (node.querySelector?.('[class*=location], [class*=city]')?.textContent as
              | string
              | undefined)?.trim();
            if (maybe) location = maybe;
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
        const url = toAbsoluteUrl(row.link, YAD2_ORIGIN);
        if (!price || !url || !row.title) return null;
        return {
          id: makeListingId('yad2', row.title, index),
          title: row.title,
          price,
          source: 'yad2' as const,
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
