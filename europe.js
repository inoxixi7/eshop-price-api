// europe.js
const axios = require('axios');

async function getEuropeGames(query = '', limit = 20) {
    console.log('🔍 [欧服] 正在请求 API...');
    
    const url = 'https://search.nintendo-europe.com/en/select';

    const qParam = query ? `title:"${query}"` : '*:*';
    
    try {
        const response = await axios.get(url, {
            params: {
                q: qParam, // 这是一个通配符，表示"所有东西"
                fq: 'type:GAME AND playable_on_txt:"HAC"', // HAC = Nintendo Switch 内部代号
                sort: query ? 'score desc' : 'popularity asc',
                rows: limit,
                wt: 'json'
            }
        });

        // 调试：看看任天堂到底返回了什么结构
        if (!response.data || !response.data.response) {
            console.error('❌ [欧服] 返回数据结构异常:', Object.keys(response.data));
            return [];
        }

        const docs = response.data.response.docs;
        console.log(`✅ [欧服] 成功抓取到 ${docs.length} 条原始数据`);

        if (docs.length === 0) {
            console.warn('⚠️ [欧服] 警告: API 返回了 0 条数据，可能是搜索参数 (fq) 失效。');
            return [];
        }

        return docs.map(doc => ({
            title: doc.title,
            nsuid: doc.nsuid_txt ? doc.nsuid_txt[0] : null,
            region: 'EU',
            url: doc.url ? `https://www.nintendo.co.uk${doc.url}` : null,
            image: doc.image_url
        }));

    } catch (error) {
        console.error('❌ [欧服] 获取失败:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data).slice(0, 100)); // 打印前100个字符看看
        }
        return [];
    }
}

module.exports = { getEuropeGames };