import puppeteer from 'puppeteer';

async function getBrowser(agent) {
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
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Create a new page or use the default one
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    
    // Set a normal user agent to avoid being blocked
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Store in agent instance for persistence
    agent.browser = browser;
    agent.page = page;
    
    return { browser, page };
}

export const browser_tools = {
    browser_visit: async ({ url }, { agent }) => {
        const { page } = await getBrowser(agent);
        try {
            console.log(`Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            
            const title = await page.title();
            const content = await page.evaluate(() => {
                // Helper to remove scripts and styles for cleaner text
                const clone = document.body.cloneNode(true);
                const scripts = clone.querySelectorAll('script, style, noscript');
                scripts.forEach(s => s.remove());
                return clone.innerText;
            });

            return `URL: ${url}\nTitle: ${title}\n\nContent Preview:\n${content.slice(0, 6000)}${content.length > 6000 ? '\n... (truncated)' : ''}`;
        } catch (e) {
            return `Error visiting ${url}: ${e.message}`;
        }
    },

    browser_search: async ({ query }, { agent }) => {
        const { page } = await getBrowser(agent);
        // Use DuckDuckGo HTML version for easier scraping and less blocking
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        
        try {
            console.log(`Searching for "${query}"...`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // Wait for results
            try {
                await page.waitForSelector('.result', { timeout: 5000 });
            } catch (e) {
                // Ignore
            }

            const results = await page.evaluate(() => {
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
            });
            
            if (results.length === 0) {
                 // Fallback to text content if structure fails
                 const text = await page.evaluate(() => document.body.innerText.slice(0, 1000));
                 return "No structured search results found. Page text preview:\n" + text;
            }

            return `Search Results for "${query}":\n\n` + 
                   results.slice(0, 10).map((r, i) => `${i+1}. [${r.title}](${r.link})\n   ${r.snippet}`).join('\n\n');
        } catch (e) {
            return `Error searching: ${e.message}`;
        }
    },

    browser_eval: async ({ script }, { agent }) => {
        const { page } = await getBrowser(agent);
        try {
            console.log(`Evaluating script...`);
            // evaluate accepts a string which is evaluated in page context
            const result = await page.evaluate((js) => {
                try {
                    // eslint-disable-next-line no-eval
                    return eval(js);
                } catch (e) {
                    return `JS Error: ${e.toString()}`;
                }
            }, script);
            
            return `Result: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : result}`;
        } catch (e) {
            return `Error evaluating JS: ${e.message}`;
        }
    },

    browser_fetch: async ({ url, method = 'GET', headers = {}, body = null }) => {
        try {
            console.log(`Fetching ${url} with method ${method}...`);
            
            const options = {
                method,
                headers,
                body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
            };

            const response = await fetch(url, options);
            const text = await response.text();

            return JSON.stringify({
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: text
            }, null, 2);
            
        } catch (e) {
            return `Error executing fetch: ${e.message}`;
        }
    }
};
