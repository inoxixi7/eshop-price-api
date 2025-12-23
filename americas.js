// americas.js
const { algoliasearch } = require('algoliasearch');

// 2025 Updated Keys (From your data)
const ALGOLIA_APP_ID = 'U3B6GR4UA3';
const ALGOLIA_API_KEY = 'a29c6927638bfd8cee23993e51e721c9'; // ✅ 使用你抓到的新 Key
const ALGOLIA_INDEX = 'store_game_en_us'; // 如果这个报错，试改为 'store_game_en_us_products'

async function getAmericasGames(query = '', limit = 20) {
    console.log('🔍 [美服] 正在连接 Algolia...');
    
    // v5 初始化客户端
    const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);

    try {
        // v5 写法
        const { results } = await client.search({
            requests: [
                {
                    indexName: ALGOLIA_INDEX,
                    query: query,
                    hitsPerPage: limit, 
                    filters: 'platform:"Nintendo Switch"',
                },
            ],
        });

        const hits = results[0].hits;

        return hits.map(game => ({
            title: game.title,
            nsuid: game.nsuid, 
            region: 'US',
            url: `https://www.nintendo.com${game.url}`,
            boxArt: game.boxArt
        }));

    } catch (error) {
        console.error('❌ [美服] 获取失败:', error.message);
        if (error.status) console.error('Status:', error.status);
        return [];
    }
}

module.exports = { getAmericasGames };