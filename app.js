// 应用主逻辑
const contentEl = document.getElementById('content');
const searchInput = document.querySelector('.search-box input');
let currentPath = [];
let allHikings = []; // 存储所有徒步线路数据

// 根据长度值返回样式类
function getLengthClass(length) {
    const km = parseFloat(length.replace('公里', '')) || 0;
    if (km < 10) return 'short';
    if (km < 20) return 'medium';
    return 'long';
}

// 根据耗时值返回样式类
function getTimeClass(time) {
    const hours = parseFloat(time.replace('小时', '')) || 0;
    if (hours < 4) return 'short';
    if (hours < 8) return 'medium';
    return 'long';
}

// 根据爬升值返回样式类
function getAscentClass(ascent) {
    if (ascent < 1000) return 'low';
    if (ascent < 2000) return 'medium';
    return 'high';
}

// 难度转换为星级
function getDifficultyStars(ascent) {
    const solidStar = '★';
    // 每500米爬升对应1颗星，最高7颗星
    const level = Math.min(Math.floor(ascent / 500) + 1, 7);
    return `<span class="difficulty-${level}">${solidStar.repeat(level)}${'☆'.repeat(7 - level)}</span>`;
}

// 创建徒步线路项
function createHikingItem(hiking) {
    const itemEl = document.createElement('li');
    itemEl.className = 'hiking-item hike-item';
    itemEl.innerHTML = `
        <div class="hike-meta">
            <h4>${hiking.name}</h4>
                <span>长度: <span class="length-${getLengthClass(hiking.length)}">${hiking.length}</span></span>
                <span>爬升: <span class="elevation-ascent-${getAscentClass(hiking.elevation.ascent)}">${hiking.elevation.ascent}米</span></span>
                <span>难度: <span class="difficulty-stars">${getDifficultyStars(hiking.elevation.ascent)}</span></span>
                ${hiking.intro}
        </div>
    `;
    return itemEl;
}

// 初始化页面
function init() {
    renderBreadcrumb();
    renderProvinces();
    setupSearch();
    
    // 初始化时加载所有徒步线路数据
    for (const province in provincesData) {
        for (const city in provincesData[province]) {
            for (const county in provincesData[province][city]) {
                const hikings = provincesData[province][city][county];
                if(!Array.isArray(allHikings)) allHikings = [];
                const existingIds = new Set(allHikings.filter(h => h && h.name).map(h => h.name));
                const newHikings = hikings.filter(h => h && h.name && !existingIds.has(h.name));
                
                allHikings = allHikings.concat(newHikings);
            }
        }
    }
    console.log('Initialized allHikings count:', allHikings.length);
    
    // 初始化完成后立即显示随机线路
    renderProvinces();
}

// 渲染面包屑导航
function renderBreadcrumb() {
    const breadcrumbEl = document.querySelector('.breadcrumb');
    breadcrumbEl.innerHTML = '<a href="#" onclick="goHome()">首页</a>';
    
    currentPath.forEach((item, index) => {
        breadcrumbEl.innerHTML += ` > <a href="#" onclick="navigateTo(${index})">${item.name}</a>`;
    });
}

// 导航到指定层级
function navigateTo(level) {
    currentPath = currentPath.slice(0, level + 1);
    
    // 根据当前路径重新渲染内容
    if (currentPath.length === 0) {
        renderProvinces();
    } else if (currentPath.length === 1) {
        renderCities(currentPath[0].name);
    } else if (currentPath.length === 2) {
        renderCounties(currentPath[0].name, currentPath[1].name);
    } else if (currentPath.length === 3) {
        renderHikings(currentPath[0].name, currentPath[1].name, currentPath[2].name);
    }
    
    renderBreadcrumb();
}

// 返回首页
function goHome() {
    currentPath = [];
    renderProvinces();
    renderBreadcrumb();
}

// 通用渲染函数
function renderItems(data, title, itemClass, clickHandler) {
    contentEl.innerHTML = `<div class="category" id="items"></div>`;
    
    const itemsEl = document.getElementById('items');
    for (const item in data) {
        const itemEl = document.createElement('div');
        itemEl.className = itemClass;
        itemEl.innerHTML = `<a href="#" onclick="${clickHandler}('${item}')">${item}</a>`;
        itemsEl.appendChild(itemEl);
    }
}

// 渲染省份列表
// 根据区域获取随机线路
function getRandomHikingsByArea(province, city, county, count = 7) {
    let hikings = [];
    
    if (province && city && county) {
        // 县级线路
        hikings = provincesData[province][city][county];
    } else if (province && city) {
        // 市级线路
        hikings = Object.values(provincesData[province][city]).flat();
    } else if (province) {
        // 省级线路
        hikings = Object.values(provincesData[province])
            .flatMap(city => Object.values(city).flat());
    } else {
        // 全国线路
        hikings = allHikings;
    }
    
    // 随机排序并返回指定数量的线路
    return [...hikings].sort(() => 0.5 - Math.random()).slice(0, count);
}

function renderProvinces() {
    renderItems(provincesData, '', 'province-item', 'selectProvince');
    
    // 显示7条全国随机线路
    const randomHikings = getRandomHikingsByArea();
    if (randomHikings && randomHikings.length > 0) {
        const randomSection = document.createElement('div');
        randomSection.className = 'random-hikings';
        randomSection.innerHTML = '<br><ul class="hiking-list"></ul>';
        contentEl.appendChild(randomSection);
        
        const listEl = randomSection.querySelector('ul');
        randomHikings.forEach(hiking => {
            const itemEl = createHikingItem(hiking);
            itemEl.onclick = () => {
                const province = hiking.province || Object.keys(provincesData).find(p => 
                    Object.keys(provincesData[p]).some(c => 
                        Object.keys(provincesData[p][c]).some(co => 
                            provincesData[p][c][co].some(h => h.name === hiking.name)
                        )
                    )
                );
                if (province) {
                    const city = hiking.city || Object.keys(provincesData[province]).find(c => 
                        Object.keys(provincesData[province][c]).some(co => 
                            provincesData[province][c][co].some(h => h.name === hiking.name)
                        )
                    );
                    if (city) {
                        const county = hiking.county || Object.keys(provincesData[province][city]).find(co => 
                            provincesData[province][city][co].some(h => h.name === hiking.name)
                        );
                        if (county) {
                            currentPath = [
                                { type: 'province', name: province },
                                { type: 'city', name: city },
                                { type: 'county', name: county }
                            ];
                            renderHikings(province, city, county);
                            renderBreadcrumb();
                        }
                    }
                }
            };
            listEl.appendChild(itemEl);
        });
    }
}

// 选择省份
function selectProvince(province) {
    currentPath = [{ type: 'province', name: province }];
    renderCities(province);
    renderBreadcrumb();
}

// 渲染城市列表
function renderCities(province) {
    renderItems(provincesData[province], `${province} - 市级行政区`, 'city-item', `selectCity.bind(null, '${province}')`);
    
    // 显示该省7条随机线路
    const randomHikings = getRandomHikingsByArea(province);
    if (randomHikings && randomHikings.length > 0) {
        const randomSection = document.createElement('div');
        randomSection.className = 'random-hikings';
        randomSection.innerHTML = `<br><ul class="hiking-list"></ul>`;
        contentEl.appendChild(randomSection);
        
        const listEl = randomSection.querySelector('ul');
        randomHikings.forEach(hiking => {
            const itemEl = createHikingItem(hiking);
            itemEl.onclick = () => {
                const city = hiking.city || Object.keys(provincesData[province]).find(c => 
                    Object.keys(provincesData[province][c]).some(co => 
                        provincesData[province][c][co].some(h => h.name === hiking.name)
                    )
                );
                if (city) {
                    const county = hiking.county || Object.keys(provincesData[province][city]).find(co => 
                        provincesData[province][city][co].some(h => h.name === hiking.name)
                    );
                    if (county) {
                        currentPath = [
                            { type: 'province', name: province },
                            { type: 'city', name: city },
                            { type: 'county', name: county }
                        ];
                        renderHikings(province, city, county);
                        renderBreadcrumb();
                    }
                }
            };
            listEl.appendChild(itemEl);
        });
    }
}

// 选择城市
function selectCity(province, city) {
    currentPath = [
        { type: 'province', name: province },
        { type: 'city', name: city }
    ];
    renderCounties(province, city);
    renderBreadcrumb();
}

// 渲染县区列表
function renderCounties(province, city) {
    renderItems(provincesData[province][city], `${province} - ${city} - 县级行政区`, 'county-item', `selectCounty.bind(null, '${province}', '${city}')`);
    
    // 显示该市7条随机线路
    const randomHikings = getRandomHikingsByArea(province, city);
    if (randomHikings && randomHikings.length > 0) {
        const randomSection = document.createElement('div');
        randomSection.className = 'random-hikings';
        randomSection.innerHTML = `<br><ul class="hiking-list"></ul>`;
        contentEl.appendChild(randomSection);
        
        const listEl = randomSection.querySelector('ul');
        randomHikings.forEach(hiking => {
            const itemEl = createHikingItem(hiking);
            itemEl.onclick = () => {
                const county = hiking.county || Object.keys(provincesData[province][city]).find(co => 
                    provincesData[province][city][co].some(h => h.name === hiking.name)
                );
                if (county) {
                    currentPath = [
                        { type: 'province', name: province },
                        { type: 'city', name: city },
                        { type: 'county', name: county }
                    ];
                    renderHikings(province, city, county);
                    renderBreadcrumb();
                }
            };
            listEl.appendChild(itemEl);
        });
    }
}

// 选择县区
function selectCounty(province, city, county) {
    currentPath = [
        { type: 'province', name: province },
        { type: 'city', name: city },
        { type: 'county', name: county }
    ];
    renderHikings(province, city, county);
    renderBreadcrumb();
}

// 渲染建筑列表
function renderHikings(province, city, county) {
    return renderHikingList(provincesData[province][city][county], `${province} - ${city} - ${county}`);
}

function renderSearchResults(results) {
    return renderHikingList(results, '搜索结果');
}

function renderHikingList(hikings, title) {
    contentEl.innerHTML = `<ul class="hiking-list"></ul>`;
    
    if(!Array.isArray(allHikings)) allHikings = [];
    
    // 初始化或更新allHikings数组
    const existingIds = new Set(allHikings.filter(h => h && h.name).map(h => h.name));
    const newHikings = hikings.filter(h => h && h.name && !existingIds.has(h.name));
    allHikings = allHikings.concat(newHikings);
    
    console.log('Updated allHikings count:', allHikings.length);
    const listEl = contentEl.querySelector('ul');
    
    hikings.forEach(hiking => {
        const itemEl = document.createElement('li');
        itemEl.className = 'hiking-item hike-item';
        itemEl.innerHTML = `
    <div class="hike-details">
        <h3>${hiking.name}</h3>
        <p><strong><span>长度:</strong> <span class="length-${getLengthClass(hiking.length)} length-value">${hiking.length}</span></span></p>
        <p><strong><span>耗时:</strong> <span class="time-${getTimeClass(hiking.time)} time-value">${hiking.time}</span></span></p>
        <p><strong>难度:</strong> <span class="difficulty-stars difficulty-value">${getDifficultyStars(hiking.elevation.ascent)}</span></p>
        <p><strong>起点:</strong> ${hiking.startPoint}</p>
        <p><strong>终点:</strong> ${hiking.endPoint}</p>
        <p><strong>途径点:</strong> ${hiking.waypoints.join(' → ')}</p>
        <p><strong>补给点:</strong> ${hiking.supplyPoints.join(', ')}</p>
        <p><strong>海拔:</strong> 最高<span class="elevation-max elevation-max-value">${hiking.elevation.max}</span>米, 爬升<span class="elevation-ascent elevation-ascent-value">${hiking.elevation.ascent}</span>米, 下降<span class="elevation-descent elevation-descent-value">${hiking.elevation.descent}</span>米</p>
        <p class="hike-intro"><strong>简介:</strong> ${hiking.intro}</p>
        <p class="hike-food"><strong>美食:</strong> ${hiking.food.join(', ')}</p>
        <div class="hike-links">
            <a href="https://www.2bulu.com/track/search-${hiking.name}.htm" target="_blank">两步路${hiking.name}轨迹下载</a>
            <a href="https://www.douyin.com/search/${hiking.name}" target="_blank">抖音${hiking.name}视频</a>
            <a href="https://www.xiaohongshu.com/search_result?keyword=${hiking.name}" target="_blank">小红书${hiking.name}分享</a>
            <a href="https://search.bilibili.com/all?keyword=${hiking.name}" target="_blank">哔哩哔哩${hiking.name}视频</a>
        </div>
    </div>
`;
        listEl.appendChild(itemEl);
    });
}

// 设置搜索功能
function setupSearch() {
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        if (query.length < 2) return;
        
        console.log('Search query:', query);
        console.log('Total hikings:', allHikings.length);
        
        const results = allHikings.filter(hiking => {
            const match = (
                hiking.name.toLowerCase().includes(query) ||
                hiking.intro.toLowerCase().includes(query) ||
                hiking.startPoint.toLowerCase().includes(query) ||
                hiking.endPoint.toLowerCase().includes(query) ||
                (hiking.waypoints && hiking.waypoints.some(wp => wp.toLowerCase().includes(query))) ||
                (hiking.supplyPoints && hiking.supplyPoints.some(sp => sp.toLowerCase().includes(query))) ||
                (hiking.food && hiking.food.some(f => f.toLowerCase().includes(query)))
            );
            if(match) console.log('Matched hiking:', hiking.name);
            return match;
        });
        
        console.log('Found results:', results.length);
        renderSearchResults(results);
    });
}

// 渲染搜索结果


function renderSearchResults(results) {
    contentEl.innerHTML = `<h2>搜索结果</h2><ul class="hiking-list"></ul>`;
    
    const listEl = contentEl.querySelector('ul');
    results.forEach(hiking => {
        const itemEl = document.createElement('li');
        itemEl.className = 'hiking-item hike-item';
        itemEl.innerHTML = `
            <div class="hike-meta">
                <h4>${hiking.name}</h4>
                    <span>长度: <span class="length-${getLengthClass(hiking.length)}">${hiking.length}</span></span>
                    <span>爬升: <span class="elevation-ascent-${getAscentClass(hiking.elevation.ascent)}">${hiking.elevation.ascent}米</span></span>
                    <span>难度: <span class="difficulty-stars">${getDifficultyStars(hiking.elevation.ascent)}</span></span>
                    ${hiking.intro}
            </div>
        `;
        itemEl.onclick = () => {
            const province = hiking.province || Object.keys(provincesData).find(p => 
                Object.keys(provincesData[p]).some(c => 
                    Object.keys(provincesData[p][c]).some(co => 
                        provincesData[p][c][co].some(h => h.name === hiking.name)
                    )
                )
            );
            if (province) {
                const city = hiking.city || Object.keys(provincesData[province]).find(c => 
                    Object.keys(provincesData[province][c]).some(co => 
                        provincesData[province][c][co].some(h => h.name === hiking.name)
                    )
                );
                if (city) {
                    const county = hiking.county || Object.keys(provincesData[province][city]).find(co => 
                        provincesData[province][city][co].some(h => h.name === hiking.name)
                    );
                    if (county) {
                        currentPath = [
                            { type: 'province', name: province },
                            { type: 'city', name: city },
                            { type: 'county', name: county }
                        ];
                        renderHikings(province, city, county);
                        renderBreadcrumb();
                    }
                }
            }
        };
        listEl.appendChild(itemEl);
    });
}

// 启动应用
init();