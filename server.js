// server.js (修复价格解析 Bug 版)
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const { getAmericasGames } = require('./americas');
const { getEuropeGames } = require('./europe');
const { getJapanGames } = require('./asia');

const app = express();
const PORT = 3000;

app.use(cors());

// --- 价格解析工具 (核心修复) ---
// 能够处理 "$59.99", "£49.99", "5,980円" 等各种格式
function parseAmount(amountStr) {
    if (!amountStr) return null;
    // 1. 移除所有非数字、非小数点、非负号的字符
    // 注意：有些欧洲国家用逗号做小数点(如 12,99)，这里做简化处理：
    // 如果包含逗号，且没有点，把逗号变点；如果有逗号有点，去掉逗号
    let cleanStr = amountStr.replace(/[^0-9.,-]/g, ''); 
    
    // 简单处理：直接去掉逗号 (适合美/日/英格式: 1,299.00 -> 1299.00)
    // 这种处理对 "12,99 €" (欧式) 可能会有问题，但在任天堂 API 中
    // 我们可以优先使用 raw_value 字段，如果没有再用此逻辑兜底
    cleanStr = cleanStr.replace(/,/g, '');
    
    const val = parseFloat(cleanStr);
    return isNaN(val) ? null : val;
}

// --- 查价格 API ---
async function getPrices(countryCode, nsuids) {
    if (!nsuids || nsuids.length === 0) return [];
    // 过滤空 ID
    const validIds = nsuids.filter(id => id).slice(0, 50);
    if (validIds.length === 0) return [];

    try {
        const response = await axios.get('https://api.ec.nintendo.com/v1/price', {
            params: { country: countryCode, lang: 'en', ids: validIds.join(',') }
        });
        return response.data.prices;
    } catch (error) {
        console.error(`查价失败 ${countryCode}:`, error.message);
        return [];
    }
}

// --- 合并价格数据 ---
function mergePriceData(game, priceObj) {
    // 默认结构
    let result = { 
        currency: null, 
        original_price: null, 
        final_price: null, 
        discount_off: 0, 
        is_sale: false 
    };

    if (!priceObj || !priceObj.regular_price) {
        return result;
    }

    const regular = priceObj.regular_price;
    const discount = priceObj.discount_price;

    result.currency = regular.currency;

    // 优先尝试使用 API 提供的 raw_value (如果有)，否则手动解析 amount
    // raw_value 通常是纯数字字符串 "59.99"
    const regRaw = regular.raw_value || regular.amount;
    result.original_price = parseAmount(regRaw);
    result.final_price = result.original_price;

    if (discount) {
        const disRaw = discount.raw_value || discount.amount;
        result.final_price = parseAmount(disRaw);
        result.is_sale = true;
        
        // 计算折扣率
        if (result.original_price > 0 && result.final_price !== null) {
            result.discount_off = Math.round(((result.original_price - result.final_price) / result.original_price) * 100);
        }
    }

    return result;
}

// ================= API 路由 =================

// 1. 美洲区 (支持搜索 ?q=Mario)
app.get('/api/americas', async (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit) || 20;
        // 如果想支持搜索，你需要修改 getAmericasGames 接收 query 参数，这里暂且默认
        const games = await getAmericasGames(query, limit);
        const ids = games.map(g => g.nsuid);

        const [pUS, pMX, pBR, pAR] = await Promise.all([
            getPrices('US', ids), getPrices('MX', ids), getPrices('BR', ids), getPrices('AR', ids)
        ]);

        const results = games.map(g => ({
            ...g,
            prices: {
                US: mergePriceData(g, pUS.find(p => p.title_id == g.nsuid)),
                MX: mergePriceData(g, pMX.find(p => p.title_id == g.nsuid)),
                BR: mergePriceData(g, pBR.find(p => p.title_id == g.nsuid)),
                AR: mergePriceData(g, pAR.find(p => p.title_id == g.nsuid))
            }
        }));

        res.json({ source: 'Americas', count: results.length, data: results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. 欧洲区
app.get('/api/europe', async (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit) || 20;
        const games = await getEuropeGames(query, limit);
        const ids = games.map(g => g.nsuid);

        const [pGB, pNO, pZA] = await Promise.all([
            getPrices('GB', ids), getPrices('NO', ids), getPrices('ZA', ids)
        ]);

        const results = games.map(g => ({
            ...g,
            prices: {
                GB: mergePriceData(g, pGB.find(p => p.title_id == g.nsuid)),
                NO: mergePriceData(g, pNO.find(p => p.title_id == g.nsuid)),
                ZA: mergePriceData(g, pZA.find(p => p.title_id == g.nsuid))
            }
        }));

        res.json({ source: 'Europe', count: results.length, data: results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. 日本区
app.get('/api/japan', async (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit) || 20;
        const games = await getJapanGames(query, limit);
        const ids = games.map(g => g.nsuid);

        const pJP = await getPrices('JP', ids);

        const results = games.map(g => ({
            ...g,
            prices: {
                JP: mergePriceData(g, pJP.find(p => p.title_id == g.nsuid))
            }
        }));

        res.json({ source: 'Japan', count: results.length, data: results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ API 服务已重启: http://localhost:${PORT}`);
    console.log(`👉 验证美服价格: http://localhost:${PORT}/api/americas?limit=10`);
});