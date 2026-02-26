import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs/promises';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getBrowserConfig(agent) {
    if (!agent.browserConfig) {
        const globalBrowserConfig = agent?.config?.browser || {};
        const globalProxy = globalBrowserConfig.proxy || null;
        const globalCaptcha = globalBrowserConfig.captcha || {};
        agent.browserConfig = {
            headless: globalBrowserConfig.headless ?? false,
            proxy: globalProxy ? {
                server: globalProxy.server || globalProxy.url || null,
                username: globalProxy.username || null,
                password: globalProxy.password || null,
                bypass: globalProxy.bypass || null
            } : null,
            userAgent: globalBrowserConfig.userAgent || DEFAULT_USER_AGENT,
            captcha: {
                mode: globalCaptcha.mode || 'manual', // manual | none | provider
                provider: globalCaptcha.provider || null, // e.g. 2captcha, capsolver
                apiKey: globalCaptcha.apiKey || null,
                autoDetect: globalCaptcha.autoDetect ?? true
            },
            search: {
                engine: normalizeSearchEngine(globalBrowserConfig.searchEngine || 'duckduckgo')
            }
        };
    }
    return agent.browserConfig;
}

function normalizeSearchEngine(engine) {
    const value = String(engine || 'duckduckgo').toLowerCase();
    if (['google', 'bing', 'duckduckgo', 'ddg'].includes(value)) {
        return value === 'ddg' ? 'duckduckgo' : value;
    }
    throw new Error(`Unsupported search engine "${engine}". Use google, bing, or duckduckgo.`);
}

function getSearchSpec(query, engine) {
    const q = encodeURIComponent(query);
    switch (normalizeSearchEngine(engine)) {
        case 'google':
            return {
                engine: 'google',
                url: `https://www.google.com/search?q=${q}&hl=en`,
                waitSelectors: ['#search', 'div.g', 'form[action="/sorry/index"]'],
                extract: () => {
                    const items = [];
                    document.querySelectorAll('div.g').forEach(node => {
                        const titleEl = node.querySelector('h3');
                        const linkEl = node.querySelector('a[href]');
                        const snippetEl = node.querySelector('.VwiC3b, .lEBKkf span');
                        if (titleEl && linkEl && linkEl.href) {
                            items.push({
                                title: titleEl.innerText.trim(),
                                link: linkEl.href,
                                snippet: snippetEl ? snippetEl.innerText.trim() : ''
                            });
                        }
                    });
                    return items;
                }
            };
        case 'bing':
            return {
                engine: 'bing',
                url: `https://www.bing.com/search?q=${q}&setlang=en-US`,
                waitSelectors: ['#b_results', '.b_algo'],
                extract: () => {
                    const items = [];
                    document.querySelectorAll('.b_algo').forEach(node => {
                        const titleEl = node.querySelector('h2');
                        const linkEl = node.querySelector('h2 a');
                        const snippetEl = node.querySelector('.b_caption p');
                        if (titleEl && linkEl) {
                            items.push({
                                title: titleEl.innerText.trim(),
                                link: linkEl.href,
                                snippet: snippetEl ? snippetEl.innerText.trim() : ''
                            });
                        }
                    });
                    return items;
                }
            };
        default:
            return {
                engine: 'duckduckgo',
                url: `https://html.duckduckgo.com/html/?q=${q}`,
                waitSelectors: ['.result'],
                extract: () => {
                    const items = [];
                    document.querySelectorAll('.result').forEach(div => {
                        const titleEl = div.querySelector('.result__title a');
                        const snippetEl = div.querySelector('.result__snippet');
                        if (titleEl) {
                            items.push({
                                title: titleEl.innerText.trim(),
                                link: titleEl.href,
                                snippet: snippetEl ? snippetEl.innerText.trim() : ''
                            });
                        }
                    });
                    return items;
                }
            };
    }
}

async function detectCaptcha(page) {
    return page.evaluate(() => {
        const text = (document.body?.innerText || '').toLowerCase();
        const html = (document.documentElement?.innerHTML || '').toLowerCase();
        const signals = [
            'captcha',
            'recaptcha',
            'hcaptcha',
            'verify you are human',
            'unusual traffic',
            '/sorry/'
        ];
        return signals.some(s => text.includes(s) || html.includes(s));
    });
}

async function getCleanAccessibilityContext(page) {
    const snapshot = await page.accessibility.snapshot();

    function simplify(node) {
        if (!node) return null;

        const simplified = {
            role: node.role,
            name: node.name || '',
            ...(node.value != null ? { value: node.value } : {}),
            ...(node.description ? { description: node.description } : {})
        };

        if (node.children?.length) {
            const children = node.children.map(simplify).filter(Boolean);
            if (children.length) simplified.children = children;
        }

        return simplified;
    }

    return JSON.stringify(simplify(snapshot), null, 2);
}

async function buildPageContentResponse(page, { urlOverride = null, mode = 'text' } = {}) {
    const title = await page.title();
    const currentUrl = urlOverride || page.url();
    const normalizedMode = String(mode || 'text').toLowerCase();

    if (normalizedMode === 'a11y') {
        const a11yTree = await getCleanAccessibilityContext(page);
        const truncated = a11yTree.length > 12000 ? `${a11yTree.slice(0, 12000)}\n... (truncated)` : a11yTree;
        return `URL: ${currentUrl}\nTitle: ${title}\nMode: a11y\n\nAccessibility Tree:\n${truncated}`;
    }

    const content = await page.evaluate(() => {
        const clone = document.body.cloneNode(true);
        const scripts = clone.querySelectorAll('script, style, noscript');
        scripts.forEach(s => s.remove());
        return clone.innerText;
    });

    return `URL: ${currentUrl}\nTitle: ${title}\nMode: text\n\nContent Preview:\n${content.slice(0, 6000)}${content.length > 6000 ? '\n... (truncated)' : ''}`;
}

async function handleCaptchaIfNeeded(page, agent, contextLabel = 'browser') {
    const config = getBrowserConfig(agent);
    if (config.captcha?.autoDetect === false) return null;

    const hasCaptcha = await detectCaptcha(page);
    if (!hasCaptcha) return null;

    const mode = config.captcha?.mode || 'manual';
    if (mode === 'none') {
        return `Captcha detected on ${contextLabel}, but captcha handling is disabled.`;
    }

    if (mode === 'provider') {
        // Hook point for external integrations without hard-coding a vendor SDK here.
        if (typeof agent.captchaResolver === 'function') {
            const result = await agent.captchaResolver({
                page,
                provider: config.captcha?.provider,
                apiKey: config.captcha?.apiKey,
                context: contextLabel
            });
            return `Captcha detected. Resolver result: ${typeof result === 'string' ? result : JSON.stringify(result)}`;
        }
        return `Captcha detected on ${contextLabel}. Provider mode is configured, but no agent.captchaResolver is installed.`;
    }

    return `Captcha detected on ${contextLabel}. Resolve it manually in the opened browser, then rerun the command.`;
}

async function getBrowser(agent) {
    const config = getBrowserConfig(agent);
    if (agent.browser) {
        // Check if browser is still connected
        if (agent.browser.isConnected()) {
            return { browser: agent.browser, page: agent.page };
        }
        // If disconnected, clear and restart
        agent.browser = null;
        agent.page = null;
    }

    console.log("Launching browser...");
    const launchArgs = [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
    ];
    if (config.proxy?.server) {
        launchArgs.push(`--proxy-server=${config.proxy.server}`);
        if (config.proxy.bypass) {
            launchArgs.push(`--proxy-bypass-list=${config.proxy.bypass}`);
        }
    }
    const browser = await puppeteer.launch({
        headless: config.headless,
        args: launchArgs
    });
    
    // Create a new page or use the default one
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    
    // Set a normal user agent to avoid being blocked
    await page.setUserAgent(config.userAgent || DEFAULT_USER_AGENT);
    if (config.proxy?.username) {
        await page.authenticate({
            username: config.proxy.username,
            password: config.proxy.password || ''
        });
    }

    // Store in agent instance for persistence
    agent.browser = browser;
    agent.page = page;
    
    return { browser, page };
}

export const browser_tools = {
    browser_visit: async ({ url, mode }, { agent }) => {
        const { page } = await getBrowser(agent);
        try {
            console.log(`Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            const captchaMsg = await handleCaptchaIfNeeded(page, agent, `visit:${url}`);
            if (captchaMsg) return captchaMsg;

            try {
                return await buildPageContentResponse(page, { urlOverride: url, mode });
            } catch (a11yError) {
                if (String(mode || 'text').toLowerCase() === 'a11y') {
                    console.warn(`Accessibility snapshot failed, falling back to text mode: ${a11yError.message}`);
                    return await buildPageContentResponse(page, { urlOverride: url, mode: 'text' });
                }
                throw a11yError;
            }
        } catch (e) {
            return `Error visiting ${url}: ${e.message}`;
        }
    },

    browser_refresh: async ({ mode, waitUntil }, { agent }) => {
        const { page } = await getBrowser(agent);
        try {
            const currentUrl = page.url();
            if (!currentUrl || currentUrl === 'about:blank') {
                return 'No page loaded to refresh. Use browser_visit first.';
            }

            const waitMode = ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'].includes(String(waitUntil || 'networkidle2'))
                ? String(waitUntil || 'networkidle2')
                : 'networkidle2';

            console.log(`Refreshing ${currentUrl}...`);
            await page.reload({ waitUntil: waitMode, timeout: 30000 });

            const captchaMsg = await handleCaptchaIfNeeded(page, agent, `refresh:${currentUrl}`);
            if (captchaMsg) return captchaMsg;

            try {
                return await buildPageContentResponse(page, { mode });
            } catch (a11yError) {
                if (String(mode || 'text').toLowerCase() === 'a11y') {
                    console.warn(`Accessibility snapshot failed after refresh, falling back to text mode: ${a11yError.message}`);
                    return await buildPageContentResponse(page, { mode: 'text' });
                }
                throw a11yError;
            }
        } catch (e) {
            return `Error refreshing page: ${e.message}`;
        }
    },

    browser_search: async ({ query, engine }, { agent }) => {
        const { page } = await getBrowser(agent);
        const config = getBrowserConfig(agent);
        const spec = getSearchSpec(query, engine || config.search?.engine);
        const url = spec.url;
        
        try {
            console.log(`Searching for "${query}" with ${spec.engine}...`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const captchaMsg = await handleCaptchaIfNeeded(page, agent, `search:${spec.engine}`);
            if (captchaMsg) return captchaMsg;
            
            for (const selector of spec.waitSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    break;
                } catch (e) {
                    // Try next selector
                }
            }

            const results = await page.evaluate(spec.extract);
            
            if (results.length === 0) {
                 // Fallback to text content if structure fails
                 const text = await page.evaluate(() => document.body.innerText.slice(0, 1000));
                 return `No structured ${spec.engine} search results found. Page text preview:\n${text}`;
            }

            return `Search Results for "${query}" (${spec.engine}):\n\n` + 
                   results.slice(0, 10).map((r, i) => `${i+1}. [${r.title}](${r.link})\n   ${r.snippet}`).join('\n\n');
        } catch (e) {
            return `Error searching: ${e.message}`;
        }
    },

    browser_eval: async ({ script }, { agent }) => {
        const { page } = await getBrowser(agent);
        try {
            const result = await page.evaluate((code) => {
                return eval(code);
            }, script);
            return JSON.stringify(result);
        } catch (e) {
            return `Error evaluating script: ${e.message}`;
        }
    },

    browser_fetch: async ({ url, method, headers, body }, { agent }) => {
        // Use node-fetch or built-in fetch
        try {
            const options = {
                method: method || 'GET',
                headers: headers || {},
                body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
            };
            const res = await fetch(url, options);
            const text = await res.text();
            return `Status: ${res.status}\nBody:\n${text.slice(0, 2000)}`;
        } catch (e) {
            return `Fetch error: ${e.message}`;
        }
    },

    browser_screenshot: async ({ name, selector, fullPage }, { agent }) => {
        const { page } = await getBrowser(agent);
        try {
            const screenshotsDir = path.join(process.cwd(), '.agent', 'screenshots');
            await fs.mkdir(screenshotsDir, { recursive: true });
            
            const filename = name ? `${name}.png` : `screenshot_${Date.now()}.png`;
            const filePath = path.join(screenshotsDir, filename);

            let element = page;
            if (selector) {
                element = await page.$(selector);
                if (!element) throw new Error(`Selector "${selector}" not found`);
            }

            await element.screenshot({
                path: filePath,
                fullPage: fullPage || false
            });

            return `Screenshot saved to ${filePath}`;
        } catch (e) {
            return `Error taking screenshot: ${e.message}`;
        }
    }
};
