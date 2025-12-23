// asia.js
const axios = require('axios');

// --- 日服 (Japan) ---
async function getJapanGames(query = '', limit = 20) {
    console.log('🔍 [日服] 正在请求搜索接口...');
    const url = 'https://search.nintendo.jp/nintendo_soft/search.json';
    
    try {
        const response = await axios.get(url, {
            params: { 
                q: query, 
                opt_hard: '1_HAC', 
                limit: limit, 
                page: 1, 
                sort: query ? 'score desc' : 'hdate desc' }
        });
        const items = response.data.result.items;
        
        return items.map(item => ({
            title: item.title,
            nsuid: item.nsuid,
            region: 'JP',
            url: `https://store-jp.nintendo.com/list/software/${item.nsuid}.html`,
            image: item.main_image_url
        }));
    } catch (error) {
        console.error('❌ [日服] 请求失败:', error.message);
        return [];
    }
}

module.exports = { getJapanGames };