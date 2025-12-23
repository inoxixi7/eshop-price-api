// server.js (修复价格解析 Bug 版)
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache'); // 1. 引入缓存库

const { getAmericasGames } = require('./americas');
const { getEuropeGames } = require('./europe');
const { getJapanGames } = require('./asia');

const app = express();
// process.env.PORT 是 Render 自动注入的环境变量
const PORT = process.env.PORT || 3000;

// 2. 初始化缓存：stdTTL = 3600秒 (缓存1小时)，checkperiod = 600秒 (每10分钟清理一次过期缓存)
const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

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
// --- 3. 封装一个带缓存的处理函数 (通用逻辑) ---
// keyPrefix: 'us_', 'eu_', 'jp_' 用来区分不同地区
// fetchFunction: 真正去爬虫的函数
async function handleRequestWithCache(req, res, keyPrefix, fetchFunction) {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit) || 20;

        // 生成唯一的缓存 Key，例如 "us_Mario_20"
        // 只要查询词和数量一样，Key 就一样
        const cacheKey = `${keyPrefix}_${query}_${limit}`;

        // A. 先检查缓存里有没有
        const cachedData = myCache.get(cacheKey);
        if (cachedData) {
            console.log(`⚡️ 命中缓存: ${cacheKey} (无需请求任天堂)`);
            return res.json(cachedData); // 直接返回旧数据
        }

        // B. 缓存里没有，才去请求任天堂
        console.log(`🐢 未命中缓存，正在请求任天堂: ${cacheKey}`);
        const games = await fetchFunction(query, limit);
        const ids = games.map(g => g.nsuid);

        // 根据地区判断用哪个国家代码查价格
        let pricePromises = [];
        if (keyPrefix === 'us') {
            pricePromises = [getPrices('US', ids), getPrices('MX', ids), getPrices('BR', ids), getPrices('AR', ids)];
        } else if (keyPrefix === 'eu') {
            pricePromises = [getPrices('GB', ids), getPrices('NO', ids), getPrices('ZA', ids)];
        } else if (keyPrefix === 'jp') {
            pricePromises = [getPrices('JP', ids)];
        }

        const pricesRaw = await Promise.all(pricePromises);

        // 数据合并逻辑 (简化版，根据你之前的逻辑调整)
        const results = games.map(g => {
            let pricesObj = {};
            if (keyPrefix === 'us') {
                pricesObj = {
                    US: mergePriceData(g, pricesRaw[0].find(p => p.title_id == g.nsuid)),
                    MX: mergePriceData(g, pricesRaw[1].find(p => p.title_id == g.nsuid)),
                    BR: mergePriceData(g, pricesRaw[2].find(p => p.title_id == g.nsuid)),
                    AR: mergePriceData(g, pricesRaw[3].find(p => p.title_id == g.nsuid))
                };
            } else if (keyPrefix === 'eu') {
                // ... 欧服合并逻辑
                 pricesObj = {
                    GB: mergePriceData(g, pricesRaw[0].find(p => p.title_id == g.nsuid)),
                    NO: mergePriceData(g, pricesRaw[1].find(p => p.title_id == g.nsuid)),
                    ZA: mergePriceData(g, pricesRaw[2].find(p => p.title_id == g.nsuid))
                };
            } else {
                 pricesObj = { JP: mergePriceData(g, pricesRaw[0].find(p => p.title_id == g.nsuid)) };
            }
            return { ...g, prices: pricesObj };
        });

        const finalResponse = { 
            source: 'Live Fetch', 
            count: results.length, 
            data: results,
            cached_at: new Date().toISOString() // 标记一下这是什么时候存的
        };

        // C. 拿到新数据后，存入缓存 (下次别人搜就快了)
        myCache.set(cacheKey, { ...finalResponse, source: 'Cache' });

        res.json(finalResponse);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// ================= 路由简化 =================

app.get('/api/americas', (req, res) => {
    handleRequestWithCache(req, res, 'us', getAmericasGames);
});

app.get('/api/europe', (req, res) => {
    handleRequestWithCache(req, res, 'eu', getEuropeGames);
});

app.get('/api/japan', (req, res) => {
    handleRequestWithCache(req, res, 'jp', getJapanGames);
});

app.listen(PORT, () => {
    console.log(`✅ 带缓存的 API 服务器已启动: Port ${PORT}`);
});