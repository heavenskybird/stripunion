import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:4321';
const outputDir = process.env.VISUAL_OUTPUT_DIR || 'artifacts/visual-qa';
const defaultTargets = [
  '/',
  '/guides/adult-affiliate-webmaster-program-evaluation-guide/',
  '/guides/premium-adult-video-subscription-value-privacy-guide/',
  '/guides/adult-site-payment-privacy-billing-guide/',
  '/guides/creator-fan-platform-selection-guide/',
  '/best-live-cam-sites/'
];
const targets = process.env.VISUAL_TARGETS_JSON
  ? JSON.parse(process.env.VISUAL_TARGETS_JSON)
  : defaultTargets;
const viewports = [
  { name: 'mobile-320', width: 320, height: 760 },
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-412', width: 412, height: 915 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 1000 }
];

await fs.mkdir(outputDir, { recursive: true });

function targetUrl(target) {
  if (/^https?:\/\//i.test(target)) return target;
  return new URL(target, baseUrl).toString();
}

function slugify(value) {
  return value
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110) || 'home';
}

const browser = await chromium.launch({ headless: true });
const report = {
  version: 1,
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  failures: [],
  pages: []
};

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1
    });

    for (const target of targets) {
      const page = await context.newPage();
      const url = targetUrl(target);
      const pageRecord = {
        viewport: viewport.name,
        width: viewport.width,
        target,
        url,
        http_status: null,
        horizontal_overflow_px: null,
        low_contrast: [],
        blank_buttons: [],
        screenshot: null
      };

      try {
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
        pageRecord.http_status = response?.status() ?? null;
        if (!response || response.status() >= 400) {
          report.failures.push({
            type: 'HTTP_FAILURE',
            viewport: viewport.name,
            url,
            detail: `status=${response?.status() ?? 'no_response'}`
          });
        }

        await page.waitForTimeout(150);

        const audit = await page.evaluate(() => {
          const parseRgb = (value) => {
            const match = String(value).match(/rgba?\(([^)]+)\)/i);
            if (!match) return null;
            const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
            if (parts.length < 3 || parts.slice(0, 3).some((part) => Number.isNaN(part))) return null;
            return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
          };

          const composite = (front, back) => {
            const a = front.a + back.a * (1 - front.a);
            if (a <= 0) return { r: 255, g: 255, b: 255, a: 1 };
            return {
              r: (front.r * front.a + back.r * back.a * (1 - front.a)) / a,
              g: (front.g * front.a + back.g * back.a * (1 - front.a)) / a,
              b: (front.b * front.a + back.b * back.a * (1 - front.a)) / a,
              a
            };
          };

          const effectiveBackground = (element) => {
            const layers = [];
            let current = element;
            while (current && current instanceof Element) {
              const color = parseRgb(getComputedStyle(current).backgroundColor);
              if (color && color.a > 0) layers.push(color);
              current = current.parentElement;
            }
            let result = { r: 255, g: 255, b: 255, a: 1 };
            for (let index = layers.length - 1; index >= 0; index -= 1) {
              result = composite(layers[index], result);
            }
            return result;
          };

          const luminance = (rgb) => {
            const values = [rgb.r, rgb.g, rgb.b].map((component) => {
              const value = component / 255;
              return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
          };

          const contrast = (foreground, background) => {
            const l1 = luminance(foreground);
            const l2 = luminance(background);
            return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          };

          const isVisible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none'
              && style.visibility !== 'hidden'
              && Number.parseFloat(style.opacity || '1') > 0.02
              && rect.width > 1
              && rect.height > 1;
          };

          const selectorFor = (element) => {
            if (element.id) return '#' + element.id;
            const classes = [...element.classList].slice(0, 3).join('.');
            return element.tagName.toLowerCase() + (classes ? '.' + classes : '');
          };

          const contrastSelectors = [
            '.button-secondary',
            '.button-outline',
            '.guide-summary h2',
            '.guide-summary li',
            '.guide-summary .kicker',
            '.table-wrap th',
            '.table-wrap td',
            '.table-wrap caption'
          ].join(',');

          const lowContrast = [];
          for (const element of document.querySelectorAll(contrastSelectors)) {
            if (!isVisible(element) || !element.textContent?.trim()) continue;
            const color = parseRgb(getComputedStyle(element).color);
            if (!color) continue;
            const background = effectiveBackground(element);
            const ratio = contrast(color, background);
            if (ratio < 4.5) {
              lowContrast.push({
                selector: selectorFor(element),
                text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 100),
                ratio: Number(ratio.toFixed(2)),
                color: getComputedStyle(element).color,
                background: `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`
              });
            }
          }

          const blankButtons = [...document.querySelectorAll('a.button,button.button')]
            .filter(isVisible)
            .filter((element) => !element.textContent?.trim())
            .map(selectorFor);

          const root = document.documentElement;
          const horizontalOverflowPx = Math.max(0, root.scrollWidth - root.clientWidth);

          const overflowOffenders = [];
          if (horizontalOverflowPx > 2) {
            for (const element of document.body.querySelectorAll('*')) {
              if (!isVisible(element)) continue;
              const rect = element.getBoundingClientRect();
              if (rect.right <= root.clientWidth + 2 && rect.left >= -2) continue;

              let parent = element.parentElement;
              let containedByScroller = false;
              while (parent && parent !== document.body) {
                const style = getComputedStyle(parent);
                if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) {
                  containedByScroller = true;
                  break;
                }
                parent = parent.parentElement;
              }
              if (!containedByScroller) {
                overflowOffenders.push({
                  selector: selectorFor(element),
                  left: Math.round(rect.left),
                  right: Math.round(rect.right),
                  width: Math.round(rect.width)
                });
              }
              if (overflowOffenders.length >= 12) break;
            }
          }

          return { horizontalOverflowPx, overflowOffenders, lowContrast, blankButtons };
        });

        pageRecord.horizontal_overflow_px = audit.horizontalOverflowPx;
        pageRecord.low_contrast = audit.lowContrast;
        pageRecord.blank_buttons = audit.blankButtons;
        pageRecord.overflow_offenders = audit.overflowOffenders;

        if (audit.horizontalOverflowPx > 2) {
          report.failures.push({
            type: 'HORIZONTAL_OVERFLOW',
            viewport: viewport.name,
            url,
            detail: `${audit.horizontalOverflowPx}px`,
            offenders: audit.overflowOffenders
          });
        }
        for (const issue of audit.lowContrast) {
          report.failures.push({
            type: 'LOW_CONTRAST',
            viewport: viewport.name,
            url,
            ...issue
          });
        }
        for (const selector of audit.blankButtons) {
          report.failures.push({
            type: 'BLANK_BUTTON',
            viewport: viewport.name,
            url,
            selector
          });
        }

        const screenshot = path.join(outputDir, `${viewport.name}__${slugify(url)}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        pageRecord.screenshot = screenshot;
      } catch (error) {
        report.failures.push({
          type: 'BROWSER_ERROR',
          viewport: viewport.name,
          url,
          detail: error instanceof Error ? error.message : String(error)
        });
      } finally {
        report.pages.push(pageRecord);
        await page.close();
      }
    }

    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, 'visual-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

if (report.failures.length) {
  console.error(`VISUAL_QA_FAIL failures=${report.failures.length}`);
  for (const failure of report.failures.slice(0, 50)) console.error(JSON.stringify(failure));
  process.exitCode = 1;
} else {
  console.log(`VISUAL_QA_PASS pages=${report.pages.length} screenshots=${report.pages.length}`);
}
