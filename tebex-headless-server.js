require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();

// ===================================================
// 1. Enterprise Environment & Configuration Matrix
// ===================================================
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'mirage_jwt_enterprise_default_secret_key_2026';

const TEBEX_PUBLIC_TOKEN = process.env.TEBEX_PUBLIC_TOKEN || 'zoxl-23e40774251c06d055bd84f1c5e7056c551986b1';
const TEBEX_PRIVATE_KEY = process.env.TEBEX_PRIVATE_KEY || '5BHLQXzxYPIQwxbqOQT1In3zvEwBJM7l';
const TEBEX_WEBHOOK_SECRET = process.env.TEBEX_WEBHOOK_SECRET || 'c0fe047b99a0ce8453187b9860b54929';
const TEBEX_PROJECT_ID = process.env.TEBEX_PROJECT_ID || '1665273';
const NOTARY_PACKAGE_ID = parseInt(process.env.NOTARY_PACKAGE_ID) || 7642742;
const TEBEX_SERVER_SECRET = process.env.TEBEX_SERVER_SECRET || '';
const ADMIN_PIN = process.env.ADMIN_PIN || 'mirage2026';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

const CONFIG_FILE = path.join(__dirname, 'store-config.json');
const startTime = Date.now();

// ===================================================
// 2. Real-Time Event Hub (Server-Sent Events / SSE)
// ===================================================
const sseClients = new Set();

function broadcastEvent(eventType, payload) {
    const data = JSON.stringify({ type: eventType, payload, timestamp: Date.now() });
    for (const client of sseClients) {
        try {
            client.write(`event: ${eventType}\ndata: ${data}\n\n`);
        } catch (e) {
            sseClients.delete(client);
        }
    }
}

// ===================================================
// 3. Enterprise Security & Optimization Middlewares
// ===================================================
app.set('trust proxy', 1);
app.use(compression());
app.use(cors());
app.use(cookieParser());

// Helmet Enterprise Security Headers
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    })
);

// Raw body capture for cryptographic Webhook Signature Verification
app.use(express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.use(express.static(__dirname, { maxAge: '1d' }));

// Favicon Endpoint
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'images', 'logo.png'));
});

// ===================================================
// 4. Rate Limiting Architecture
// ===================================================
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const checkoutLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 40,
    message: { error: 'Too many checkout attempts. Please wait a few moments.' }
});

const adminAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many admin login attempts. Cooldown period active for 15 minutes.' }
});

app.use('/api/', generalLimiter);
app.use('/api/create-checkout', checkoutLimiter);
app.use('/api/admin/login', adminAuthLimiter);

// ===================================================
// 5. Config Management & Tebex API Service Layer
// ===================================================
function loadStoreConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Config Error]: Failed to read store-config.json:', e.message);
    }
    return {
        adminPin: ADMIN_PIN,
        announcement: "⚡ FLASH SALE: USE CODE \"MIRAGE20\" FOR 20% OFF ALL ASSETS • AUTOMATED KEYMASTER DELIVERY",
        discordUrl: "https://discord.gg/fivem",
        topSupporter: { name: "URSU ARTS", title: "Top Supporter of the Month", amount: "$240.00" },
        packages: {},
        customReviews: [],
        realPayments: [
            { id: "tbx-94812", buyer: "Alex_V", item: "[Escrow] Notary System v2.0", time: "Today 14:22", price: "35.00 USD", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80" },
            { id: "tbx-94811", buyer: "Marcus_K", item: "Onyx Luxury Dealership MLO", time: "Today 12:15", price: "45.00 USD", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80" },
            { id: "tbx-94810", buyer: "Chief_Vance", item: "NextGen Police MDT / CAD", time: "Today 10:50", price: "40.00 USD", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80" },
            { id: "tbx-94809", buyer: "GhostRider_99", item: "Underground Supercar Pack", time: "Yesterday 23:10", price: "55.00 USD", avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&auto=format&fit=crop&q=80" },
            { id: "tbx-94808", buyer: "Apex_Roleplay", item: "[Escrow] Notary System v2.0", time: "Yesterday 18:30", price: "35.00 USD", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80" }
        ]
    };
}

function saveStoreConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
        console.error('[Config Error]: Failed to save store-config.json:', e.message);
    }
}

let cachedStoreData = null;
let lastSyncTime = 0;

const defaultReviews = [
    {
        id: "rev-1",
        author: "Alex_V",
        avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80",
        role: "Lead Developer, Velocity RP (600+ Players)",
        rating: 5,
        date: "Today at 12:40",
        productName: "Notary System v2.0",
        comment: "The Notary System is easily the cleanest tablet script on the market. Society commission routing directly into okokBanking saved our server days of custom development. 0.00ms idle resmon and instant escrow delivery!"
    },
    {
        id: "rev-2",
        author: "Marcus_K",
        avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80",
        role: "Server Owner, District 9 Roleplay",
        rating: 5,
        date: "Yesterday",
        productName: "Onyx Luxury Dealership MLO",
        comment: "Outstanding interior architecture! Zero texture loss or FPS drops even during massive car meets with 50+ players inside the showroom. The dynamic neon lighting presets are phenomenal."
    },
    {
        id: "rev-3",
        author: "Chief_Vance",
        avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80",
        role: "Head of LSPD, Horizon State RP",
        rating: 5,
        date: "3 days ago",
        productName: "NextGen Police MDT / CAD",
        comment: "Our entire police department loves the live 911 dispatch, real-time GPS unit tracking, and auto-calculating penal code. Support on their Discord server resolved our custom dispatch coordinates in minutes."
    },
    {
        id: "rev-4",
        author: "GhostRider_99",
        avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&auto=format&fit=crop&q=80",
        role: "Community Founder, Eclipse Valley",
        rating: 5,
        date: "5 days ago",
        productName: "Underground Tuner & Supercar Pack",
        comment: "The custom realistic engine audiobanks and street drift physics are unmatched. Poly counts are fully optimized and memory streaming usage is super light on the server."
    }
];

const partnerServers = [
    { name: "Velocity Roleplay", players: "650+ Active", badge: "Qbox Framework" },
    { name: "Horizon State RP", players: "400+ Active", badge: "QBCore" },
    { name: "Eclipse Valley RP", players: "350+ Active", badge: "ESX Legacy" },
    { name: "District 9 RP", players: "500+ Active", badge: "Custom Framework" },
    { name: "Dynasty FiveM", players: "280+ Active", badge: "QBCore" }
];

async function syncTebexStore(force = false) {
    const config = loadStoreConfig();
    try {
        const timestamp = Date.now();
        console.log(`[Tebex Sync] Fetching live categories & packages (force=${force}, t=${timestamp})...`);
        
        const [catRes, pkgRes] = await Promise.all([
            fetch(`https://headless.tebex.io/api/accounts/${TEBEX_PUBLIC_TOKEN}/categories?includePackages=1&_t=${timestamp}`, {
                headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' },
                signal: AbortSignal.timeout(8000)
            }).catch(() => null),
            fetch(`https://headless.tebex.io/api/accounts/${TEBEX_PUBLIC_TOKEN}/packages?_t=${timestamp}`, {
                headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' },
                signal: AbortSignal.timeout(8000)
            }).catch(() => null)
        ]);

        const catData = catRes && catRes.ok ? await catRes.json().catch(() => null) : null;
        const pkgData = pkgRes && pkgRes.ok ? await pkgRes.json().catch(() => null) : null;

        let tebexPackages = [];
        const seenIds = new Set();

        // 1. Direct live packages endpoint (freshest prices)
        if (pkgData && pkgData.data && Array.isArray(pkgData.data)) {
            pkgData.data.forEach(pkg => {
                if (!seenIds.has(pkg.id)) {
                    seenIds.add(pkg.id);
                    tebexPackages.push(pkg);
                }
            });
        }

        // 2. Categories endpoint for category metadata
        if (catData && catData.data && Array.isArray(catData.data)) {
            catData.data.forEach(cat => {
                if (cat.packages && Array.isArray(cat.packages)) {
                    cat.packages.forEach(pkg => {
                        const existing = tebexPackages.find(p => p.id === pkg.id);
                        if (existing) {
                            existing.category_id = cat.id;
                            existing.category_name = cat.name;
                        } else if (!seenIds.has(pkg.id)) {
                            seenIds.add(pkg.id);
                            tebexPackages.push({
                                ...pkg,
                                category_id: cat.id,
                                category_name: cat.name
                            });
                        }
                    });
                }
            });
        }

        const mergedProducts = tebexPackages.map(pkg => {
            const desc = pkg.description || '';

            // 1. Extract Gallery Images directly from Tebex Media API
            let mediaImages = [];
            if (pkg.media && Array.isArray(pkg.media)) {
                mediaImages = pkg.media.filter(m => m.type === 'image' && m.url).map(m => m.url);
            }
            if (mediaImages.length === 0 && pkg.image) {
                mediaImages.push(pkg.image);
            }

            // 2. Extract YouTube video URL directly from Tebex description if present
            const ytMatch = desc.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
            const youtubeUrl = ytMatch ? ytMatch[0] : null;

            // 3. Extract Frameworks mentioned in Tebex description
            const fwList = [];
            if (/qb-core|qbcore/i.test(desc)) fwList.push('QBCore');
            if (/qbox/i.test(desc)) fwList.push('Qbox');
            if (/esx/i.test(desc)) fwList.push('ESX');
            if (/standalone/i.test(desc)) fwList.push('Standalone');
            const detectedFramework = fwList.length > 0 ? fwList.join(' / ') : (pkg.category?.name || 'FiveM Asset');

            // 4. Extract Resmon performance metric if mentioned in Tebex description
            const resmonMatch = desc.match(/(\d+\.\d+\s*ms)/i);
            const detectedResmon = resmonMatch ? resmonMatch[1] : '0.00ms';

            // 5. Category classification
            const catName = pkg.category?.name || pkg.category_name || 'Scripts & Systems';
            let catSlug = 'scripts';
            const catLower = catName.toLowerCase();
            if (catLower.includes('mlo') || catLower.includes('interior') || catLower.includes('map')) catSlug = 'mlos';
            else if (catLower.includes('vehic') || catLower.includes('car')) catSlug = 'vehicles';
            else if (catLower.includes('script') || catLower.includes('package') || catLower.includes('system')) catSlug = 'scripts';

            // 6. Real dynamic price
            const realPrice = (typeof pkg.total_price === 'number') ? pkg.total_price : ((typeof pkg.base_price === 'number') ? pkg.base_price : 0.00);

            return {
                id: pkg.id,
                name: pkg.name,
                slug: pkg.slug || ('package-' + pkg.id),
                category: catSlug,
                categoryName: catName,
                price: realPrice,
                currency: pkg.currency || 'USD',
                isSubscription: pkg.type === 'subscription',
                badge: realPrice === 0 ? 'FREE' : 'Verified',
                badgeColor: realPrice === 0 ? 'green' : 'brand',
                resmon: detectedResmon,
                framework: detectedFramework,
                image: mediaImages[0] || pkg.image || '',
                media: mediaImages,
                youtubeUrl: youtubeUrl,
                shortDesc: desc ? desc.replace(/<[^>]*>?/gm, '').substring(0, 150).trim() + '...' : '',
                fullDesc: desc,
                docs: desc
            };
        });

        // Try fetching real historical transactions from Tebex if Server Secret provided
        let liveTebexPayments = [];
        const activeSecret = TEBEX_SERVER_SECRET || TEBEX_PRIVATE_KEY;
        if (activeSecret) {
            try {
                const payRes = await fetch('https://plugin.tebex.io/payments?limit=20', {
                    headers: { 'X-Tebex-Secret': activeSecret },
                    signal: AbortSignal.timeout(5000)
                });
                if (payRes.ok) {
                    const payData = await payRes.json();
                    if (Array.isArray(payData)) {
                        liveTebexPayments = payData.map(p => ({
                            id: 'tbx-' + (p.id || p.transaction_id),
                            buyer: p.player?.name || p.player?.username || 'FiveM Buyer',
                            item: p.packages?.[0]?.name || '[Escrow] FiveM Asset',
                            time: p.date ? new Date(p.date).toLocaleDateString() : 'Recent',
                            price: (p.price || '35.00') + ' ' + (p.currency?.iso_4217 || 'USD'),
                            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'
                        }));
                        console.log(`[Tebex Live Payments]: Loaded ${liveTebexPayments.length} real payments directly from Tebex!`);
                    }
                }
            } catch (err) {
                // Plugin key not set or invalid
            }
        }

        const allReviews = [...(config.customReviews || []), ...defaultReviews];
        const allPayments = [
            ...(config.realPayments || []),
            ...liveTebexPayments
        ];

        cachedStoreData = {
            announcement: config.announcement,
            discordUrl: config.discordUrl,
            topSupporter: config.topSupporter || { name: "URSU ARTS", title: "Top Supporter of the Month", amount: "$240.00" },
            products: mergedProducts,
            reviews: allReviews,
            recentPayments: allPayments,
            partners: partnerServers
        };
        lastSyncTime = Date.now();
        return cachedStoreData;

    } catch (error) {
        console.error('[Tebex Sync Error]:', error.message);
        if (cachedStoreData) return cachedStoreData;
        return {
            announcement: config.announcement,
            discordUrl: config.discordUrl,
            topSupporter: { name: "URSU ARTS", title: "Top Supporter of the Month", amount: "$240.00" },
            products: [],
            reviews: defaultReviews,
            recentPayments: [],
            partners: partnerServers
        };
    }
}

// Automated Discord Notification Service
async function sendDiscordNotification(title, description, color = 0x0284c7) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: `🛡️ Mirage Store • ${title}`,
                    description: description,
                    color: color,
                    footer: { text: "Mirage Store Enterprise Notification Service" },
                    timestamp: new Date().toISOString()
                }]
            })
        });
    } catch (e) {
        console.warn('[Discord Webhook Error]:', e.message);
    }
}

// ===================================================
// 6. JWT Authentication Middleware for Admin
// ===================================================
function verifyAdminToken(req, res, next) {
    const token = req.cookies?.mirage_admin_token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.adminUser = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired session. Please log in again.' });
    }
}

// Initial Sync
syncTebexStore();

// ===================================================
// 7. STOREFRONT & ADMIN UI
// ===================================================
const storefrontHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mirage Store - Best FiveM Scripts, Vehicles & MLOs</title>
    <script src="https://js.tebex.io/tebex.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    
    <style>
        :root {
            --brand: #0284c7;
            --brand-hover: #0369a1;
            --brand-light: #38bdf8;
            --brand-ice: #e0f2fe;
            --brand-glow: rgba(56, 189, 248, 0.35);
            --dark-bg: #070b14;
            --card-bg: rgba(13, 20, 36, 0.85);
            --card-border: rgba(255, 255, 255, 0.08);
            --surface-hover: rgba(30, 41, 59, 0.7);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --text-dim: #64748b;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background-color: var(--dark-bg);
            background-image: 
                radial-gradient(at 0% 0%, rgba(2, 132, 199, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 0%, rgba(56, 189, 248, 0.12) 0px, transparent 50%),
                radial-gradient(at 50% 50%, rgba(13, 20, 36, 0.95) 0px, transparent 100%);
            min-height: 100vh;
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            color: var(--text-main);
            line-height: 1.6;
            overflow-x: hidden;
        }

        /* Top Announcement Ticker */
        .announcement-bar {
            background: linear-gradient(90deg, #070b14, #082f49, #070b14);
            border-bottom: 1px solid rgba(56, 189, 248, 0.25);
            padding: 0.5rem 1rem;
            text-align: center;
            font-size: 0.8rem;
            font-weight: 700;
            color: var(--brand-light);
            letter-spacing: 0.03em;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
        }

        /* Header Navigation */
        .navbar {
            border-bottom: 1px solid var(--card-border);
            background: rgba(7, 11, 20, 0.92);
            backdrop-filter: blur(20px);
            position: sticky;
            top: 0;
            z-index: 50;
        }

        .nav-container {
            max-width: 1380px;
            margin: 0 auto;
            padding: 0.85rem 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1.5rem;
        }

        .brand-logo {
            display: flex;
            align-items: center;
            gap: 0.85rem;
            text-decoration: none;
            color: #ffffff;
        }

        .brand-logo-img {
            width: 44px;
            height: 44px;
            object-fit: contain;
            filter: drop-shadow(0 0 12px var(--brand-glow));
            transition: transform 0.3s ease;
        }

        .brand-logo:hover .brand-logo-img {
            transform: scale(1.05);
        }

        .brand-title {
            font-size: 1.35rem;
            font-weight: 900;
            letter-spacing: -0.02em;
        }

        .brand-title span { color: var(--brand-light); }

        .nav-links {
            display: flex;
            align-items: center;
            gap: 1.75rem;
            list-style: none;
        }

        @media (max-width: 1040px) { .nav-links { display: none; } }

        .nav-links a {
            text-decoration: none;
            color: var(--text-muted);
            font-size: 0.88rem;
            font-weight: 700;
            transition: color 0.2s ease;
        }

        .nav-links a:hover, .nav-links a.active { color: var(--brand-light); }

        .nav-actions {
            display: flex;
            align-items: center;
            gap: 0.85rem;
        }

        /* CFX.re User Authentication & Profile Dropdown */
        .cfx-user-container {
            position: relative;
        }

        .cfx-login-btn {
            background: linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(56, 189, 248, 0.15));
            border: 1px solid rgba(56, 189, 248, 0.4);
            color: #ffffff;
            font-size: 0.85rem;
            font-weight: 700;
            padding: 0.55rem 1.1rem;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
            transition: all 0.25s ease;
            backdrop-filter: blur(10px);
        }

        .cfx-login-btn:hover {
            background: var(--brand);
            box-shadow: 0 0 16px var(--brand-glow);
            transform: translateY(-1px);
        }

        .cfx-mini-logo {
            width: 20px;
            height: 20px;
            border-radius: 4px;
            object-fit: contain;
        }

        .cfx-profile-dropdown {
            position: relative;
        }

        .cfx-user-pill {
            display: flex;
            align-items: center;
            gap: 0.65rem;
            background: rgba(13, 20, 36, 0.9);
            border: 1px solid rgba(56, 189, 248, 0.35);
            padding: 0.4rem 0.85rem;
            border-radius: 14px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .cfx-profile-dropdown:hover .cfx-user-pill {
            border-color: var(--brand-light);
            background: rgba(2, 132, 199, 0.2);
        }

        .cfx-user-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid var(--brand-light);
            box-shadow: 0 0 8px var(--brand-glow);
        }

        .cfx-user-meta {
            display: flex;
            flex-direction: column;
            text-align: left;
        }

        .cfx-username {
            font-size: 0.85rem;
            font-weight: 800;
            color: #ffffff;
            line-height: 1.2;
        }

        .cfx-badge {
            font-size: 0.68rem;
            font-weight: 700;
            color: var(--brand-light);
            letter-spacing: 0.02em;
        }

        .cfx-chevron {
            color: var(--text-muted);
            transition: transform 0.2s;
        }

        .cfx-profile-dropdown:hover .cfx-chevron {
            transform: rotate(180deg);
        }

        .cfx-dropdown-menu {
            position: absolute;
            top: 100%;
            right: 0;
            width: 220px;
            background: rgba(7, 11, 20, 0.98);
            border: 1px solid rgba(56, 189, 248, 0.25);
            border-radius: 14px;
            padding: 0.5rem;
            box-shadow: 0 16px 36px rgba(0, 0, 0, 0.8), 0 0 20px rgba(2, 132, 199, 0.15);
            backdrop-filter: blur(24px);
            display: none;
            flex-direction: column;
            gap: 0.35rem;
            z-index: 100;
            margin-top: 6px;
        }

        /* Invisible hover bridge to prevent menu from hiding when moving cursor */
        .cfx-dropdown-menu::before {
            content: '';
            position: absolute;
            top: -12px;
            left: 0;
            right: 0;
            height: 12px;
        }

        .cfx-profile-dropdown:hover .cfx-dropdown-menu,
        .cfx-dropdown-menu:hover {
            display: flex;
        }

        .cfx-menu-item {
            display: flex;
            align-items: center;
            gap: 0.65rem;
            padding: 0.65rem 0.85rem;
            border-radius: 10px;
            font-size: 0.82rem;
            font-weight: 700;
            color: var(--text-main);
            text-decoration: none;
            border: none;
            background: transparent;
            cursor: pointer;
            text-align: left;
            width: 100%;
            transition: all 0.2s;
        }

        .cfx-menu-item svg {
            flex-shrink: 0;
            color: var(--brand-light);
            transition: transform 0.2s;
        }

        .cfx-menu-item:hover {
            background: rgba(2, 132, 199, 0.15);
            color: var(--brand-light);
        }

        .cfx-menu-item:hover svg {
            transform: scale(1.1);
        }

        .cfx-logout-btn {
            color: #f87171 !important;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            margin-top: 0.25rem;
            padding-top: 0.65rem;
        }

        .cfx-logout-btn svg {
            color: #f87171 !important;
        }

        .cfx-logout-btn:hover {
            background: rgba(239, 68, 68, 0.15) !important;
            color: #fca5a5 !important;
        }

        .discord-btn {
            background: #5865F2;
            color: #ffffff;
            font-size: 0.85rem;
            font-weight: 700;
            text-decoration: none;
            padding: 0.55rem 1rem;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            transition: all 0.2s ease;
        }

        .discord-btn:hover {
            background: #4752c4;
            transform: translateY(-1px);
        }

        /* 4K Real GTA Hero Banner Section */
        .gta-hero {
            position: relative;
            min-height: 640px;
            background: url('/public/images/hero-gta.jpg') center center / cover no-repeat;
            display: flex;
            align-items: center;
            border-bottom: 1px solid var(--card-border);
            overflow: hidden;
        }

        .hero-overlay {
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, rgba(7, 11, 20, 0.94) 0%, rgba(7, 11, 20, 0.68) 45%, rgba(7, 11, 20, 0.88) 100%),
                        linear-gradient(180deg, rgba(7, 11, 20, 0.2) 0%, rgba(7, 11, 20, 0.98) 100%);
        }

        .hero-container {
            position: relative;
            z-index: 10;
            max-width: 1750px;
            margin: 0 auto;
            padding: 4.5rem 3.5rem;
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 2rem;
        }

        .hero-left-content {
            max-width: 620px;
            flex-shrink: 0;
        }

        .hero-right-widget {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            flex-grow: 1;
        }

        @media (max-width: 1100px) {
            .hero-container {
                flex-direction: column;
                align-items: flex-start;
                padding: 3rem 1.5rem;
            }
            .hero-right-widget {
                width: 100%;
                justify-content: flex-start;
                margin-top: 1.5rem;
            }
            .gta-hero { min-height: auto; }
        }

        .hero-tag {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(2, 132, 199, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.4);
            color: var(--brand-light);
            padding: 0.4rem 1.1rem;
            border-radius: 9999px;
            font-size: 0.82rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 1.5rem;
        }

        .hero-title {
            font-size: 3.8rem;
            font-weight: 900;
            letter-spacing: -0.035em;
            line-height: 1.12;
            margin-bottom: 1.25rem;
            color: #ffffff;
            text-transform: uppercase;
        }

        .hero-title span {
            background: linear-gradient(135deg, #38bdf8, #0284c7);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .hero-desc {
            max-width: 620px;
            font-size: 1.1rem;
            color: #cbd5e1;
            line-height: 1.7;
            margin-bottom: 2.25rem;
        }

        .hero-buttons {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-wrap: wrap;
        }

        .btn-view-more {
            background: linear-gradient(135deg, #0284c7, #0369a1);
            color: #ffffff;
            font-weight: 800;
            font-size: 0.95rem;
            padding: 0.95rem 2rem;
            border-radius: 14px;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 0.6rem;
            box-shadow: 0 10px 30px -5px var(--brand-glow);
            transition: all 0.2s ease;
            border: none;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .btn-view-more:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 40px -5px rgba(2, 132, 199, 0.6);
        }

        .btn-discord-hero {
            background: rgba(30, 41, 59, 0.7);
            border: 1px solid var(--card-border);
            color: #ffffff;
            font-weight: 700;
            font-size: 0.95rem;
            padding: 0.95rem 1.75rem;
            border-radius: 14px;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.2s ease;
        }

        .btn-discord-hero:hover {
            background: rgba(51, 65, 85, 0.9);
            transform: translateY(-2px);
        }

        /* Real Recent Payments Widget with Sleek Compact Design Positioned to the Right */
        .recent-payments-card {
            background: rgba(10, 16, 30, 0.88);
            border: 1px solid rgba(56, 189, 248, 0.22);
            border-radius: 14px;
            padding: 0.9rem 1.1rem;
            backdrop-filter: blur(20px);
            box-shadow: 0 16px 36px rgba(0, 0, 0, 0.7), 0 0 24px -8px var(--brand-glow);
            width: 100%;
            max-width: 320px;
            margin-left: auto;
        }

        .payments-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 0.6rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            margin-bottom: 0.65rem;
        }

        .payments-header-title {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            font-size: 0.68rem;
            font-weight: 800;
            color: #ffffff;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .live-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #22c55e;
            box-shadow: 0 0 8px #22c55e;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.8; }
        }

        .payments-list {
            display: flex;
            flex-direction: column;
            gap: 0.45rem;
        }

        .payment-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(22, 33, 58, 0.45);
            border: 1px solid rgba(148, 163, 184, 0.12);
            padding: 0.4rem 0.6rem;
            border-radius: 8px;
            transition: all 0.25s ease;
        }

        .payment-row.new-entry {
            animation: highlightEntry 1.5s ease;
        }

        @keyframes highlightEntry {
            from { background: rgba(56, 189, 248, 0.35); border-color: var(--brand-light); }
            to { background: rgba(22, 33, 58, 0.45); }
        }

        .payment-row:hover {
            transform: translateX(3px);
            border-color: rgba(56, 189, 248, 0.35);
            background: rgba(22, 33, 58, 0.75);
        }

        .payment-user {
            display: flex;
            align-items: center;
            gap: 0.45rem;
        }

        .payment-avatar {
            width: 24px;
            height: 24px;
            border-radius: 6px;
            object-fit: cover;
        }

        .payment-info .name {
            font-size: 0.7rem;
            font-weight: 800;
            color: #ffffff;
            line-height: 1.1;
        }

        .payment-info .item {
            font-size: 0.62rem;
            color: var(--text-muted);
            line-height: 1.1;
        }

        .payment-price {
            text-align: right;
            font-size: 0.7rem;
            font-weight: 800;
            color: var(--brand-light);
            line-height: 1.1;
        }

        .payment-time {
            font-size: 0.58rem;
            color: var(--text-dim);
            line-height: 1.1;
        }

        /* Modern Compact Stats Bar with Standard Small Text */
        .stats-bar {
            max-width: 1040px;
            margin: -2.2rem auto 4.5rem auto;
            position: relative;
            z-index: 20;
            padding: 1.1rem 2rem;
            background: rgba(13, 20, 36, 0.92);
            border: 1px solid rgba(56, 189, 248, 0.2);
            border-radius: 16px;
            backdrop-filter: blur(20px);
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1.25rem;
            text-align: center;
            box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5), 0 0 20px -8px var(--brand-glow);
        }

        @media (max-width: 768px) {
            .stats-bar { grid-template-columns: repeat(2, 1fr); margin-top: 2rem; }
            .hero-title { font-size: 2.5rem; }
        }

        .stat-item h3 {
            font-size: 1.35rem;
            font-weight: 800;
            color: #ffffff;
            letter-spacing: -0.01em;
            line-height: 1.2;
        }

        .stat-item h3 span { color: var(--brand-light); font-size: 1.15rem; }

        .stat-item p {
            font-size: 0.68rem;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-top: 0.15rem;
        }

        /* Products Catalog Section */
        .section-header {
            max-width: 1380px;
            margin: 0 auto 2.5rem auto;
            padding: 0 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1.25rem;
        }

        .section-title h2 {
            font-size: 2.1rem;
            font-weight: 900;
            color: #ffffff;
            letter-spacing: -0.025em;
        }

        .section-title p {
            font-size: 0.92rem;
            color: var(--text-muted);
        }

        .filter-tabs {
            display: flex;
            background: rgba(13, 20, 36, 0.9);
            border: 1px solid var(--card-border);
            padding: 0.35rem;
            border-radius: 16px;
            gap: 0.25rem;
        }

        .filter-btn {
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-weight: 700;
            font-size: 0.85rem;
            padding: 0.6rem 1.2rem;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .filter-btn:hover { color: #ffffff; }

        .filter-btn.active {
            background: var(--brand);
            color: #ffffff;
            box-shadow: 0 4px 15px var(--brand-glow);
        }

        .products-grid {
            max-width: 1380px;
            margin: 0 auto 6rem auto;
            padding: 0 1.5rem;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 2rem;
        }

        .product-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 24px;
            overflow: hidden;
            backdrop-filter: blur(16px);
            display: flex;
            flex-direction: column;
            transition: all 0.3s ease;
            box-shadow: 0 15px 30px -10px rgba(0, 0, 0, 0.5);
        }

        .product-card:hover {
            transform: translateY(-6px);
            border-color: rgba(56, 189, 248, 0.4);
            box-shadow: 0 25px 45px -12px rgba(0, 0, 0, 0.7), 0 0 30px -10px var(--brand-glow);
        }

        .card-img-wrapper {
            position: relative;
            height: 220px;
            background: #0f172a;
            overflow: hidden;
        }

        .card-img-wrapper img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.6s ease;
        }

        .product-card:hover .card-img-wrapper img { transform: scale(1.06); }

        .card-badge {
            position: absolute;
            top: 1rem;
            left: 1rem;
            font-size: 0.72rem;
            font-weight: 800;
            padding: 0.35rem 0.8rem;
            border-radius: 9999px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            backdrop-filter: blur(8px);
        }

        .card-badge.accent { background: rgba(2, 132, 199, 0.9); color: #ffffff; }
        .card-badge.brand { background: rgba(59, 130, 246, 0.9); color: #ffffff; }
        .card-badge.purple { background: rgba(139, 92, 246, 0.9); color: #ffffff; }
        .card-badge.orange { background: rgba(249, 115, 22, 0.9); color: #ffffff; }

        .resmon-pill {
            position: absolute;
            bottom: 1rem;
            right: 1rem;
            background: rgba(7, 11, 20, 0.9);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 0.72rem;
            font-weight: 700;
            color: var(--brand-light);
            padding: 0.3rem 0.7rem;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 0.3rem;
        }

        .card-content {
            padding: 1.6rem;
            display: flex;
            flex-direction: column;
            flex-grow: 1;
        }

        .card-category {
            font-size: 0.75rem;
            font-weight: 800;
            color: var(--brand-light);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.35rem;
        }

        .card-name {
            font-size: 1.3rem;
            font-weight: 800;
            color: #ffffff;
            letter-spacing: -0.02em;
            margin-bottom: 0.5rem;
        }

        .card-desc {
            font-size: 0.85rem;
            color: var(--text-muted);
            line-height: 1.6;
            margin-bottom: 1.25rem;
            flex-grow: 1;
        }

        .card-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: 1rem;
            border-top: 1px solid var(--card-border);
            margin-bottom: 1.25rem;
        }

        .card-price {
            font-size: 1.4rem;
            font-weight: 900;
            color: #ffffff;
        }

        .card-period {
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--text-dim);
        }

        .framework-tag {
            font-size: 0.72rem;
            color: var(--text-muted);
            background: rgba(30, 41, 59, 0.5);
            padding: 0.35rem 0.65rem;
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .card-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
        }

        .btn-view {
            background: rgba(30, 41, 59, 0.6);
            color: #cbd5e1;
            border: 1px solid var(--card-border);
            font-weight: 700;
            font-size: 0.85rem;
            padding: 0.8rem;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-view:hover {
            background: rgba(51, 65, 85, 0.8);
            color: #ffffff;
        }

        .btn-buy-card {
            background: var(--brand);
            color: #ffffff;
            border: none;
            font-weight: 800;
            font-size: 0.85rem;
            padding: 0.8rem;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 15px var(--brand-glow);
        }

        .btn-buy-card:hover {
            background: var(--brand-hover);
            transform: translateY(-1px);
        }

        /* Verified Reviews Section */
        .reviews-section {
            background: rgba(13, 20, 36, 0.6);
            border-top: 1px solid var(--card-border);
            border-bottom: 1px solid var(--card-border);
            padding: 6rem 1.5rem;
        }

        .reviews-container {
            max-width: 1380px;
            margin: 0 auto;
        }

        .reviews-header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1.5rem;
            margin-bottom: 3rem;
        }

        .btn-add-review {
            background: rgba(2, 132, 199, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.35);
            color: var(--brand-light);
            font-weight: 800;
            font-size: 0.85rem;
            padding: 0.75rem 1.5rem;
            border-radius: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.2s ease;
        }

        .btn-add-review:hover {
            background: var(--brand);
            color: #fff;
        }

        .reviews-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
        }

        .review-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 22px;
            padding: 1.85rem;
            backdrop-filter: blur(12px);
            display: flex;
            flex-direction: column;
            transition: transform 0.2s ease;
        }

        .review-card:hover {
            transform: translateY(-4px);
            border-color: rgba(56, 189, 248, 0.3);
        }

        .review-user-row {
            display: flex;
            align-items: center;
            gap: 0.85rem;
            margin-bottom: 1rem;
        }

        .review-avatar-img {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            object-fit: cover;
            border: 2px solid rgba(56, 189, 248, 0.3);
        }

        .review-stars {
            display: flex;
            gap: 0.2rem;
            color: #fbbf24;
            margin-bottom: 0.85rem;
        }

        .review-comment {
            font-size: 0.9rem;
            color: #cbd5e1;
            line-height: 1.65;
            margin-bottom: 1.25rem;
            flex-grow: 1;
        }

        .review-product-tag {
            font-size: 0.75rem;
            font-weight: 800;
            color: var(--brand-light);
            background: rgba(2, 132, 199, 0.12);
            padding: 0.25rem 0.6rem;
            border-radius: 6px;
            display: inline-block;
            margin-bottom: 0.5rem;
        }

        .verified-buyer-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
            font-size: 0.72rem;
            color: #22c55e;
            font-weight: 700;
        }

        /* Modal Styles */
        .modal-backdrop {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.88);
            backdrop-filter: blur(14px);
            z-index: 100;
            align-items: center;
            justify-content: center;
            padding: 1.5rem;
        }

        .modal-backdrop.active {
            display: flex;
            animation: modalFade 0.25s ease;
        }

        @keyframes modalFade {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
        }

        .modal-content {
            background: #0d1424;
            border: 1px solid var(--card-border);
            max-width: 860px;
            width: 100%;
            max-height: 90vh;
            border-radius: 24px;
            overflow-y: auto;
            position: relative;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 50px -10px var(--brand-glow);
        }

        .modal-close {
            position: absolute;
            top: 1.25rem;
            right: 1.25rem;
            width: 36px;
            height: 36px;
            background: rgba(13, 20, 36, 0.8);
            border: 1px solid var(--card-border);
            border-radius: 50%;
            color: #cbd5e1;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 20;
            font-size: 1.2rem;
            transition: all 0.2s;
        }

        .modal-close:hover { background: #334155; color: #ffffff; }

        .modal-media-viewer {
            position: relative;
            background: #020617;
            height: 360px;
            width: 100%;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .modal-media-viewer img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .modal-media-viewer iframe {
            width: 100%;
            height: 100%;
            border: none;
        }

        .thumbnails-strip {
            display: flex;
            gap: 0.65rem;
            padding: 0.85rem 1.5rem;
            background: rgba(11, 15, 25, 0.95);
            border-bottom: 1px solid var(--card-border);
            overflow-x: auto;
        }

        .thumb-item {
            width: 70px;
            height: 48px;
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            border: 2px solid transparent;
            opacity: 0.6;
            transition: all 0.2s ease;
            flex-shrink: 0;
            background: #1e293b;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .thumb-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .thumb-item.video-thumb {
            color: #38bdf8;
            font-size: 1.2rem;
            background: rgba(56, 189, 248, 0.1);
        }

        .thumb-item:hover { opacity: 0.9; }

        .thumb-item.active {
            border-color: var(--brand-light);
            opacity: 1;
            box-shadow: 0 0 10px var(--brand-glow);
        }

        .modal-body {
            padding: 2rem;
        }

        .modal-title-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 1rem;
        }

        .modal-title {
            font-size: 1.75rem;
            font-weight: 800;
            color: #ffffff;
        }

        .modal-price {
            font-size: 1.6rem;
            font-weight: 900;
            color: var(--brand-light);
            text-align: right;
        }

        .modal-tabs {
            display: flex;
            gap: 0.5rem;
            border-bottom: 1px solid var(--card-border);
            margin: 1.5rem 0 1rem 0;
        }

        .modal-tab-btn {
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-weight: 700;
            font-size: 0.85rem;
            padding: 0.6rem 1rem;
            cursor: pointer;
            position: relative;
        }

        .modal-tab-btn.active { color: var(--brand-light); }

        .modal-tab-btn.active::after {
            content: '';
            position: absolute;
            bottom: -1px;
            left: 0;
            right: 0;
            height: 2px;
            background: var(--brand-light);
        }

        .modal-tab-pane {
            display: none;
            font-size: 0.88rem;
            color: #cbd5e1;
            line-height: 1.7;
        }

        .modal-tab-pane.active { display: block; }

        .modal-alert {
            display: none;
            padding: 0.85rem 1rem;
            border-radius: 12px;
            font-size: 0.82rem;
            margin-bottom: 1.25rem;
        }

        .modal-alert.info {
            display: block;
            background: rgba(2, 132, 199, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.3);
            color: #38bdf8;
        }

        .btn-checkout {
            width: 100%;
            background: linear-gradient(135deg, #0284c7, #0369a1);
            color: #ffffff;
            font-weight: 800;
            font-size: 1.05rem;
            padding: 1rem 1.5rem;
            border-radius: 16px;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            transition: all 0.2s ease;
            box-shadow: 0 10px 25px -5px var(--brand-glow);
        }

        .btn-checkout:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 35px -5px rgba(2, 132, 199, 0.6);
        }

        /* Review Submission Modal */
        .review-form-modal {
            max-width: 500px;
            background: #0d1424;
            border: 1px solid var(--card-border);
            border-radius: 24px;
            padding: 2rem;
            position: relative;
        }

        .form-group {
            margin-bottom: 1.25rem;
        }

        .form-group label {
            display: block;
            font-size: 0.8rem;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 0.4rem;
        }

        .form-control {
            width: 100%;
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid var(--card-border);
            color: #ffffff;
            padding: 0.75rem 1rem;
            border-radius: 12px;
            font-size: 0.9rem;
            outline: none;
            font-family: inherit;
        }

        .form-control:focus {
            border-color: var(--brand-light);
        }

        /* Footer */
        .footer {
            border-top: 1px solid var(--card-border);
            padding: 5rem 1.5rem 2.5rem 1.5rem;
            background: #04070e;
        }

        .footer-container {
            max-width: 1380px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 1fr;
            gap: 3rem;
            margin-bottom: 3.5rem;
        }

        @media (max-width: 900px) { .footer-container { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 500px) { .footer-container { grid-template-columns: 1fr; } }

        .footer-col h4 {
            font-size: 0.95rem;
            font-weight: 800;
            color: #ffffff;
            margin-bottom: 1.25rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .footer-col ul { list-style: none; }
        .footer-col li { margin-bottom: 0.65rem; }
        .footer-col a {
            color: var(--text-muted);
            text-decoration: none;
            font-size: 0.85rem;
            transition: color 0.2s;
        }
        .footer-col a:hover { color: var(--brand-light); }

        .footer-bottom {
            max-width: 1380px;
            margin: 0 auto;
            padding-top: 2rem;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.82rem;
            color: var(--text-dim);
            flex-wrap: wrap;
            gap: 1rem;
        }
    </style>
</head>
<body>

    <!-- Header Navigation with Mirage Shield Logo -->
    <header class="navbar">
        <div class="nav-container">
            <a href="/" class="brand-logo">
                <img src="/public/images/logo.png" alt="Mirage Logo" class="brand-logo-img" />
                <div class="brand-title">MIRAGE <span>STORE</span></div>
            </a>

            <ul class="nav-links">
                <li><a href="#products" class="active" onclick="filterCategory('all')">HOME</a></li>
                <li><a href="#products" onclick="filterCategory('scripts')">SCRIPTS</a></li>
                <li><a href="#products" onclick="filterCategory('vehicles')">VEHICLES</a></li>
                <li><a href="#products" onclick="filterCategory('mlos')">MLOS</a></li>
                <li><a href="#reviews">REVIEWS</a></li>
            </ul>

            <div class="nav-actions">
                <!-- CFX.re User Profile / Authentication -->
                <div id="cfxUserContainer" class="cfx-user-container">
                    <button id="cfxLoginBtn" class="cfx-login-btn" onclick="loginWithCfx()">
                        <img src="https://forum.cfx.re/uploads/default/original/4X/3/0/0/30064d12c8ff4978be77bb326e57973eeaa89bf0.png" alt="CFX" class="cfx-mini-logo" onerror="this.src='/public/images/logo.png'" />
                        <span>Sign In with Cfx.re</span>
                    </button>

                    <div id="cfxProfileDropdown" class="cfx-profile-dropdown" style="display: none;">
                        <div class="cfx-user-pill">
                            <img id="cfxUserAvatar" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100" alt="CFX Avatar" class="cfx-user-avatar" />
                            <div class="cfx-user-meta">
                                <span id="cfxUserName" class="cfx-username">FiveM User</span>
                                <span class="cfx-badge">Keymaster Active</span>
                            </div>
                            <svg class="cfx-chevron" width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                        </div>
                        <div class="cfx-dropdown-menu">
                            <a href="https://keymaster.fivem.net" target="_blank" class="cfx-menu-item">
                                <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>My Keymaster Assets</span>
                            </a>
                            <button class="cfx-menu-item cfx-logout-btn" onclick="logoutCfx()">
                                <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"/>
                                </svg>
                                <span>Log Out</span>
                            </button>
                        </div>
                    </div>
                </div>

                <a id="discordLink" href="https://discord.gg/fivem" target="_blank" class="discord-btn">
                    <svg width="17" height="17" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                    <span>Discord</span>
                </a>
            </div>
        </div>
    </header>

    <!-- 4K Real GTA Hero Section with Live Recent Payments Feed -->
    <section class="gta-hero">
        <div class="hero-overlay"></div>
        <div class="hero-container">
            <div class="hero-left-content">
                <div class="hero-tag">
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                    <span>Official CFX.re Escrow Certified</span>
                </div>
                <h1 class="hero-title">BEST FIVEM SCRIPTS<br><span>MIRAGE STORE</span></h1>
                <p class="hero-desc">
                    Premium FiveM scripts, custom car packs, and high-definition MLO interiors. Designed for 0.00ms idle resmon, seamless framework integration (QBCore, Qbox, ESX), and automated Keymaster delivery.
                </p>

                <div class="hero-buttons">
                    <a href="#products" class="btn-view-more">
                        <span>VIEW MORE</span>
                        <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                    </a>
                    <a href="https://discord.gg/fivem" target="_blank" class="btn-discord-hero">
                        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z"/></svg>
                        <span>Join Discord (12.5k Members)</span>
                    </a>
                </div>
            </div>

            <!-- Real-Time Live Feed Card Placed on Far Right -->
            <div class="hero-right-widget">
                <div class="recent-payments-card">
                    <div class="payments-header">
                        <div class="payments-header-title">
                            <span class="live-dot"></span>
                            <span>LIVE PAYMENTS FEED</span>
                        </div>
                        <span style="font-size: 0.65rem; color: var(--brand-light); font-weight: 700;">MIRAGESTORE.TEBEX.IO</span>
                    </div>

                    <div class="payments-list" id="recentPaymentsList"></div>
                </div>
            </div>
        </div>
    </section>

    <!-- Stats Bar -->
    <div class="stats-bar">
        <div class="stat-item">
            <h3>1,450<span>+</span></h3>
            <p>Active FiveM Servers</p>
        </div>
        <div class="stat-item">
            <h3>0.00<span>ms</span></h3>
            <p>Idle Resmon</p>
        </div>
        <div class="stat-item">
            <h3>100<span>%</span></h3>
            <p>CFX.re Keymaster Safe</p>
        </div>
        <div class="stat-item">
            <h3>24/7</h3>
            <p>Dedicated Support</p>
        </div>
    </div>

    <!-- Products Catalog Section -->
    <section id="products">
        <div class="section-header">
            <div class="section-title">
                <h2>Featured Products & Assets</h2>
                <p>Browse our catalog of verified FiveM scripts, MLO interiors, and custom vehicle packs.</p>
            </div>

            <div class="filter-tabs">
                <button class="filter-btn active" onclick="filterCategory('all', event)">ALL</button>
                <button class="filter-btn" onclick="filterCategory('scripts', event)">SCRIPTS</button>
                <button class="filter-btn" onclick="filterCategory('vehicles', event)">VEHICLES</button>
                <button class="filter-btn" onclick="filterCategory('mlos', event)">MLOS</button>
            </div>
        </div>

        <div class="products-grid" id="productsGrid"></div>
    </section>

    <!-- Verified Customer Reviews Section -->
    <section class="reviews-section" id="reviews">
        <div class="reviews-container">
            <div class="reviews-header-row">
                <div class="section-title">
                    <h2>Verified Customer Reviews</h2>
                    <p>Real feedback from FiveM server owners, lead developers, and communities.</p>
                </div>
                <button class="btn-add-review" onclick="openReviewModal()">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
                    <span>Write a Review</span>
                </button>
            </div>

            <div class="reviews-grid" id="reviewsGrid"></div>
        </div>
    </section>

    <!-- Product Details Modal -->
    <div class="modal-backdrop" id="productModal">
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal()">✕</button>
            
            <div class="modal-media-viewer" id="mediaViewer">
                <img id="mainMediaImg" src="" alt="Showcase" />
            </div>

            <div class="thumbnails-strip" id="thumbnailsStrip"></div>

            <div class="modal-body">
                <div class="modal-title-row">
                    <div>
                        <h2 class="modal-title" id="modalTitle">Product Title</h2>
                        <span id="modalFramework" class="framework-tag" style="margin-top: 0.5rem; display: inline-block;">Framework</span>
                    </div>
                    <div>
                        <div class="modal-price" id="modalPrice">$0.00</div>
                    </div>
                </div>

                <div class="modal-tabs">
                    <button class="modal-tab-btn active" onclick="switchModalTab('desc', event)">Description</button>
                    <button class="modal-tab-btn" onclick="switchModalTab('video', event)">Video Showcase</button>
                    <button class="modal-tab-btn" onclick="switchModalTab('docs', event)">Installation Guide</button>
                </div>

                <div id="modal-tab-desc" class="modal-tab-pane active">
                    <div id="modalFullDesc"></div>
                </div>

                <div id="modal-tab-video" class="modal-tab-pane">
                    <div style="aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden; margin-top: 0.5rem;">
                        <iframe id="modalVideoFrame" width="100%" height="100%" src="" allowfullscreen></iframe>
                    </div>
                </div>

                <div id="modal-tab-docs" class="modal-tab-pane">
                    <div id="modalDocsContent" style="white-space: pre-wrap; font-family: monospace; background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 12px;"></div>
                </div>

                <div id="modalAlert" class="modal-alert" style="margin-top: 1.5rem;"></div>

                <div style="margin-top: 2rem;">
                    <button id="modalBuyBtn" class="btn-checkout" onclick="handleModalBuy()">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                        </svg>
                        <span id="modalBuyText">Buy Now via Tebex</span>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Review Submission Modal -->
    <div class="modal-backdrop" id="reviewModal">
        <div class="review-form-modal">
            <button class="modal-close" onclick="closeReviewModal()">✕</button>
            <h3 style="font-size: 1.4rem; font-weight: 800; color: #ffffff; margin-bottom: 0.5rem;">Submit Buyer Review</h3>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">Share your experience with Mirage resources.</p>

            <div class="form-group">
                <label>Your Name / Server Handle</label>
                <input type="text" id="reviewAuthor" class="form-control" placeholder="e.g. Alex_Dev" required />
            </div>

            <div class="form-group">
                <label>Server Role / Community</label>
                <input type="text" id="reviewRole" class="form-control" placeholder="e.g. Owner, Velocity Roleplay" required />
            </div>

            <div class="form-group">
                <label>Product Purchased</label>
                <select id="reviewProductSelect" class="form-control"></select>
            </div>

            <div class="form-group">
                <label>Rating</label>
                <select id="reviewRating" class="form-control">
                    <option value="5">★★★★★ (5 Stars - Exceptional)</option>
                    <option value="4">★★★★☆ (4 Stars - Great)</option>
                    <option value="3">★★★☆☆ (3 Stars - Average)</option>
                </select>
            </div>

            <div class="form-group">
                <label>Feedback & Comments</label>
                <textarea id="reviewComment" class="form-control" style="min-height: 100px;" placeholder="Write your review..."></textarea>
            </div>

            <button class="btn-checkout" onclick="submitReview()" style="margin-top: 1rem;">Submit Review</button>
        </div>
    </div>

    <!-- Footer with Mirage Logo -->
    <footer class="footer">
        <div class="footer-container">
            <div class="footer-col">
                <div class="brand-logo" style="margin-bottom: 1rem;">
                    <img src="/public/images/logo.png" alt="Mirage Logo" class="brand-logo-img" />
                    <div class="brand-title">MIRAGE <span>STORE</span></div>
                </div>
                <p style="font-size: 0.85rem; color: var(--text-dim); max-width: 320px; line-height: 1.6;">
                    Leading provider of top-tier FiveM scripts, custom car packs, and high-definition MLO interiors. Certified official Tebex merchant.
                </p>
            </div>

            <div class="footer-col">
                <h4>Marketplace</h4>
                <ul>
                    <li><a href="#products" onclick="filterCategory('scripts')">FiveM Scripts</a></li>
                    <li><a href="#products" onclick="filterCategory('vehicles')">Vehicle Packs</a></li>
                    <li><a href="#products" onclick="filterCategory('mlos')">MLO Interiors</a></li>
                    <li><a href="#products" onclick="filterCategory('all')">All Products</a></li>
                </ul>
            </div>

            <div class="footer-col">
                <h4>Support & Links</h4>
                <ul>
                    <li><a href="https://discord.gg/fivem" target="_blank">Discord Community</a></li>
                    <li><a href="https://keymaster.fivem.net" target="_blank">CFX.re Keymaster</a></li>
                    <li><a href="/admin">Admin Dashboard</a></li>
                </ul>
            </div>

            <div class="footer-col">
                <h4>Security & Payments</h4>
                <p style="font-size: 0.82rem; color: var(--text-dim); margin-bottom: 1rem;">
                    All payments are securely processed and protected by Tebex Merchant Services with 256-bit SSL encryption.
                </p>
                <div style="font-size: 0.75rem; color: var(--brand-light); font-weight: 700; display: flex; align-items: center; gap: 0.35rem;">
                    <svg width="15" height="15" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                    <span>Verified Tebex Storefront</span>
                </div>
            </div>
        </div>

        <div class="footer-bottom">
            <div>© 2026 Mirage Store. All rights reserved. Not affiliated with Rockstar Games or Take-Two Interactive.</div>
            <div>Powered by Tebex Headless API</div>
        </div>
    </footer>

    <!-- Client-Side Real-Time Store Logic -->
    <script>
        let storeProducts = [];
        let currentSelectedProduct = null;

        // Connect to Real-Time Server-Sent Events (SSE) Stream
        function initRealtimeFeed() {
            try {
                const evtSource = new EventSource('/api/events/live-feed');
                evtSource.addEventListener('payment_received', (e) => {
                    const data = JSON.parse(e.data);
                    if (data && data.payload) {
                        prependRealtimePayment(data.payload);
                    }
                });
            } catch (err) {
                console.warn('Realtime feed fallback mode:', err);
            }
        }

        function prependRealtimePayment(p) {
            const list = document.getElementById('recentPaymentsList');
            const row = document.createElement('div');
            row.className = 'payment-row new-entry';
            row.innerHTML = \`
                <div class="payment-user">
                    <img class="payment-avatar" src="\${p.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'}" alt="\${p.buyer}" />
                    <div class="payment-info">
                        <div class="name">\${p.buyer}</div>
                        <div class="item">\${p.item}</div>
                    </div>
                </div>
                <div class="payment-price">
                    <div>\${p.price}</div>
                    <div class="payment-time">Just now</div>
                </div>
            \`;
            list.insertBefore(row, list.firstChild);
            if (list.children.length > 5) {
                list.removeChild(list.lastChild);
            }
        }

        // CFX.re User Session Management
        async function initCfxUser() {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const basketId = urlParams.get('basketId') || sessionStorage.getItem('tebex_basket_id');
                
                let savedUser = null;
                try {
                    savedUser = JSON.parse(localStorage.getItem('cfx_user'));
                } catch (e) {}

                if (basketId) {
                    const res = await fetch('/api/user/profile?basketId=' + encodeURIComponent(basketId));
                    const data = await res.json();
                    if (data && data.loggedIn) {
                        savedUser = data;
                        localStorage.setItem('cfx_user', JSON.stringify(data));
                    }
                }

                renderCfxUser(savedUser);
            } catch (err) {
                console.warn('CFX User Init Error:', err);
            }
        }

        function renderCfxUser(user) {
            const loginBtn = document.getElementById('cfxLoginBtn');
            const profileDropdown = document.getElementById('cfxProfileDropdown');
            const userAvatar = document.getElementById('cfxUserAvatar');
            const userName = document.getElementById('cfxUserName');

            if (user && user.loggedIn) {
                if (loginBtn) loginBtn.style.display = 'none';
                if (profileDropdown) profileDropdown.style.display = 'block';
                if (userName) userName.innerText = user.username;
                if (userAvatar) {
                    userAvatar.src = user.avatar || ('https://forum.cfx.re/user_avatar/forum.cfx.re/' + encodeURIComponent(user.username) + '/120/1.png');
                    userAvatar.onerror = function() {
                        this.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100';
                    };
                }
            } else {
                if (loginBtn) loginBtn.style.display = 'flex';
                if (profileDropdown) profileDropdown.style.display = 'none';
            }
        }

        async function loginWithCfx() {
            const btn = document.getElementById('cfxLoginBtn');
            if (btn) btn.innerHTML = '<span>Connecting to Cfx.re...</span>';
            try {
                const res = await fetch('/api/create-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ packageId: NOTARY_PACKAGE_ID, returnBaseUrl: window.location.origin })
                });
                const data = await res.json();
                if (data && data.authUrl) {
                    window.location.href = data.authUrl;
                } else if (data && data.checkoutUrl) {
                    window.location.href = data.checkoutUrl;
                }
            } catch (e) {
                alert('Failed to connect to CFX login');
                if (btn) btn.innerHTML = '<img src="https://forum.cfx.re/uploads/default/original/4X/3/0/0/30064d12c8ff4978be77bb326e57973eeaa89bf0.png" class="cfx-mini-logo" /> <span>Sign In with Cfx.re</span>';
            }
        }

        function logoutCfx() {
            localStorage.removeItem('cfx_user');
            sessionStorage.removeItem('tebex_basket_id');
            if (window.history.replaceState) {
                window.history.replaceState(null, null, window.location.pathname);
            }
            renderCfxUser(null);
            window.location.reload();
        }

        async function loadStore() {
            try {
                const res = await fetch('/api/store?_t=' + Date.now(), { cache: 'no-store' });
                const data = await res.json();
                storeProducts = data.products || [];
                
                if (data.discordUrl) {
                    const dLink = document.getElementById('discordLink');
                    if (dLink) dLink.href = data.discordUrl;
                }

                renderRecentPayments(data.recentPayments || []);
                renderProducts(storeProducts);
                renderReviews(data.reviews || []);
                populateReviewSelect(storeProducts);
                initCfxUser();
            } catch (e) {
                console.error('Failed to load store data:', e);
            }
        }

        function initRealtimeFeed() {
            try {
                const sse = new EventSource('/api/events/live-feed');
                sse.addEventListener('payment_received', (e) => {
                    try {
                        const payment = JSON.parse(e.data);
                        const list = document.getElementById('recentPaymentsList');
                        if (list) {
                            const row = document.createElement('div');
                            row.className = 'payment-row new-entry';
                            row.innerHTML = \`
                                <div class="payment-user">
                                    <img class="payment-avatar" src="\${payment.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}" alt="\${payment.buyer}" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'" />
                                    <div class="payment-info">
                                        <div class="name">\${payment.buyer}</div>
                                        <div class="item">\${payment.item}</div>
                                    </div>
                                </div>
                                <div class="payment-price">
                                    <div>\${payment.price}</div>
                                    <div class="payment-time">\${payment.time || 'Just now'}</div>
                                </div>
                            \`;
                            list.insertBefore(row, list.firstChild);
                        }
                    } catch(err) {}
                });
                sse.addEventListener('store_updated', () => {
                    console.log('⚡ Real-time store update received from Tebex! Updating UI...');
                    loadStore();
                });
            } catch(e) {
                console.warn('Real-time SSE connection failed:', e);
            }
        }

        function renderRecentPayments(payments) {
            const list = document.getElementById('recentPaymentsList');
            list.innerHTML = '';
            if (!payments || payments.length === 0) {
                list.innerHTML = \`
                    <div style="text-align: center; padding: 0.75rem 0.5rem; font-size: 0.68rem; color: var(--text-dim);">
                        <span>⚡ Live sync connected • Awaiting Tebex events</span>
                    </div>
                \`;
                return;
            }
            payments.forEach(p => {
                const row = document.createElement('div');
                row.className = 'payment-row';
                row.innerHTML = \`
                    <div class="payment-user">
                        <img class="payment-avatar" src="\${p.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}" alt="\${p.buyer}" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'" />
                        <div class="payment-info">
                            <div class="name">\${p.buyer}</div>
                            <div class="item">\${p.item}</div>
                        </div>
                    </div>
                    <div class="payment-price">
                        <div>\${p.price}</div>
                        <div class="payment-time">\${p.time}</div>
                    </div>
                \`;
                list.appendChild(row);
            });
        }

        function renderReviews(reviews) {
            const grid = document.getElementById('reviewsGrid');
            grid.innerHTML = '';
            reviews.forEach(r => {
                const starsSvg = Array(r.rating || 5).fill('<svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>').join('');

                const card = document.createElement('div');
                card.className = 'review-card';
                card.innerHTML = \`
                    <div class="review-user-row">
                        <img class="review-avatar-img" src="\${r.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'}" alt="\${r.author}" />
                        <div>
                            <div style="font-weight: 800; color: #fff; font-size: 0.95rem;">\${r.author}</div>
                            <div style="font-size: 0.75rem; color: var(--text-dim);">\${r.role} • \${r.date}</div>
                        </div>
                    </div>
                    <div class="review-stars">\${starsSvg}</div>
                    <div class="review-product-tag">📦 \${r.productName}</div>
                    <div class="review-comment">"\${r.comment}"</div>
                    <div class="verified-buyer-badge">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                        <span>Verified Tebex Purchase</span>
                    </div>
                \`;
                grid.appendChild(card);
            });
        }

        function populateReviewSelect(products) {
            const select = document.getElementById('reviewProductSelect');
            if (!select) return;
            select.innerHTML = '';
            products.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.innerText = p.name;
                select.appendChild(opt);
            });
        }

        function openReviewModal() {
            document.getElementById('reviewModal').classList.add('active');
        }

        function closeReviewModal() {
            document.getElementById('reviewModal').classList.remove('active');
        }

        async function submitReview() {
            const author = document.getElementById('reviewAuthor').value;
            const role = document.getElementById('reviewRole').value;
            const productName = document.getElementById('reviewProductSelect').value;
            const rating = parseInt(document.getElementById('reviewRating').value);
            const comment = document.getElementById('reviewComment').value;

            if (!author || !comment) {
                alert('Please enter your name and comments.');
                return;
            }

            const res = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ author, role, productName, rating, comment })
            });

            if (res.ok) {
                closeReviewModal();
                loadStore();
            } else {
                alert('Failed to submit review.');
            }
        }

        function renderProducts(items) {
            const grid = document.getElementById('productsGrid');
            grid.innerHTML = '';

            items.forEach(p => {
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = \`
                    <div class="card-img-wrapper">
                        <img src="\${p.image}" alt="\${p.name}" />
                        <span class="card-badge \${p.badgeColor}">\${p.badge}</span>
                        <span class="resmon-pill">
                            <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/></svg>
                            <span>\${p.resmon}</span>
                        </span>
                    </div>
                    <div class="card-content">
                        <div class="card-category">\${p.categoryName}</div>
                        <h3 class="card-name">\${p.name}</h3>
                        <p class="card-desc">\${p.shortDesc}</p>
                        
                        <div class="card-meta">
                            <div>
                                <span class="card-price">\${Number(p.price) === 0 ? 'FREE' : ('$' + Number(p.price).toFixed(2))}</span>
                                <span class="card-period">\${Number(p.price) === 0 ? '' : (p.isSubscription ? '/ month' : 'one-time')}</span>
                            </div>
                            <span class="framework-tag">\${p.framework}</span>
                        </div>

                        <div class="card-actions">
                            <a href="/package/\${p.id}" class="btn-view">Details & Gallery</a>
                            <button class="btn-buy-card" data-product-id="\${p.id}">Buy Now</button>
                        </div>
                    </div>
                \`;

                const imgWrap = card.querySelector('.card-img-wrapper');
                if (imgWrap) {
                    imgWrap.style.cursor = 'pointer';
                    imgWrap.onclick = () => window.location.href = '/package/' + p.id;
                }

                const btnBuy = card.querySelector('.btn-buy-card');
                if (btnBuy) {
                    btnBuy.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        initiateBuy(p.id);
                    });
                }

                grid.appendChild(card);
            });
        }

        function filterCategory(category, event) {
            if (event) {
                document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                event.target.classList.add('active');
            }

            if (category === 'all') {
                renderProducts(storeProducts);
            } else {
                const filtered = storeProducts.filter(p => p.category === category);
                renderProducts(filtered);
            }
        }

        function openModal(productId) {
            const p = storeProducts.find(item => String(item.id) === String(productId));
            if (!p) {
                console.warn('Product not found:', productId);
                return;
            }
            currentSelectedProduct = p;

            const strip = document.getElementById('thumbnailsStrip');
            strip.innerHTML = '';

            setMainMedia(p.image, 'image');

            if (p.media && p.media.length > 0) {
                p.media.forEach((imgUrl, idx) => {
                    const thumb = document.createElement('div');
                    thumb.className = 'thumb-item' + (idx === 0 ? ' active' : '');
                    thumb.innerHTML = \`<img src="\${imgUrl}" alt="Thumb" />\`;
                    thumb.onclick = () => {
                        document.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
                        thumb.classList.add('active');
                        setMainMedia(imgUrl, 'image');
                    };
                    strip.appendChild(thumb);
                });
            }

            if (p.youtubeUrl) {
                const vidThumb = document.createElement('div');
                vidThumb.className = 'thumb-item video-thumb';
                vidThumb.innerHTML = '▶';
                vidThumb.title = 'Watch Trailer';
                vidThumb.onclick = () => {
                    document.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
                    vidThumb.classList.add('active');
                    setMainMedia(p.youtubeUrl, 'video');
                };
                strip.appendChild(vidThumb);
            }

            document.getElementById('modalTitle').innerText = p.name;
            document.getElementById('modalPrice').innerText = '$' + Number(p.price).toFixed(2) + (p.isSubscription ? ' /mo' : '');
            document.getElementById('modalFramework').innerText = p.framework;
            document.getElementById('modalFullDesc').innerHTML = p.fullDesc;
            document.getElementById('modalDocsContent').innerText = p.docs || 'No extra docs available.';

            const embedUrl = getYouTubeEmbed(p.youtubeUrl);
            document.getElementById('modalVideoFrame').src = embedUrl;

            document.getElementById('modalAlert').style.display = 'none';
            document.getElementById('productModal').classList.add('active');
        }

        function setMainMedia(url, type) {
            const viewer = document.getElementById('mediaViewer');
            if (type === 'video') {
                const embedUrl = getYouTubeEmbed(url);
                viewer.innerHTML = \`<iframe width="100%" height="100%" src="\${embedUrl}" title="Product Video Showcase" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>\`;
            } else {
                viewer.innerHTML = \`<img id="mainMediaImg" src="\${url}" alt="Showcase" />\`;
            }
        }

        function getYouTubeEmbed(url) {
            if (!url) return '';
            try {
                let id = '';
                if (url.indexOf('youtu.be/') !== -1) {
                    id = url.split('youtu.be/')[1].split('?')[0].split('&')[0];
                } else if (url.indexOf('watch?v=') !== -1) {
                    id = url.split('watch?v=')[1].split('&')[0];
                } else if (url.indexOf('/embed/') !== -1) {
                    id = url.split('/embed/')[1].split('?')[0].split('&')[0];
                }
                if (id) {
                    return 'https://www.youtube.com/embed/' + id + '?enablejsapi=1&rel=0';
                }
                return url;
            } catch (e) {
                return url;
            }
        }

        function closeModal() {
            document.getElementById('modalVideoFrame').src = '';
            document.getElementById('productModal').classList.remove('active');
        }

        function switchModalTab(tab, event) {
            document.querySelectorAll('.modal-tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.modal-tab-pane').forEach(pane => pane.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById('modal-tab-' + tab).classList.add('active');
        }

        function launchTebexCheckout(checkoutUrl, ident) {
            if (typeof Tebex !== 'undefined' && Tebex.checkout) {
                try {
                    if (ident) {
                        Tebex.checkout.init({ ident: ident, theme: 'dark' });
                    }
                    Tebex.checkout.launch();
                    return;
                } catch (e) {
                    console.warn("Tebex.js launch modal failed:", e);
                }
            }
            if (checkoutUrl) {
                window.location.href = checkoutUrl;
            }
        }

        async function initiateBuy(packageId, fromModal = false) {
            const btn = fromModal ? document.getElementById('modalBuyBtn') : null;
            const btnText = fromModal ? document.getElementById('modalBuyText') : null;

            if (btn) {
                btn.disabled = true;
                btnText.innerText = 'Creating Basket...';
            }

            // Show interactive feedback
            const alertEl = document.getElementById('modalAlert');
            if (fromModal && alertEl) {
                alertEl.innerText = '⚡ Connecting to Tebex Headless API...';
                alertEl.className = 'modal-alert info';
                alertEl.style.display = 'block';
            }

            try {
                const urlParams = new URLSearchParams(window.location.search);
                const basketId = urlParams.get('basketId') || sessionStorage.getItem('tebex_basket_id');

                const response = await fetch('/api/create-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        packageId: packageId || NOTARY_PACKAGE_ID,
                        basketId: basketId,
                        returnBaseUrl: window.location.origin
                    })
                });

                const data = await response.json();

                if (data.basketIdent) {
                    sessionStorage.setItem('tebex_basket_id', data.basketIdent);
                }

                if (data.requiresAuth && data.authUrl) {
                    if (alertEl) {
                        alertEl.innerText = '🔑 Redirecting to CFX.re / FiveM authentication...';
                        alertEl.className = 'modal-alert info';
                        alertEl.style.display = 'block';
                    }
                    window.location.href = data.authUrl;
                    return;
                }

                if (data.checkoutUrl || data.basketIdent) {
                    sessionStorage.removeItem('tebex_basket_id');
                    if (window.history.replaceState) {
                        window.history.replaceState(null, null, window.location.pathname);
                    }
                    closeModal();
                    launchTebexCheckout(data.checkoutUrl, data.basketIdent);
                } else {
                    alert("Checkout Error: " + (data.error || "Package not found on Tebex or failed to create checkout"));
                }
            } catch (error) {
                console.error("Checkout Error:", error);
                alert("Error connecting to server: " + error.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btnText.innerText = 'Buy Now via Tebex';
                }
            }
        }

        function handleModalBuy() {
            if (currentSelectedProduct) {
                initiateBuy(currentSelectedProduct.id, true);
            }
        }

        window.addEventListener('DOMContentLoaded', () => {
            loadStore();
            initRealtimeFeed();

            // Bind modal buy button
            const modalBuyBtn = document.getElementById('modalBuyBtn');
            if (modalBuyBtn) {
                modalBuyBtn.addEventListener('click', handleModalBuy);
            }

            // Bind modal close button
            const modalCloseBtn = document.querySelector('.btn-close-modal');
            if (modalCloseBtn) {
                modalCloseBtn.addEventListener('click', closeModal);
            }

            // Bind modal tab buttons
            document.querySelectorAll('.modal-tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tabName = btn.getAttribute('data-tab') || (btn.innerText.toLowerCase().includes('video') ? 'video' : (btn.innerText.toLowerCase().includes('docs') ? 'docs' : 'overview'));
                    switchModalTab(tabName, e);
                });
            });

            // Bind category filter buttons
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const cat = btn.getAttribute('data-cat') || btn.innerText.toLowerCase();
                    let targetCategory = 'all';
                    if (cat.includes('script')) targetCategory = 'scripts';
                    else if (cat.includes('mlo')) targetCategory = 'mlos';
                    else if (cat.includes('vehicle') || cat.includes('car')) targetCategory = 'vehicles';
                    else if (cat.includes('cad') || cat.includes('mdt')) targetCategory = 'cads';
                    filterCategory(targetCategory, e);
                });
            });

            // Handle URL auth return
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('basketId')) {
                initiateBuy(NOTARY_PACKAGE_ID);
            }
        });
    </script>
</body>
</html>`;

// ===================================================
// 8. ADMIN DASHBOARD WITH JWT AUTH & LIVE ANALYTICS
// ===================================================
const adminHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mirage Store - Enterprise Admin Dashboard</title>
    <script src="https://js.tebex.io/tebex.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --brand: #0284c7;
            --brand-light: #38bdf8;
            --dark-bg: #070b14;
            --card-bg: rgba(13, 20, 36, 0.85);
            --card-border: rgba(255, 255, 255, 0.08);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background-color: var(--dark-bg);
            background-image: radial-gradient(at 0% 0%, rgba(2, 132, 199, 0.15) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(56, 189, 248, 0.1) 0px, transparent 50%);
            min-height: 100vh;
            font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
            color: var(--text-main);
            padding: 2rem 1.5rem;
        }

        .admin-container {
            max-width: 1150px;
            margin: 0 auto;
        }

        .admin-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 1.5rem;
            border-bottom: 1px solid var(--card-border);
            margin-bottom: 2rem;
            flex-wrap: wrap;
            gap: 1rem;
        }

        .admin-brand {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .admin-brand img {
            width: 38px;
            height: 38px;
            object-fit: contain;
        }

        .admin-header h1 {
            font-size: 1.8rem;
            font-weight: 900;
        }

        .admin-header h1 span { color: var(--brand-light); }

        .btn-sync {
            background: rgba(2, 132, 199, 0.15);
            color: var(--brand-light);
            border: 1px solid rgba(56, 189, 248, 0.3);
            font-weight: 700;
            padding: 0.65rem 1.25rem;
            border-radius: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.2s;
        }

        .btn-sync:hover {
            background: var(--brand);
            color: #fff;
        }

        .btn-home {
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            border: 1px solid var(--card-border);
            padding: 0.65rem 1.25rem;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 700;
            font-size: 0.85rem;
        }

        .login-card {
            max-width: 420px;
            margin: 4rem auto;
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 24px;
            padding: 2.5rem;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
        }

        .login-card input {
            width: 100%;
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid var(--card-border);
            color: #ffffff;
            padding: 0.85rem 1rem;
            border-radius: 12px;
            font-size: 1rem;
            text-align: center;
            margin: 1.5rem 0 1rem 0;
            outline: none;
        }

        .login-card button {
            width: 100%;
            background: var(--brand);
            color: #fff;
            font-weight: 800;
            padding: 0.85rem;
            border-radius: 12px;
            border: none;
            cursor: pointer;
        }

        .dashboard-content {
            display: none;
            grid-template-columns: 340px 1fr;
            gap: 2rem;
        }

        @media (max-width: 860px) {
            .dashboard-content { grid-template-columns: 1fr; }
        }

        .panel-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 20px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
        }

        .panel-title {
            font-size: 1.1rem;
            font-weight: 800;
            margin-bottom: 1rem;
            color: #ffffff;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .pkg-list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .pkg-item {
            background: rgba(30, 41, 59, 0.4);
            border: 1px solid var(--card-border);
            padding: 0.85rem 1rem;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .pkg-item:hover, .pkg-item.active {
            background: rgba(2, 132, 199, 0.15);
            border-color: var(--brand-light);
        }

        .form-group {
            margin-bottom: 1.25rem;
        }

        .form-group label {
            display: block;
            font-size: 0.8rem;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 0.4rem;
        }

        .form-control {
            width: 100%;
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid var(--card-border);
            color: #ffffff;
            padding: 0.75rem 1rem;
            border-radius: 12px;
            font-size: 0.9rem;
            outline: none;
            font-family: inherit;
        }

        .form-control:focus {
            border-color: var(--brand-light);
        }

        textarea.form-control {
            min-height: 120px;
            resize: vertical;
        }

        .btn-save {
            background: var(--brand);
            color: #ffffff;
            font-weight: 800;
            font-size: 0.95rem;
            padding: 0.85rem 1.75rem;
            border-radius: 14px;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn-save:hover {
            background: var(--brand-hover);
            transform: translateY(-1px);
        }

        .toast {
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            background: #0284c7;
            color: #ffffff;
            font-weight: 800;
            padding: 0.85rem 1.5rem;
            border-radius: 14px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            display: none;
            animation: fadeIn 0.3s;
            z-index: 100;
        }

        .health-badge {
            font-size: 0.72rem;
            font-weight: 700;
            color: #22c55e;
            background: rgba(34, 197, 94, 0.1);
            padding: 0.25rem 0.5rem;
            border-radius: 6px;
            border: 1px solid rgba(34, 197, 94, 0.3);
        }
    </style>
</head>
<body>

    <div class="admin-container">
        <div id="loginCard" class="login-card">
            <h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.5rem;">Enterprise Admin</h2>
            <p style="font-size: 0.85rem; color: var(--text-muted);">Enter PIN to generate cryptographically signed session token.</p>
            <input type="password" id="adminPinInput" placeholder="Enter PIN (Default: mirage2026)" />
            <button onclick="authenticateAdmin()">Sign In (JWT Secure)</button>
            <div id="loginError" style="color: #f87171; font-size: 0.8rem; margin-top: 0.75rem; display: none;">Invalid PIN!</div>
        </div>

        <div id="dashboard" style="display: none;">
            <div class="admin-header">
                <div class="admin-brand">
                    <img src="/public/images/logo.png" alt="Mirage" />
                    <div>
                        <h1>MIRAGE <span>ADMIN</span></h1>
                        <p style="font-size: 0.85rem; color: var(--text-muted);">Configure Store Settings, Webhooks, and Tebex Catalog.</p>
                    </div>
                </div>
                <div style="display: flex; gap: 0.75rem; align-items: center;">
                    <button class="btn-sync" onclick="syncWithTebex()">🔄 Sync from Tebex</button>
                    <a href="/" class="btn-home">View Storefront ➔</a>
                    <button class="btn-sync" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border-color: rgba(239,68,68,0.3);" onclick="logoutAdmin()">Logout</button>
                </div>
            </div>

            <div class="dashboard-content" style="display: grid;">
                <div>
                    <div class="panel-card">
                        <div class="panel-title">
                            <span>📦 Tebex Packages</span>
                            <span class="health-badge" id="systemHealthBadge">● ONLINE</span>
                        </div>
                        <div class="pkg-list" id="pkgList"></div>
                    </div>

                    <div class="panel-card">
                        <div class="panel-title">⚙️ Store Settings</div>
                        <div class="form-group">
                            <label>Top Supporter Name</label>
                            <input type="text" id="supporterName" class="form-control" placeholder="URSU ARTS" />
                        </div>
                        <div class="form-group">
                            <label>Announcement Bar</label>
                            <input type="text" id="storeAnnouncement" class="form-control" />
                        </div>
                        <div class="form-group">
                            <label>Discord Invite URL</label>
                            <input type="text" id="storeDiscord" class="form-control" />
                        </div>
                    </div>

                    <div class="panel-card">
                        <div class="panel-title">💳 Broadcast Live Payment</div>
                        <div class="form-group">
                            <label>Buyer Username</label>
                            <input type="text" id="newPaymentBuyer" class="form-control" placeholder="e.g. Alex_V" />
                        </div>
                        <div class="form-group">
                            <label>Item Name</label>
                            <input type="text" id="newPaymentItem" class="form-control" placeholder="e.g. [Escrow] Notary System v2.0" />
                        </div>
                        <div class="form-group">
                            <label>Price</label>
                            <input type="text" id="newPaymentPrice" class="form-control" placeholder="35.00 USD" />
                        </div>
                        <button class="btn-sync" style="width: 100%; justify-content: center;" onclick="addRealPayment()">+ Instant SSE Broadcast</button>
                    </div>
                </div>

                <div>
                    <div class="panel-card">
                        <div class="panel-title" id="editingPkgTitle">Select a package to edit</div>
                        
                        <div class="form-group">
                            <label>🎥 YouTube Showcase / Trailer URL</label>
                            <input type="text" id="pkgYoutube" class="form-control" placeholder="https://www.youtube.com/watch?v=..." />
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label>Framework Tag</label>
                                <input type="text" id="pkgFramework" class="form-control" placeholder="QBCore / Qbox / ESX" />
                            </div>
                            <div class="form-group">
                                <label>Resmon Performance</label>
                                <input type="text" id="pkgResmon" class="form-control" placeholder="0.00ms" />
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label>Card Badge Text</label>
                                <input type="text" id="pkgBadge" class="form-control" placeholder="Bestseller / New" />
                            </div>
                            <div class="form-group">
                                <label>Badge Color Preset</label>
                                <select id="pkgBadgeColor" class="form-control">
                                    <option value="accent">Blue / Brand Accent</option>
                                    <option value="purple">Purple / VIP</option>
                                    <option value="orange">Orange / Hot</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Category</label>
                            <select id="pkgCategory" class="form-control">
                                <option value="scripts">Scripts & Systems</option>
                                <option value="vehicles">Custom Vehicles</option>
                                <option value="mlos">MLOs & Interiors</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>📖 Installation Guide / Documentation</label>
                            <textarea id="pkgDocs" class="form-control" placeholder="Enter step-by-step setup instructions..."></textarea>
                        </div>

                        <div style="text-align: right; margin-top: 1.5rem;">
                            <button class="btn-save" onclick="saveAdminChanges()">Save & Publish Live</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="toast" class="toast">✓ Changes saved & published live!</div>
    </div>

    <script>
        let adminJwtToken = localStorage.getItem('mirage_admin_jwt') || '';
        let storeData = null;
        let selectedPkgId = null;

        async function authenticateAdmin() {
            const input = document.getElementById('adminPinInput').value;
            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: input })
                });
                const data = await res.json();
                if (res.ok && data.token) {
                    adminJwtToken = data.token;
                    localStorage.setItem('mirage_admin_jwt', data.token);
                    document.getElementById('loginCard').style.display = 'none';
                    document.getElementById('dashboard').style.display = 'block';
                    loadAdminData();
                } else {
                    document.getElementById('loginError').innerText = data.error || 'Invalid PIN!';
                    document.getElementById('loginError').style.display = 'block';
                }
            } catch (err) {
                alert('Connection error: ' + err.message);
            }
        }

        function logoutAdmin() {
            localStorage.removeItem('mirage_admin_jwt');
            document.cookie = "mirage_admin_token=; Max-Age=0; path=/;";
            window.location.reload();
        }

        async function loadAdminData() {
            const res = await fetch('/api/store');
            storeData = await res.json();

            document.getElementById('storeAnnouncement').value = storeData.announcement || '';
            document.getElementById('storeDiscord').value = storeData.discordUrl || '';
            document.getElementById('supporterName').value = storeData.topSupporter?.name || 'URSU ARTS';

            const list = document.getElementById('pkgList');
            list.innerHTML = '';

            storeData.products.forEach((p, idx) => {
                const item = document.createElement('div');
                item.className = 'pkg-item' + (idx === 0 ? ' active' : '');
                item.innerHTML = \`
                    <div style="font-weight: 800; font-size: 0.9rem; color: #ffffff;">\${p.name}</div>
                    <div style="font-size: 0.75rem; color: #94a3b8;">ID: \${p.id} • $\${Number(p.price).toFixed(2)}</div>
                \`;
                item.onclick = () => selectPackage(p.id, item);
                list.appendChild(item);
            });

            if (storeData.products.length > 0) {
                selectPackage(storeData.products[0].id, list.children[0]);
            }
        }

        function selectPackage(id, element) {
            selectedPkgId = id;
            document.querySelectorAll('.pkg-item').forEach(el => el.classList.remove('active'));
            if (element) element.classList.add('active');

            const p = storeData.products.find(item => item.id === id);
            if (!p) return;

            document.getElementById('editingPkgTitle').innerText = 'Editing: ' + p.name;
            document.getElementById('pkgYoutube').value = p.youtubeUrl || '';
            document.getElementById('pkgFramework').value = p.framework || '';
            document.getElementById('pkgResmon').value = p.resmon || '0.00ms';
            document.getElementById('pkgBadge').value = p.badge || '';
            document.getElementById('pkgBadgeColor').value = p.badgeColor || 'accent';
            document.getElementById('pkgCategory').value = p.category || 'scripts';
            document.getElementById('pkgDocs').value = p.docs || '';
        }

        async function syncWithTebex() {
            const btn = document.querySelector('.btn-sync');
            btn.innerText = 'Syncing...';
            await fetch('/api/sync-tebex');
            await loadAdminData();
            btn.innerText = '🔄 Sync from Tebex';
            showToast('Tebex packages refreshed!');
        }

        async function addRealPayment() {
            const buyer = document.getElementById('newPaymentBuyer').value;
            const item = document.getElementById('newPaymentItem').value;
            const price = document.getElementById('newPaymentPrice').value;

            if (!buyer || !item) {
                alert('Please provide buyer name and item name.');
                return;
            }

            const res = await fetch('/api/payments', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + adminJwtToken
                },
                body: JSON.stringify({ buyer, item, price: price || '35.00 USD' })
            });

            if (res.ok) {
                showToast('✓ Payment broadcasted live via SSE!');
                document.getElementById('newPaymentBuyer').value = '';
                document.getElementById('newPaymentItem').value = '';
                document.getElementById('newPaymentPrice').value = '';
                loadAdminData();
            } else {
                alert('Session expired or unauthorized. Please re-login.');
            }
        }

        async function saveAdminChanges() {
            if (!selectedPkgId) return;

            const payload = {
                announcement: document.getElementById('storeAnnouncement').value,
                discordUrl: document.getElementById('storeDiscord').value,
                topSupporterName: document.getElementById('supporterName').value,
                packageId: selectedPkgId,
                meta: {
                    youtubeUrl: document.getElementById('pkgYoutube').value,
                    framework: document.getElementById('pkgFramework').value,
                    resmon: document.getElementById('pkgResmon').value,
                    badge: document.getElementById('pkgBadge').value,
                    badgeColor: document.getElementById('pkgBadgeColor').value,
                    category: document.getElementById('pkgCategory').value,
                    docs: document.getElementById('pkgDocs').value
                }
            };

            const res = await fetch('/api/admin/save', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + adminJwtToken
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showToast('✓ Saved & Published Live!');
                loadAdminData();
            } else {
                alert('Failed to save changes. Session may have expired.');
            }
        }

        function showToast(msg) {
            const toast = document.getElementById('toast');
            toast.innerText = msg;
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }

        window.addEventListener('DOMContentLoaded', () => {
            if (adminJwtToken) {
                document.getElementById('loginCard').style.display = 'none';
                document.getElementById('dashboard').style.display = 'block';
                loadAdminData();
            }
        });
    </script>
</body>
</html>`;

function buildProductPageHTML(p, allProducts = [], allReviews = []) {
    const relatedProducts = allProducts.filter(item => String(item.id) !== String(p.id)).slice(0, 3);
    const isSub = p.isSubscription;
    const isFree = Number(p.price) === 0;
    const priceFormatted = isFree ? 'FREE' : ('$' + Number(p.price).toFixed(2));
    const pricePeriod = isFree ? '' : (isSub ? '/ month' : 'one-time');
    const mediaList = (p.media && p.media.length > 0) ? p.media : [p.image];
    const resourceName = (p.slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'mirage_resource');

    // Build media array for slider
    const sliderMediaItems = [];
    mediaList.forEach(imgUrl => {
        sliderMediaItems.push({ type: 'image', url: imgUrl });
    });
    if (p.youtubeUrl) {
        sliderMediaItems.push({ type: 'video', url: p.youtubeUrl });
    }

    // Escape and format markdown documentation
    const formattedDocs = (p.docs || 'No extra documentation notes.')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/^### (.*$)/gim, '<h3 style="color:#38bdf8;font-size:0.95rem;font-weight:700;margin:1rem 0 0.4rem;">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 style="color:#ffffff;font-size:1.05rem;font-weight:800;margin:1.2rem 0 0.5rem;">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 style="color:#ffffff;font-size:1.15rem;font-weight:800;margin:1.4rem 0 0.6rem;">$1</h1>')
        .replace(/^\d+\.\s+(.*$)/gim, '<li style="margin-bottom:0.35rem;color:#cbd5e1;">$1</li>')
        .replace(/`([^`]+)`/g, '<code style="background:#090e1a;border:1px solid rgba(56,189,248,0.25);padding:0.15rem 0.4rem;border-radius:5px;color:#38bdf8;font-family:monospace;font-size:0.8rem;">$1</code>')
        .replace(/\n/g, '<br/>');

    // Build thumbnail strip items
    let thumbsHTML = '';
    sliderMediaItems.forEach((item, idx) => {
        if (item.type === 'video') {
            thumbsHTML += '<div class="p-thumb p-thumb-video" id="thumb-' + idx + '" onclick="goToSlide(' + idx + ')">' +
                '<svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>' +
                '<span>Trailer</span>' +
            '</div>';
        } else {
            thumbsHTML += '<div class="p-thumb ' + (idx === 0 ? 'active' : '') + '" id="thumb-' + idx + '" onclick="goToSlide(' + idx + ')">' +
                '<img src="' + item.url + '" alt="Thumbnail ' + (idx + 1) + '" />' +
                '<span class="thumb-idx">' + (idx + 1) + '</span>' +
            '</div>';
        }
    });

    // Related cards HTML
    let relatedHTML = '';
    relatedProducts.forEach(rel => {
        relatedHTML += '<div class="product-card" onclick="window.location.href=\'/package/' + rel.id + '\'" style="cursor:pointer;">' +
            '<div class="card-img-wrapper">' +
                '<img src="' + rel.image + '" alt="' + rel.name + '" />' +
                '<span class="card-badge ' + rel.badgeColor + '">' + rel.badge + '</span>' +
                '<span class="resmon-pill">' + rel.resmon + '</span>' +
            '</div>' +
            '<div class="card-content">' +
                '<div class="card-category">' + rel.categoryName + '</div>' +
                '<h3 class="card-name">' + rel.name + '</h3>' +
                '<div class="card-meta">' +
                    '<div><span class="card-price">$' + Number(rel.price).toFixed(2) + '</span> <span class="card-period">' + (rel.isSubscription ? '/ mo' : 'one-time') + '</span></div>' +
                    '<span class="framework-tag">' + rel.framework + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';
    });

    return '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'    <meta charset="UTF-8">' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'    <title>' + p.name + ' - Mirage Store</title>' +
'    <script src="https://js.tebex.io/tebex.min.js"></script>' +
'    <link rel="preconnect" href="https://fonts.googleapis.com">' +
'    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
'    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">' +
'    <style>' +
'        :root {' +
'            --brand: #0284c7;' +
'            --brand-hover: #0369a1;' +
'            --brand-light: #38bdf8;' +
'            --brand-glow: rgba(56, 189, 248, 0.28);' +
'            --dark-bg: #0c1222;' +
'            --dark-surface: #111a30;' +
'            --card-bg: rgba(21, 32, 57, 0.88);' +
'            --card-inner: rgba(13, 21, 38, 0.9);' +
'            --card-border: rgba(148, 163, 184, 0.16);' +
'            --card-border-glow: rgba(56, 189, 248, 0.35);' +
'            --text-main: #f8fafc;' +
'            --text-body: #e2e8f0;' +
'            --text-muted: #94a3b8;' +
'            --text-dim: #64748b;' +
'        }' +
'        * { margin: 0; padding: 0; box-sizing: border-box; }' +
'        body {' +
'            background-color: var(--dark-bg);' +
'            background-image: ' +
'                radial-gradient(ellipse at 50% 0%, rgba(30, 58, 138, 0.22) 0px, transparent 65%),' +
'                radial-gradient(ellipse at 100% 50%, rgba(2, 132, 199, 0.12) 0px, transparent 50%),' +
'                radial-gradient(ellipse at 0% 100%, rgba(56, 189, 248, 0.08) 0px, transparent 50%);' +
'            min-height: 100vh;' +
'            font-family: \'Plus Jakarta Sans\', system-ui, -apple-system, sans-serif;' +
'            font-size: 13.5px;' +
'            color: var(--text-body);' +
'            line-height: 1.55;' +
'        }' +
'        /* Custom Eye-Friendly Scrollbar */' +
'        .custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }' +
'        .custom-scroll::-webkit-scrollbar-track { background: rgba(12, 18, 34, 0.6); border-radius: 6px; }' +
'        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(56, 189, 248, 0.3); border-radius: 6px; }' +
'        .custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(56, 189, 248, 0.6); }' +
'        .custom-scroll { scrollbar-width: thin; scrollbar-color: rgba(56, 189, 248, 0.3) rgba(12, 18, 34, 0.6); }' +
'        .navbar { border-bottom: 1px solid var(--card-border); background: rgba(12, 18, 34, 0.94); backdrop-filter: blur(20px); position: sticky; top: 0; z-index: 50; }' +
'        .nav-container { max-width: 1240px; margin: 0 auto; padding: 0.75rem 1.25rem; display: flex; justify-content: space-between; align-items: center; gap: 1.25rem; }' +
'        .brand-logo { display: flex; align-items: center; gap: 0.75rem; text-decoration: none; color: #ffffff; }' +
'        .brand-logo-img { width: 38px; height: 38px; object-fit: contain; filter: drop-shadow(0 0 10px var(--brand-glow)); }' +
'        .brand-title { font-size: 1.15rem; font-weight: 800; letter-spacing: -0.02em; }' +
'        .brand-title span { color: var(--brand-light); }' +
'        .nav-links { display: flex; align-items: center; gap: 1.5rem; list-style: none; }' +
'        @media (max-width: 1040px) { .nav-links { display: none; } }' +
'        .nav-links a { text-decoration: none; color: var(--text-muted); font-size: 0.8rem; font-weight: 700; transition: color 0.2s; }' +
'        .nav-links a:hover { color: var(--brand-light); }' +
'        .nav-actions { display: flex; align-items: center; gap: 0.75rem; }' +
'        .cfx-user-container { position: relative; }' +
'        .cfx-login-btn { background: linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(56, 189, 248, 0.15)); border: 1px solid rgba(56, 189, 248, 0.35); color: #ffffff; font-size: 0.8rem; font-weight: 700; padding: 0.45rem 0.9rem; border-radius: 10px; display: flex; align-items: center; gap: 0.45rem; cursor: pointer; transition: all 0.2s; }' +
'        .cfx-login-btn:hover { background: var(--brand); box-shadow: 0 0 14px var(--brand-glow); }' +
'        .cfx-mini-logo { width: 18px; height: 18px; border-radius: 3px; object-fit: contain; }' +
'        .cfx-profile-dropdown { position: relative; }' +
'        .cfx-user-pill { display: flex; align-items: center; gap: 0.55rem; background: var(--card-inner); border: 1px solid rgba(56, 189, 248, 0.3); padding: 0.35rem 0.75rem; border-radius: 12px; cursor: pointer; }' +
'        .cfx-profile-dropdown:hover .cfx-user-pill { border-color: var(--brand-light); background: rgba(2, 132, 199, 0.22); }' +
'        .cfx-user-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--brand-light); }' +
'        .cfx-user-meta { display: flex; flex-direction: column; text-align: left; }' +
'        .cfx-username { font-size: 0.8rem; font-weight: 800; color: #fff; line-height: 1.1; }' +
'        .cfx-badge { font-size: 0.65rem; font-weight: 700; color: var(--brand-light); }' +
'        .cfx-chevron { color: var(--text-muted); transition: transform 0.2s; }' +
'        .cfx-profile-dropdown:hover .cfx-chevron { transform: rotate(180deg); }' +
'        .cfx-dropdown-menu { position: absolute; top: 100%; right: 0; width: 205px; background: rgba(12, 18, 34, 0.98); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 12px; padding: 0.4rem; box-shadow: 0 14px 30px rgba(0, 0, 0, 0.8); backdrop-filter: blur(20px); display: none; flex-direction: column; gap: 0.25rem; z-index: 100; margin-top: 6px; }' +
'        .cfx-dropdown-menu::before { content: \'\'; position: absolute; top: -10px; left: 0; right: 0; height: 10px; }' +
'        .cfx-profile-dropdown:hover .cfx-dropdown-menu, .cfx-dropdown-menu:hover { display: flex; }' +
'        .cfx-menu-item { display: flex; align-items: center; gap: 0.55rem; padding: 0.55rem 0.75rem; border-radius: 8px; font-size: 0.78rem; font-weight: 700; color: var(--text-main); text-decoration: none; border: none; background: transparent; cursor: pointer; width: 100%; transition: all 0.2s; }' +
'        .cfx-menu-item svg { flex-shrink: 0; color: var(--brand-light); }' +
'        .cfx-menu-item:hover { background: rgba(2, 132, 199, 0.18); color: var(--brand-light); }' +
'        .cfx-logout-btn { color: #f87171 !important; border-top: 1px solid rgba(255, 255, 255, 0.08); margin-top: 0.2rem; padding-top: 0.55rem; }' +
'        .cfx-logout-btn svg { color: #f87171 !important; }' +
'        .cfx-logout-btn:hover { background: rgba(239, 68, 68, 0.18) !important; color: #fca5a5 !important; }' +
'        .discord-btn { background: #5865F2; color: #ffffff; font-size: 0.8rem; font-weight: 700; text-decoration: none; padding: 0.45rem 0.85rem; border-radius: 10px; display: flex; align-items: center; gap: 0.35rem; }' +
'        .discord-btn:hover { background: #4752c4; }' +
'        a { color: inherit; text-decoration: none; }' +
'        .page-container { max-width: 1240px; margin: 0 auto; padding: 1.5rem 1.25rem 5rem; }' +
'        .breadcrumb-bar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }' +
'        .back-btn { display: inline-flex; align-items: center; gap: 0.45rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--card-border); color: #ffffff !important; font-size: 0.78rem; font-weight: 700; padding: 0.45rem 0.95rem; border-radius: 10px; text-decoration: none; transition: all 0.2s; }' +
'        .back-btn svg { color: var(--brand-light); transition: transform 0.2s; }' +
'        .back-btn:hover { background: rgba(2, 132, 199, 0.25); border-color: var(--brand-light); color: var(--brand-light) !important; transform: translateX(-3px); }' +
'        .breadcrumbs { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: var(--text-muted); }' +
'        .breadcrumbs a { color: var(--text-muted) !important; text-decoration: none; transition: color 0.2s; }' +
'        .breadcrumbs a:hover { color: var(--brand-light) !important; }' +
'        .breadcrumbs span { color: var(--text-dim); }' +
'        .breadcrumbs span.current { color: #ffffff; font-weight: 700; }' +
'        .product-layout { display: grid; grid-template-columns: 1.35fr 1fr; gap: 1.5rem; margin-bottom: 2rem; }' +
'        @media (max-width: 960px) { .product-layout { grid-template-columns: 1fr; } }' +
'        .media-showcase { display: flex; flex-direction: column; gap: 0.75rem; }' +
'        .slider-viewer-container { position: relative; width: 100%; padding-bottom: 56.25%; height: 0; background: #060a12; border-radius: 14px; border: 1px solid var(--card-border); overflow: hidden; box-shadow: 0 12px 35px rgba(0, 0, 0, 0.5); user-select: none; }' +
'        .slider-viewer-container:hover .slider-nav-btn { opacity: 1; transform: translateY(-50%) scale(1); }' +
'        .slider-viewer-container:hover .slider-top-badge { opacity: 1; }' +
'        .slider-content { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; cursor: zoom-in; }' +
'        .slider-content img { width: 100%; height: 100%; object-fit: cover; transition: opacity 0.25s ease-in-out, transform 0.3s ease; }' +
'        .slider-content img:hover { transform: scale(1.015); }' +
'        .slider-content iframe { width: 100%; height: 100%; border: none; }' +
'        /* Slider Navigation Arrows */' +
'        .slider-nav-btn { position: absolute; top: 50%; transform: translateY(-50%) scale(0.95); width: 42px; height: 42px; border-radius: 50%; background: rgba(12, 18, 34, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(56, 189, 248, 0.4); color: #ffffff; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); z-index: 10; box-shadow: 0 6px 20px rgba(0,0,0,0.6); }' +
'        .slider-nav-btn:hover { background: var(--brand); border-color: var(--brand-light); color: #fff; box-shadow: 0 0 16px var(--brand-glow); transform: translateY(-50%) scale(1.08); }' +
'        .slider-prev-btn { left: 12px; }' +
'        .slider-next-btn { right: 12px; }' +
'        /* Top Badges & Lightbox Button */' +
'        .slider-top-left { position: absolute; top: 12px; left: 12px; z-index: 10; display: flex; gap: 0.5rem; }' +
'        .slider-counter-pill { background: rgba(12, 18, 34, 0.85); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.12); padding: 0.3rem 0.65rem; border-radius: 20px; font-size: 0.72rem; font-weight: 800; color: #ffffff; display: flex; align-items: center; gap: 0.35rem; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }' +
'        .slider-counter-pill svg { color: var(--brand-light); }' +
'        .slider-top-right { position: absolute; top: 12px; right: 12px; z-index: 10; display: flex; gap: 0.5rem; }' +
'        .slider-zoom-btn { background: rgba(12, 18, 34, 0.85); backdrop-filter: blur(10px); border: 1px solid rgba(56, 189, 248, 0.35); padding: 0.35rem 0.7rem; border-radius: 20px; font-size: 0.72rem; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 0.35rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }' +
'        .slider-zoom-btn:hover { background: var(--brand); box-shadow: 0 0 12px var(--brand-glow); }' +
'        /* Thumbnail Slider Bar */' +
'        .thumb-carousel-wrapper { position: relative; display: flex; align-items: center; gap: 0.4rem; }' +
'        .thumb-scroll-btn { width: 28px; height: 46px; border-radius: 6px; background: rgba(13, 21, 38, 0.9); border: 1px solid var(--card-border); color: var(--text-muted); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; flex-shrink: 0; }' +
'        .thumb-scroll-btn:hover { background: var(--brand); color: #fff; border-color: var(--brand-light); }' +
'        .thumbs-row { display: flex; gap: 0.5rem; overflow-x: auto; padding: 0.2rem 0; scroll-behavior: smooth; flex-grow: 1; }' +
'        .p-thumb { flex-shrink: 0; width: 74px; height: 46px; border-radius: 8px; overflow: hidden; border: 2px solid transparent; cursor: pointer; background: #070b14; transition: all 0.2s; position: relative; }' +
'        .p-thumb img { width: 100%; height: 100%; object-fit: cover; }' +
'        .p-thumb:hover { border-color: rgba(56, 189, 248, 0.6); transform: translateY(-2px); }' +
'        .p-thumb.active { border-color: var(--brand-light); box-shadow: 0 0 12px var(--brand-glow); transform: scale(1.03); }' +
'        .p-thumb-video { display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, #111a30, #0369a1); color: #ffffff; font-size: 0.65rem; font-weight: 800; gap: 0.15rem; }' +
'        .thumb-idx { position: absolute; bottom: 2px; right: 4px; font-size: 0.6rem; font-weight: 800; color: #fff; background: rgba(0,0,0,0.65); padding: 0.05rem 0.25rem; border-radius: 3px; }' +
'        /* Fullscreen Lightbox Modal */' +
'        .lightbox-modal { position: fixed; inset: 0; background: rgba(4, 7, 14, 0.95); backdrop-filter: blur(24px); z-index: 9999; display: none; align-items: center; justify-content: center; }' +
'        .lightbox-modal.active { display: flex; }' +
'        .lightbox-img-wrapper { position: relative; max-width: 90vw; max-height: 85vh; display: flex; align-items: center; justify-content: center; }' +
'        .lightbox-img-wrapper img { max-width: 100%; max-height: 85vh; border-radius: 12px; border: 1px solid rgba(56, 189, 248, 0.3); box-shadow: 0 20px 60px rgba(0,0,0,0.8); }' +
'        .lightbox-close-btn { position: absolute; top: 20px; right: 24px; width: 44px; height: 44px; border-radius: 50%; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: #fff; font-size: 1.25rem; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }' +
'        .lightbox-close-btn:hover { background: #ef4444; border-color: #ef4444; }' +
'        .lightbox-nav-btn { position: absolute; top: 50%; transform: translateY(-50%); width: 48px; height: 48px; border-radius: 50%; background: rgba(12, 18, 34, 0.85); border: 1px solid rgba(56, 189, 248, 0.4); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }' +
'        .lightbox-nav-btn:hover { background: var(--brand); }' +
'        .lightbox-prev { left: 24px; }' +
'        .lightbox-next { right: 24px; }' +
'        .lightbox-counter { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(12, 18, 34, 0.85); border: 1px solid rgba(255,255,255,0.15); padding: 0.4rem 1rem; border-radius: 20px; font-size: 0.8rem; font-weight: 800; color: #fff; }' +
'        /* Modern Compact Info Card */' +
'        .info-box { background: rgba(18, 28, 49, 0.94); border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 14px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35); }' +
'        .top-tags { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }' +
'        .badge-pill { padding: 0.2rem 0.55rem; border-radius: 6px; font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }' +
'        .badge-pill.accent { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); }' +
'        .badge-pill.brand { background: rgba(2, 132, 199, 0.15); color: #38bdf8; border: 1px solid rgba(2, 132, 199, 0.4); }' +
'        .badge-pill.purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); }' +
'        .badge-pill.orange { background: rgba(249, 115, 22, 0.15); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.4); }' +
'        .escrow-pill { display: flex; align-items: center; gap: 0.3rem; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.3); color: #4ade80; font-size: 0.62rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 6px; }' +
'        .product-title { font-size: 1.18rem; font-weight: 800; letter-spacing: -0.015em; color: #ffffff; line-height: 1.25; }' +
'        .meta-chips { display: flex; gap: 0.45rem; flex-wrap: wrap; }' +
'        .chip { background: rgba(10, 16, 30, 0.85); border: 1px solid rgba(148, 163, 184, 0.14); padding: 0.22rem 0.55rem; border-radius: 6px; font-size: 0.68rem; font-weight: 700; color: #94a3b8; display: flex; align-items: center; gap: 0.3rem; }' +
'        .chip span { color: #f1f5f9; }' +
'        .product-short-desc { color: #94a3b8; font-size: 0.76rem; line-height: 1.45; }' +
'        .price-box { background: rgba(10, 16, 30, 0.85); border: 1px solid rgba(56, 189, 248, 0.22); border-radius: 10px; padding: 0.7rem 0.95rem; display: flex; justify-content: space-between; align-items: center; }' +
'        .price-val { font-size: 1.18rem; font-weight: 800; color: #ffffff; }' +
'        .price-period { font-size: 0.68rem; color: #94a3b8; margin-left: 0.2rem; }' +
'        .price-stock { font-size: 0.68rem; color: #4ade80; font-weight: 700; display: flex; align-items: center; gap: 0.25rem; }' +
'        .btn-buy-lg { width: 100%; background: linear-gradient(135deg, var(--brand), var(--brand-hover)); color: #ffffff; border: none; padding: 0.7rem 1.25rem; border-radius: 10px; font-size: 0.8rem; font-weight: 800; letter-spacing: 0.02em; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; box-shadow: 0 4px 16px var(--brand-glow); transition: all 0.2s; }' +
'        .btn-buy-lg:hover { background: linear-gradient(135deg, var(--brand-light), var(--brand)); box-shadow: 0 6px 20px rgba(56, 189, 248, 0.45); transform: translateY(-1px); }' +
'        .btn-buy-lg:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }' +
'        .trust-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem; padding-top: 0.55rem; border-top: 1px solid rgba(148, 163, 184, 0.12); }' +
'        .trust-item { display: flex; align-items: center; gap: 0.35rem; font-size: 0.68rem; font-weight: 700; color: #94a3b8; }' +
'        .trust-item svg { color: var(--brand-light); flex-shrink: 0; }' +
'        .desc-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 16px; overflow: hidden; margin-bottom: 2.5rem; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35); }' +
'        .desc-card-header { background: rgba(13, 21, 38, 0.9); padding: 0.85rem 1.35rem; border-bottom: 1px solid var(--card-border); display: flex; align-items: center; justify-content: space-between; }' +
'        .desc-card-title { display: flex; align-items: center; gap: 0.5rem; font-size: 0.92rem; font-weight: 800; color: #ffffff; }' +
'        .desc-card-title svg { color: var(--brand-light); }' +
'        .desc-card-body { padding: 1.5rem; font-size: 0.85rem; color: var(--text-body); line-height: 1.7; max-height: 480px; overflow-y: auto; }' +
'        .desc-card-body p { margin-bottom: 0.85rem; color: var(--text-body); }' +
'        .desc-card-body ul, .desc-card-body ol { margin-left: 1.5rem; margin-bottom: 0.85rem; }' +
'        .desc-card-body li { margin-bottom: 0.35rem; color: var(--text-body); }' +
'        .section-header { margin-bottom: 1.25rem; font-size: 1.15rem; font-weight: 800; color: #ffffff; letter-spacing: -0.01em; }' +
'        .related-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem; }' +
'        .product-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 14px; overflow: hidden; transition: all 0.25s ease; display: flex; flex-direction: column; }' +
'        .product-card:hover { border-color: var(--brand-light); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); transform: translateY(-3px); }' +
'        .card-img-wrapper { position: relative; height: 160px; overflow: hidden; }' +
'        .card-img-wrapper img { width: 100%; height: 100%; object-fit: cover; }' +
'        .card-badge { position: absolute; top: 0.75rem; left: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 6px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; }' +
'        .resmon-pill { position: absolute; top: 0.75rem; right: 0.75rem; background: rgba(0, 0, 0, 0.75); border: 1px solid rgba(255, 255, 255, 0.15); padding: 0.25rem 0.55rem; border-radius: 6px; font-size: 0.65rem; font-weight: 700; color: var(--brand-light); backdrop-filter: blur(8px); }' +
'        .card-content { padding: 1.15rem; display: flex; flex-direction: column; flex-grow: 1; }' +
'        .card-category { font-size: 0.68rem; font-weight: 800; color: var(--brand-light); text-transform: uppercase; margin-bottom: 0.25rem; }' +
'        .card-name { font-size: 0.95rem; font-weight: 800; color: #fff; margin-bottom: 0.75rem; }' +
'        .card-meta { display: flex; justify-content: space-between; align-items: center; }' +
'        .card-price { font-size: 1.05rem; font-weight: 800; color: #fff; }' +
'        .card-period { font-size: 0.7rem; color: var(--text-muted); }' +
'        .framework-tag { background: rgba(255, 255, 255, 0.05); border: 1px solid var(--card-border); padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.68rem; font-weight: 700; color: var(--text-muted); }' +
'        /* Embedded In-Page Payment Modal */' +
'        .checkout-modal { position: fixed; inset: 0; background: rgba(4, 7, 14, 0.88); backdrop-filter: blur(20px); z-index: 10000; display: none; align-items: center; justify-content: center; padding: 1rem; }' +
'        .checkout-modal.active { display: flex; }' +
'        .checkout-modal-content { width: 100%; max-width: 680px; height: 90vh; max-height: 820px; background: #0d1527; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9), 0 0 35px var(--brand-glow); animation: modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }' +
'        @keyframes modalFadeIn { from { opacity: 0; transform: scale(0.96) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }' +
'        .checkout-modal-header { background: rgba(13, 21, 38, 0.98); padding: 0.85rem 1.25rem; border-bottom: 1px solid var(--card-border); display: flex; justify-content: space-between; align-items: center; }' +
'        .checkout-modal-title { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; font-weight: 800; color: #ffffff; }' +
'        .checkout-modal-title svg { color: var(--brand-light); }' +
'        .checkout-close-btn { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #ffffff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.95rem; transition: all 0.2s; }' +
'        .checkout-close-btn:hover { background: #ef4444; border-color: #ef4444; }' +
'        .checkout-frame-wrapper { flex-grow: 1; width: 100%; background: #080d1a; position: relative; }' +
'        .checkout-frame-wrapper iframe { width: 100%; height: 100%; border: none; }' +
'        .footer { border-top: 1px solid var(--card-border); padding: 3rem 1.25rem 2rem; background: #080d1a; text-align: center; color: var(--text-dim); font-size: 0.78rem; }' +
'    </style>' +
'</head>' +
'<body>' +
'    <header class="navbar">' +
'        <div class="nav-container">' +
'            <a href="/" class="brand-logo">' +
'                <img src="/public/images/logo.png" alt="Mirage Logo" class="brand-logo-img" />' +
'                <div class="brand-title">MIRAGE <span>STORE</span></div>' +
'            </a>' +
'            <ul class="nav-links">' +
'                <li><a href="/#products">HOME</a></li>' +
'                <li><a href="/#products">SCRIPTS</a></li>' +
'                <li><a href="/#products">VEHICLES</a></li>' +
'                <li><a href="/#products">MLOS</a></li>' +
'                <li><a href="/#reviews">REVIEWS</a></li>' +
'            </ul>' +
'            <div class="nav-actions">' +
'                <div id="cfxUserContainer" class="cfx-user-container">' +
'                    <button id="cfxLoginBtn" class="cfx-login-btn" onclick="loginWithCfx()">' +
'                        <img src="https://forum.cfx.re/uploads/default/original/4X/3/0/0/30064d12c8ff4978be77bb326e57973eeaa89bf0.png" alt="CFX" class="cfx-mini-logo" onerror="this.src=\'/public/images/logo.png\'" />' +
'                        <span>Sign In with Cfx.re</span>' +
'                    </button>' +
'                    <div id="cfxProfileDropdown" class="cfx-profile-dropdown" style="display: none;">' +
'                        <div class="cfx-user-pill">' +
'                            <img id="cfxUserAvatar" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100" alt="CFX Avatar" class="cfx-user-avatar" />' +
'                            <div class="cfx-user-meta">' +
'                                <span id="cfxUserName" class="cfx-username">FiveM User</span>' +
'                                <span class="cfx-badge">Keymaster Active</span>' +
'                            </div>' +
'                            <svg class="cfx-chevron" width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>' +
'                        </div>' +
'                        <div class="cfx-dropdown-menu">' +
'                            <a href="https://keymaster.fivem.net" target="_blank" class="cfx-menu-item">' +
'                                <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd"/></svg>' +
'                                <span>My Keymaster Assets</span>' +
'                            </a>' +
'                            <button class="cfx-menu-item cfx-logout-btn" onclick="logoutCfx()">' +
'                                <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"/></svg>' +
'                                <span>Log Out</span>' +
'                            </button>' +
'                        </div>' +
'                    </div>' +
'                </div>' +
'                <a id="discordLink" href="https://discord.gg/fivem" target="_blank" class="discord-btn">' +
'                    <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>' +
'                    <span>Discord</span>' +
'                </a>' +
'            </div>' +
'        </div>' +
'    </header>' +
'    <div class="page-container">' +
'        <div class="breadcrumb-bar">' +
'            <a href="/#products" class="back-btn">' +
'                <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>' +
'                <span>Back to Catalog</span>' +
'            </a>' +
'            <div class="breadcrumbs">' +
'                <a href="/">Home</a>' +
'                <span>/</span>' +
'                <a href="/#products">' + p.categoryName + '</a>' +
'                <span>/</span>' +
'                <span class="current">' + p.name + '</span>' +
'            </div>' +
'        </div>' +
'        <div class="product-layout">' +
'            <!-- ================= LEFT: PROFESSIONAL PHOTO SLIDER ================= -->' +
'            <div class="media-showcase">' +
'                <div class="slider-viewer-container" id="sliderViewerContainer">' +
'                    <div class="slider-top-left">' +
'                        <div class="slider-counter-pill">' +
'                            <svg width="13" height="13" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/></svg>' +
'                            <span id="slideCounterText">1 / ' + sliderMediaItems.length + '</span>' +
'                        </div>' +
'                    </div>' +
'                    <div class="slider-top-right">' +
'                        <button class="slider-zoom-btn" onclick="openLightbox()">' +
'                            <svg width="13" height="13" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l3.293 3.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 11-2 0V6.414l-3.293 3.293a1 1 0 11-1.414-1.414L13.586 5H12a1 1 0 01-1-1zM5 12a1 1 0 011 1v1.586l3.293-3.293a1 1 0 011.414 1.414L7.414 16H9a1 1 0 110 2H5a1 1 0 01-1-1v-4a1 1 0 011-1zm10 0a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-3.293-3.293a1 1 0 011.414-1.414L15 14.586V13a1 1 0 011-1z" clip-rule="evenodd"/></svg>' +
'                            <span>Expand</span>' +
'                        </button>' +
'                    </div>' +
'                    <div class="slider-content" id="mainViewer" onclick="handleMainViewerClick()">' +
'                        <img id="mainImg" src="' + sliderMediaItems[0].url + '" alt="' + p.name + '" />' +
'                    </div>' +
'                    <button class="slider-nav-btn slider-prev-btn" onclick="sliderPrev(event)" aria-label="Previous photo">' +
'                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' +
'                    </button>' +
'                    <button class="slider-nav-btn slider-next-btn" onclick="sliderNext(event)" aria-label="Next photo">' +
'                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>' +
'                    </button>' +
'                </div>' +
'                <div class="thumb-carousel-wrapper">' +
'                    <button class="thumb-scroll-btn" onclick="scrollThumbs(-150)" aria-label="Scroll thumbnails left">' +
'                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' +
'                    </button>' +
'                    <div class="thumbs-row custom-scroll" id="thumbsStrip">' + thumbsHTML + '</div>' +
'                    <button class="thumb-scroll-btn" onclick="scrollThumbs(150)" aria-label="Scroll thumbnails right">' +
'                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>' +
'                    </button>' +
'                </div>' +
'            </div>' +
'            <!-- ================= RIGHT: INFO & ACTION CARD ================= -->' +
'            <div class="info-box">' +
'                <div class="top-tags">' +
'                    <span class="badge-pill ' + p.badgeColor + '">' + p.badge + '</span>' +
'                    <span class="escrow-pill">' +
'                        <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>' +
'                        <span>CFX.re Escrow Certified</span>' +
'                    </span>' +
'                </div>' +
'                <h1 class="product-title">' + p.name + '</h1>' +
'                <div class="meta-chips">' +
'                    <div class="chip">' +
'                        <svg width="11" height="11" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/></svg>' +
'                        <span>' + p.resmon + ' Resmon</span>' +
'                    </div>' +
'                    <div class="chip">' +
'                        <svg width="11" height="11" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clip-rule="evenodd"/></svg>' +
'                        <span>' + p.framework + '</span>' +
'                    </div>' +
'                </div>' +
'                <p class="product-short-desc">' + p.shortDesc + '</p>' +
'                <div class="price-box">' +
'                    <div>' +
'                        <span class="price-val">' + priceFormatted + '</span>' +
'                        <span class="price-period">' + pricePeriod + '</span>' +
'                    </div>' +
'                    <div class="price-stock">✓ In Stock & Instant Keymaster</div>' +
'                </div>' +
'                <button class="btn-buy-lg" id="buyBtn" onclick="initiateBuy(' + p.id + ')">' +
'                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd"/></svg>' +
'                    <span id="buyBtnText">Buy with CFX.re Keymaster</span>' +
'                </button>' +
'                <div class="trust-grid">' +
'                    <div class="trust-item"><svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg><span>CFX Escrow Safe</span></div>' +
'                    <div class="trust-item"><svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/></svg><span>Instant Delivery</span></div>' +
'                    <div class="trust-item"><svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg><span>Full Support</span></div>' +
'                    <div class="trust-item"><svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/></svg><span>24/7 Discord Help</span></div>' +
'                </div>' +
'            </div>' +
'        </div>' +
'        <!-- ================= PRODUCT DESCRIPTION SECTION ================= -->' +
'        <div class="desc-card">' +
'            <div class="desc-card-header">' +
'                <div class="desc-card-title">' +
'                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg>' +
'                    <span>Product Description & Features</span>' +
'                </div>' +
'            </div>' +
'            <div class="desc-card-body custom-scroll">' +
'                ' + p.fullDesc + '' +
'            </div>' +
'        </div>' +
'        <h2 class="section-header">You May Also Like</h2>' +
'        <div class="related-grid">' + relatedHTML + '</div>' +
'    </div>' +
'    <!-- ================= FULLSCREEN LIGHTBOX MODAL ================= -->' +
'    <div id="lightboxModal" class="lightbox-modal" onclick="handleLightboxBackdropClick(event)">' +
'        <button class="lightbox-close-btn" onclick="closeLightbox()" aria-label="Close Lightbox">✕</button>' +
'        <button class="lightbox-nav-btn lightbox-prev" onclick="sliderPrev(event)" aria-label="Previous image">‹</button>' +
'        <div class="lightbox-img-wrapper">' +
'            <img id="lightboxImg" src="' + sliderMediaItems[0].url + '" alt="Full size preview" />' +
'        </div>' +
'        <button class="lightbox-nav-btn lightbox-next" onclick="sliderNext(event)" aria-label="Next image">›</button>' +
'        <div class="lightbox-counter" id="lightboxCounter">1 / ' + sliderMediaItems.length + '</div>' +
'    </div>' +
'    <!-- ================= IN-PAGE EMBEDDED CHECKOUT MODAL ================= -->' +
'    <div id="checkoutModal" class="checkout-modal" onclick="handleCheckoutBackdropClick(event)">' +
'        <div class="checkout-modal-content">' +
'            <div class="checkout-modal-header">' +
'                <div class="checkout-modal-title">' +
'                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>' +
'                    <span>Mirage Store • Secure Checkout</span>' +
'                </div>' +
'                <button class="checkout-close-btn" onclick="closeCheckoutModal()" aria-label="Close Checkout">✕</button>' +
'            </div>' +
'            <div class="checkout-frame-wrapper">' +
'                <iframe id="checkoutIframe" src="" frameborder="0" allow="payment"></iframe>' +
'            </div>' +
'        </div>' +
'    </div>' +
'    <footer class="footer"><p>© 2026 Mirage Store Enterprise. All rights reserved. Not affiliated with Rockstar Games or Take-Two Interactive.</p></footer>' +
'    <script>' +
'        var sliderItems = ' + JSON.stringify(sliderMediaItems) + ';' +
'        var currentSlideIdx = 0;' +
'        function launchPaymentModal(checkoutUrl, ident) {' +
'            if (typeof Tebex !== "undefined" && Tebex.checkout) {' +
'                try {' +
'                    if (ident) {' +
'                        Tebex.checkout.init({ ident: ident, theme: "dark" });' +
'                    }' +
'                    Tebex.checkout.launch();' +
'                    return;' +
'                } catch (e) {' +
'                    console.warn("Tebex SDK modal fallback to in-page frame:", e);' +
'                }' +
'            }' +
'            var modal = document.getElementById("checkoutModal");' +
'            var iframe = document.getElementById("checkoutIframe");' +
'            if (modal && iframe && checkoutUrl) {' +
'                iframe.src = checkoutUrl;' +
'                modal.classList.add("active");' +
'            } else if (checkoutUrl) {' +
'                window.location.href = checkoutUrl;' +
'            }' +
'        }' +
'        function closeCheckoutModal() {' +
'            var modal = document.getElementById("checkoutModal");' +
'            var iframe = document.getElementById("checkoutIframe");' +
'            if (iframe) iframe.src = "";' +
'            if (modal) modal.classList.remove("active");' +
'        }' +
'        function handleCheckoutBackdropClick(e) {' +
'            if (e.target && e.target.id === "checkoutModal") {' +
'                closeCheckoutModal();' +
'            }' +
'        }' +
'        function updateSliderView() {' +
'            var item = sliderItems[currentSlideIdx];' +
'            var viewer = document.getElementById("mainViewer");' +
'            var counterText = document.getElementById("slideCounterText");' +
'            var lightboxImg = document.getElementById("lightboxImg");' +
'            var lightboxCounter = document.getElementById("lightboxCounter");' +
'            if (counterText) counterText.innerText = (currentSlideIdx + 1) + " / " + sliderItems.length;' +
'            if (lightboxCounter) lightboxCounter.innerText = (currentSlideIdx + 1) + " / " + sliderItems.length;' +
'            if (item.type === "video") {' +
'                var id = "M7lc1UVf-VE";' +
'                if (item.url.indexOf("v=") !== -1) id = item.url.split("v=")[1].split("&")[0];' +
'                else if (item.url.indexOf("youtu.be/") !== -1) id = item.url.split("youtu.be/")[1].split("?")[0];' +
'                else if (item.url.indexOf("/embed/") !== -1) id = item.url.split("/embed/")[1].split("?")[0];' +
'                if (viewer) viewer.innerHTML = "<iframe width=\'100%\' height=\'100%\' src=\'https://www.youtube.com/embed/" + id + "?autoplay=1&enablejsapi=1&rel=0\' frameborder=\'0\' allow=\'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share\' referrerpolicy=\'strict-origin-when-cross-origin\' allowfullscreen></iframe>";' +
'            } else {' +
'                if (viewer) viewer.innerHTML = "<img id=\'mainImg\' src=\'" + item.url + "\' alt=\'Showcase Screenshot\' />";' +
'                if (lightboxImg) lightboxImg.src = item.url;' +
'            }' +
'            document.querySelectorAll(".p-thumb").forEach(function(el, i) {' +
'                if (i === currentSlideIdx) {' +
'                    el.classList.add("active");' +
'                    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });' +
'                } else {' +
'                    el.classList.remove("active");' +
'                }' +
'            });' +
'        }' +
'        function goToSlide(idx) {' +
'            if (idx >= 0 && idx < sliderItems.length) {' +
'                currentSlideIdx = idx;' +
'                updateSliderView();' +
'            }' +
'        }' +
'        function sliderNext(e) {' +
'            if (e) e.stopPropagation();' +
'            currentSlideIdx = (currentSlideIdx + 1) % sliderItems.length;' +
'            updateSliderView();' +
'        }' +
'        function sliderPrev(e) {' +
'            if (e) e.stopPropagation();' +
'            currentSlideIdx = (currentSlideIdx - 1 + sliderItems.length) % sliderItems.length;' +
'            updateSliderView();' +
'        }' +
'        function scrollThumbs(amt) {' +
'            var strip = document.getElementById("thumbsStrip");' +
'            if (strip) strip.scrollBy({ left: amt, behavior: "smooth" });' +
'        }' +
'        function handleMainViewerClick() {' +
'            if (sliderItems[currentSlideIdx].type === "image") {' +
'                openLightbox();' +
'            }' +
'        }' +
'        function openLightbox() {' +
'            if (sliderItems[currentSlideIdx].type === "image") {' +
'                var modal = document.getElementById("lightboxModal");' +
'                if (modal) modal.classList.add("active");' +
'            }' +
'        }' +
'        function closeLightbox() {' +
'            var modal = document.getElementById("lightboxModal");' +
'            if (modal) modal.classList.remove("active");' +
'        }' +
'        function handleLightboxBackdropClick(e) {' +
'            if (e.target && e.target.id === "lightboxModal") {' +
'                closeLightbox();' +
'            }' +
'        }' +
'        window.addEventListener("keydown", function(e) {' +
'            if (e.key === "ArrowLeft") sliderPrev();' +
'            else if (e.key === "ArrowRight") sliderNext();' +
'            else if (e.key === "Escape") {' +
'                closeLightbox();' +
'                closeCheckoutModal();' +
'            }' +
'        });' +
'        /* Touch swipe detection for mobile */' +
'        var touchStartX = 0;' +
'        var sliderEl = document.getElementById("sliderViewerContainer");' +
'        if (sliderEl) {' +
'            sliderEl.addEventListener("touchstart", function(e) { touchStartX = e.changedTouches[0].screenX; }, {passive: true});' +
'            sliderEl.addEventListener("touchend", function(e) { var touchEndX = e.changedTouches[0].screenX; if (touchEndX < touchStartX - 40) sliderNext(); if (touchEndX > touchStartX + 40) sliderPrev(); }, {passive: true});' +
'        }' +
'        async function initiateBuy(packageId) {' +
'            var btn = document.getElementById("buyBtn");' +
'            var text = document.getElementById("buyBtnText");' +
'            if (btn) btn.disabled = true;' +
'            if (text) text.innerText = "Connecting...";' +
'            try {' +
'                var urlParams = new URLSearchParams(window.location.search);' +
'                var basketId = urlParams.get("basketId") || sessionStorage.getItem("tebex_basket_id");' +
'                var response = await fetch("/api/create-checkout", {' +
'                    method: "POST",' +
'                    headers: { "Content-Type": "application/json" },' +
'                    body: JSON.stringify({ ' +
'                        packageId: packageId, ' +
'                        basketId: basketId, ' +
'                        returnBaseUrl: window.location.origin, ' +
'                        returnPath: window.location.pathname' +
'                    })' +
'                });' +
'                var data = await response.json();' +
'                if (data.basketIdent) {' +
'                    sessionStorage.setItem("tebex_basket_id", data.basketIdent);' +
'                }' +
'                if (data.requiresAuth && data.authUrl) {' +
'                    if (text) text.innerText = "Connecting to CFX.re...";' +
'                    window.location.href = data.authUrl;' +
'                    return;' +
'                }' +
'                if (data.checkoutUrl || data.basketIdent) {' +
'                    if (text) text.innerText = "Opening Checkout...";' +
'                    launchPaymentModal(data.checkoutUrl, data.basketIdent);' +
'                    return;' +
'                }' +
'                if (data.error) {' +
'                    alert("Error: " + data.error);' +
'                }' +
'            } catch (err) {' +
'                alert("Connection error: " + err.message);' +
'            } finally {' +
'                if (btn) btn.disabled = false;' +
'                if (text) text.innerText = "Buy with CFX.re Keymaster";' +
'            }' +
'        }' +
'        async function initCfxUser() {' +
'            try {' +
'                var urlParams = new URLSearchParams(window.location.search);' +
'                var basketId = urlParams.get("basketId") || sessionStorage.getItem("tebex_basket_id");' +
'                var savedUser = null;' +
'                try { savedUser = JSON.parse(localStorage.getItem("cfx_user")); } catch (e) {}' +
'                if (basketId) {' +
'                    var res = await fetch("/api/user/profile?basketId=" + encodeURIComponent(basketId));' +
'                    var data = await res.json();' +
'                    if (data && data.loggedIn) {' +
'                        savedUser = data;' +
'                        localStorage.setItem("cfx_user", JSON.stringify(data));' +
'                    }' +
'                }' +
'                renderCfxUser(savedUser);' +
'                return savedUser;' +
'            } catch (err) {' +
'                console.warn("CFX User Init Error:", err);' +
'                return null;' +
'            }' +
'        }' +
'        function renderCfxUser(user) {' +
'            var loginBtn = document.getElementById("cfxLoginBtn");' +
'            var profileDropdown = document.getElementById("cfxProfileDropdown");' +
'            var userAvatar = document.getElementById("cfxUserAvatar");' +
'            var userName = document.getElementById("cfxUserName");' +
'            if (user && user.loggedIn) {' +
'                if (loginBtn) loginBtn.style.display = "none";' +
'                if (profileDropdown) profileDropdown.style.display = "block";' +
'                if (userName) userName.innerText = user.username;' +
'                if (userAvatar) {' +
'                    userAvatar.src = user.avatar || ("https://forum.cfx.re/user_avatar/forum.cfx.re/" + encodeURIComponent(user.username) + "/120/1.png");' +
'                    userAvatar.onerror = function() { this.src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100"; };' +
'                }' +
'            } else {' +
'                if (loginBtn) loginBtn.style.display = "flex";' +
'                if (profileDropdown) profileDropdown.style.display = "none";' +
'            }' +
'        }' +
'        async function loginWithCfx() {' +
'            var btn = document.getElementById("cfxLoginBtn");' +
'            if (btn) btn.innerHTML = "<span>Connecting to Cfx.re...</span>";' +
'            try {' +
'                var res = await fetch("/api/create-checkout", {' +
'                    method: "POST",' +
'                    headers: { "Content-Type": "application/json" },' +
'                    body: JSON.stringify({ ' +
'                        packageId: ' + p.id + ', ' +
'                        returnBaseUrl: window.location.origin,' +
'                        returnPath: window.location.pathname' +
'                    })' +
'                });' +
'                var data = await res.json();' +
'                if (data && data.authUrl) { window.location.href = data.authUrl; }' +
'                else if (data && data.checkoutUrl) { window.location.href = data.checkoutUrl; }' +
'            } catch (e) {' +
'                alert("Failed to connect to CFX login");' +
'                if (btn) btn.innerHTML = "<img src=\'https://forum.cfx.re/uploads/default/original/4X/3/0/0/30064d12c8ff4978be77bb326e57973eeaa89bf0.png\' class=\'cfx-mini-logo\' /> <span>Sign In with Cfx.re</span>";' +
'            }' +
'        }' +
'        function logoutCfx() {' +
'            localStorage.removeItem("cfx_user");' +
'            sessionStorage.removeItem("tebex_basket_id");' +
'            if (window.history.replaceState) { window.history.replaceState(null, null, window.location.pathname); }' +
'            renderCfxUser(null);' +
'            window.location.reload();' +
'        }' +
'        window.addEventListener("DOMContentLoaded", function() {' +
'            initCfxUser().then(function() {' +
'                var urlParams = new URLSearchParams(window.location.search);' +
'                if (urlParams.get("autoCheckout") === "1" && urlParams.get("basketId")) {' +
'                    if (window.history.replaceState) {' +
'                        var cleanUrl = window.location.pathname + "?basketId=" + encodeURIComponent(urlParams.get("basketId"));' +
'                        window.history.replaceState(null, null, cleanUrl);' +
'                    }' +
'                    initiateBuy(' + p.id + ');' +
'                }' +
'            });' +
'            var sEl = document.getElementById("sliderViewerContainer");' +
'            if (sEl) {' +
'                sEl.addEventListener("touchstart", function(e) { touchStartX = e.changedTouches[0].screenX; }, {passive: true});' +
'                sEl.addEventListener("touchend", function(e) { var touchEndX = e.changedTouches[0].screenX; if (touchEndX < touchStartX - 40) sliderNext(); if (touchEndX > touchStartX + 40) sliderPrev(); }, {passive: true});' +
'            }' +
'        });' +
'    </script>' +
'</body>' +
'</html>';
}

// ===================================================
// 9. ADVANCED ENTERPRISE API ROUTES
// ===================================================

app.get('/', (req, res) => {
    res.send(storefrontHTML);
});

app.get('/package/:id', async (req, res) => {
    const store = (!cachedStoreData || Date.now() - lastSyncTime > 5000) ? await syncTebexStore() : cachedStoreData;
    const pkg = (store?.products || []).find(p => String(p.id) === String(req.params.id) || p.slug === req.params.id);
    if (!pkg) {
        return res.redirect('/#products');
    }
    res.send(buildProductPageHTML(pkg, store.products || [], store.reviews || []));
});

app.get('/product/:id', (req, res) => {
    res.redirect('/package/' + req.params.id);
});

app.get('/admin', (req, res) => {
    res.send(adminHTML);
});

// Enterprise Server Health Check Probe (Standard for Docker/K8s/AWS)
app.get('/api/health', (req, res) => {
    const memory = process.memoryUsage();
    res.json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
        environment: NODE_ENV,
        active_sse_clients: sseClients.size,
        memory: {
            rss_mb: Math.round(memory.rss / 1024 / 1024),
            heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024)
        }
    });
});

// Real-Time Server-Sent Events (SSE) Live Feed Endpoint
app.get('/api/events/live-feed', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    sseClients.add(res);

    // Initial keep-alive ping
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', clients: sseClients.size })}\n\n`);

    req.on('close', () => {
        sseClients.delete(res);
    });
});

// JWT Admin Authentication Endpoint
app.post('/api/admin/login', (req, res) => {
    const { pin } = req.body;
    const config = loadStoreConfig();
    const expectedPin = config.adminPin || ADMIN_PIN;

    if (pin !== expectedPin) {
        return res.status(401).json({ error: 'Invalid PIN.' });
    }

    const token = jwt.sign(
        { role: 'admin', store: 'mirage-store', authorizedAt: Date.now() },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.cookie('mirage_admin_token', token, {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, token });
});

// Public Storefront Catalog (Real-Time Dynamic Sync)
app.get('/api/store', async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (!cachedStoreData || Date.now() - lastSyncTime > 2000 || req.query._t || req.query.fresh) {
        await syncTebexStore(Boolean(req.query.fresh));
    }
    res.json(cachedStoreData);
});

app.get('/api/sync-tebex', async (req, res) => {
    const data = await syncTebexStore(true);
    broadcastEvent('store_updated', { timestamp: Date.now() });
    res.json({ success: true, message: 'Storefront synchronized with Tebex in real-time', timestamp: Date.now(), productsCount: data.products?.length || 0 });
});

// Cryptographic Tebex Official Webhook Listener (HMAC-SHA256)
app.get('/api/webhooks/tebex', (req, res) => {
    res.json({ status: 'active', service: 'Mirage Store Tebex Webhook Listener' });
});

app.post('/api/webhooks/tebex', async (req, res) => {
    const signature = req.headers['x-tebex-signature'];
    
    const webhookKey = TEBEX_WEBHOOK_SECRET || TEBEX_PRIVATE_KEY;
    if (signature && webhookKey && req.rawBody) {
        const expectedSig = crypto
            .createHmac('sha256', webhookKey)
            .update(req.rawBody)
            .digest('hex');

        if (signature !== expectedSig) {
            console.warn('[Webhook] Invalid Tebex HMAC signature');
            return res.status(403).json({ error: 'Invalid HMAC signature' });
        }
    }

    const event = req.body;
    console.log('[Webhook Received]:', event?.type || 'payment.completed');

    // Handle Tebex endpoint verification/validation ping
    if (event?.type === 'validation' || !event || Object.keys(event).length === 0) {
        return res.json({ success: true, message: 'Webhook endpoint verified successfully' });
    }

    if (event && (event.type === 'payment.completed' || event.subject)) {
        const buyerName = event.subject?.customer?.username || event.player?.name || 'Verified Customer';
        const itemName = event.subject?.lines?.[0]?.package_name || '[Escrow] FiveM Package';
        const price = (event.subject?.price?.amount || 35.00) + ' ' + (event.subject?.price?.currency || 'USD');

        const newPayment = {
            id: 'tbx-' + Date.now(),
            buyer: buyerName,
            item: itemName,
            time: 'Just now',
            price: price,
            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'
        };

        const config = loadStoreConfig();
        if (!config.realPayments) config.realPayments = [];
        config.realPayments.unshift(newPayment);
        saveStoreConfig(config);
        cachedStoreData = null;

        // Broadcast to all active browsers in real-time
        broadcastEvent('payment_received', newPayment);

        // Send Discord notification
        sendDiscordNotification('New FiveM Asset Purchased! 🎉', `**Customer:** \`${buyerName}\`\n**Item:** **${itemName}**\n**Amount:** \`${price}\``, 0x22c55e);
    }

    res.json({ success: true });
});

// Review Submission
app.post('/api/reviews', (req, res) => {
    const { author, role, productName, rating, comment } = req.body;
    if (!author || !comment) {
        return res.status(400).json({ error: 'Author and comment required' });
    }

    const config = loadStoreConfig();
    if (!config.customReviews) config.customReviews = [];

    const newReview = {
        id: 'rev-' + Date.now(),
        author: String(author).trim().substring(0, 50),
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
        role: String(role || 'FiveM Server Administrator').trim().substring(0, 80),
        rating: Math.min(5, Math.max(1, Number(rating) || 5)),
        date: 'Just now',
        productName: String(productName || 'Notary System v2.0').trim().substring(0, 80),
        comment: String(comment).trim().substring(0, 500)
    };

    config.customReviews.unshift(newReview);
    saveStoreConfig(config);
    cachedStoreData = null;
    syncTebexStore();

    sendDiscordNotification('New Customer Review Submitted 🌟', `**Reviewer:** \`${newReview.author}\` (${newReview.role})\n**Product:** ${newReview.productName}\n**Rating:** ${'⭐'.repeat(newReview.rating)}\n**Feedback:** "${newReview.comment}"`);

    res.json({ success: true, review: newReview });
});

// Protected Admin Payment Broadcast (JWT Secured)
app.post('/api/payments', verifyAdminToken, (req, res) => {
    const { buyer, item, price } = req.body;
    const config = loadStoreConfig();

    if (!config.realPayments) config.realPayments = [];

    const newPayment = {
        id: 'tbx-' + Date.now(),
        buyer: String(buyer).trim().substring(0, 50),
        item: String(item).trim().substring(0, 80),
        time: 'Just now',
        price: String(price || '35.00 USD').trim().substring(0, 20),
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'
    };

    config.realPayments.unshift(newPayment);
    saveStoreConfig(config);
    cachedStoreData = null;
    syncTebexStore();

    // Broadcast instantly to all visitor browsers via SSE
    broadcastEvent('payment_received', newPayment);

    res.json({ success: true, payment: newPayment });
});

// Protected Admin Save (JWT Secured)
app.post('/api/admin/save', verifyAdminToken, (req, res) => {
    const { announcement, discordUrl, topSupporterName, packageId, meta } = req.body;
    const config = loadStoreConfig();

    if (announcement) config.announcement = String(announcement).trim().substring(0, 250);
    if (discordUrl) config.discordUrl = String(discordUrl).trim().substring(0, 200);
    if (topSupporterName) {
        config.topSupporter = {
            name: String(topSupporterName).trim().substring(0, 50),
            title: "Top Supporter of the Month",
            amount: "$240.00"
        };
    }

    if (packageId && meta) {
        if (!config.packages) config.packages = {};
        config.packages[String(packageId)] = {
            ...(config.packages[String(packageId)] || {}),
            ...meta
        };
    }

    saveStoreConfig(config);
    cachedStoreData = null;
    syncTebexStore();

    res.json({ success: true, message: 'Enterprise store settings saved successfully.' });
});

// Headless Checkout Creation Endpoint
app.post('/api/create-checkout', async (req, res) => {
    try {
        const { basketId, packageId, returnBaseUrl, returnPath } = req.body || {};
        const targetPackageId = packageId || NOTARY_PACKAGE_ID;
        let basketIdent = basketId;

        // Compute exact live host origin
        const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : req.protocol) || 'https';
        const host = req.headers['x-forwarded-host'] || req.get('host') || 'mirage-store-cnhn.onrender.com';
        let liveOrigin = returnBaseUrl;
        if (!liveOrigin || liveOrigin.includes('localhost')) {
            liveOrigin = (!host.includes('localhost')) ? `${protocol}://${host}` : (process.env.BASE_URL || `http://localhost:${PORT}`);
        }
        if (!liveOrigin.startsWith('http')) liveOrigin = `https://${liveOrigin}`;

        // Compute exact page return path (e.g. /package/7642742)
        let exactPath = returnPath || (targetPackageId ? `/package/${targetPackageId}` : '/');
        if (!exactPath.startsWith('/')) exactPath = `/${exactPath}`;

        async function fetchFreshBasket() {
            const basketReq = await fetch(`https://headless.tebex.io/api/accounts/${TEBEX_PUBLIC_TOKEN}/baskets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    complete_url: `${liveOrigin}${exactPath}`,
                    cancel_url: `${liveOrigin}${exactPath}`
                })
            });
            const basketData = await basketReq.json().catch(() => null);
            return basketData?.data?.ident || null;
        }

        if (!basketIdent) {
            basketIdent = await fetchFreshBasket();
            if (!basketIdent) {
                return res.status(400).json({ error: 'Failed to create Tebex basket' });
            }
        }

        let packageReq = await fetch(`https://headless.tebex.io/api/baskets/${basketIdent}/packages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                package_id: targetPackageId,
                quantity: 1
            })
        });
        let packageData = await packageReq.json().catch(() => null);

        // Check if user login is required
        if (packageReq.status === 422 && (packageData?.detail?.toLowerCase().includes('login') || packageData?.title?.toLowerCase().includes('payload') || packageData?.detail?.toLowerCase().includes('auth'))) {
            console.log(`[API] User login required for FiveM package. Fetching auth links for ${liveOrigin}${exactPath}...`);
            const encodedReturnUrl = encodeURIComponent(`${liveOrigin}${exactPath}?basketId=${basketIdent}&autoCheckout=1`);
            const authReq = await fetch(`https://headless.tebex.io/api/accounts/${TEBEX_PUBLIC_TOKEN}/baskets/${basketIdent}/auth?returnUrl=${encodedReturnUrl}`);
            const authData = await authReq.json().catch(() => []);
            const authUrl = authData?.[0]?.url;

            if (authUrl) {
                return res.json({
                    requiresAuth: true,
                    authUrl: authUrl,
                    basketIdent: basketIdent,
                    message: 'Authentication required with FiveM / Cfx.re'
                });
            }
        }

        // If package add failed because basket was cancelled/expired/broken, create a fresh basket and retry!
        if (!packageReq.ok && !(packageData?.detail?.toLowerCase().includes('already') || packageData?.detail?.toLowerCase().includes('again'))) {
            let checkInfo = await fetch(`https://headless.tebex.io/api/accounts/${TEBEX_PUBLIC_TOKEN}/baskets/${basketIdent}`).then(r => r.json()).catch(() => null);
            if (checkInfo?.data?.links?.checkout) {
                return res.json({
                    checkoutUrl: checkInfo.data.links.checkout,
                    basketIdent: basketIdent
                });
            }

            console.log(`[API] Auto-recovering: creating fresh basket for package ${targetPackageId}...`);
            const freshIdent = await fetchFreshBasket();
            if (freshIdent) {
                basketIdent = freshIdent;
                packageReq = await fetch(`https://headless.tebex.io/api/baskets/${basketIdent}/packages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        package_id: targetPackageId,
                        quantity: 1
                    })
                });
                packageData = await packageReq.json().catch(() => null);

                if (packageReq.status === 422 && (packageData?.detail?.toLowerCase().includes('login') || packageData?.title?.toLowerCase().includes('payload') || packageData?.detail?.toLowerCase().includes('auth'))) {
                    const encodedReturnUrl = encodeURIComponent(`${liveOrigin}${exactPath}?basketId=${basketIdent}&autoCheckout=1`);
                    const authReq = await fetch(`https://headless.tebex.io/api/accounts/${TEBEX_PUBLIC_TOKEN}/baskets/${basketIdent}/auth?returnUrl=${encodedReturnUrl}`);
                    const authData = await authReq.json().catch(() => []);
                    const authUrl = authData?.[0]?.url;
                    if (authUrl) {
                        return res.json({
                            requiresAuth: true,
                            authUrl: authUrl,
                            basketIdent: basketIdent,
                            message: 'Authentication required with FiveM / Cfx.re'
                        });
                    }
                }
            }
        }

        const basketInfoReq = await fetch(`https://headless.tebex.io/api/accounts/${TEBEX_PUBLIC_TOKEN}/baskets/${basketIdent}`).catch(() => null);
        const basketInfo = await basketInfoReq?.json().catch(() => null);
        const checkoutUrl = basketInfo?.data?.links?.checkout || `https://checkout.tebex.io/checkout/${basketIdent}`;

        res.json({
            checkoutUrl: checkoutUrl,
            basketIdent: basketIdent
        });

    } catch (error) {
        console.error('[API] Server Error:', error);
        res.status(500).json({ error: 'Internal Server Error: ' + error.message });
    }
});

// Authenticated CFX / FiveM User Profile Endpoint
app.get('/api/user/profile', async (req, res) => {
    try {
        const { basketId } = req.query;
        if (!basketId) return res.json({ loggedIn: false });

        const basketRes = await fetch(`https://headless.tebex.io/api/accounts/${TEBEX_PUBLIC_TOKEN}/baskets/${basketId}`);
        const data = await basketRes.json().catch(() => null);

        if (data && data.data) {
            const username = data.data.username || data.data.customer?.username || data.data.creator_code?.name;
            if (username) {
                const config = loadStoreConfig();
                if (!config.realPayments) config.realPayments = [];
                const alreadyExists = config.realPayments.some(p => p.id === ('tbx-' + basketId) || (p.buyer.toLowerCase() === username.toLowerCase() && p.time === 'Just now'));
                if (!alreadyExists && data.data.packages?.length > 0) {
                    const priceFormatted = (data.data.base_price !== undefined ? '$' + Number(data.data.base_price).toFixed(2) : '$0.00') + ' USD';
                    const newPay = {
                        id: 'tbx-' + basketId,
                        buyer: username,
                        item: data.data.packages[0].name || 'Notary System',
                        price: priceFormatted,
                        time: 'Just now',
                        avatar: `https://forum.cfx.re/user_avatar/forum.cfx.re/${encodeURIComponent(username)}/120/1.png`
                    };
                    config.realPayments.unshift(newPay);
                    saveStoreConfig(config);
                    cachedStoreData = null;
                    broadcastEvent('payment_received', newPay);
                }

                return res.json({
                    loggedIn: true,
                    username: username,
                    avatar: `https://forum.cfx.re/user_avatar/forum.cfx.re/${encodeURIComponent(username)}/120/1.png`,
                    basketId: basketId
                });
            }
        }
        res.json({ loggedIn: false });
    } catch (e) {
        res.json({ loggedIn: false });
    }
});

// ===================================================
// 10. Process Management & Graceful Termination
// ===================================================
const server = app.listen(PORT, () => {
    console.log(`🛡️  MIRAGE STORE ENTERPRISE [${NODE_ENV.toUpperCase()}] running on port ${PORT}`);
    console.log(`📡  Live SSE Stream: ${BASE_URL}/api/events/live-feed`);
    console.log(`🏥  Health Probes: ${BASE_URL}/api/health`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: draining connections and closing HTTP server');
    server.close(() => {
        console.log('Server closed gracefully');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        process.exit(0);
    });
});
