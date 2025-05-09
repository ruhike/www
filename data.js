// 省级户外徒步爬山线路数据
const provincesData = {
    '北京市': {
        '市辖区': {
            '海淀区': [
                {name: '海淀三峰', length: '22公里', time: '8-10小时', startPoint: '大觉寺', endPoint: '大觉寺', waypoints: ['鹫峰', '阳台山', '妙峰山'], supplyPoints: ['大觉寺停车场', '阳台山停车场'], elevation: {max: 1291, ascent: 1800, descent: 1800}, intro: '海淀三峰是北京最经典的徒步路线之一，串联了鹫峰、阳台山和妙峰山三座山峰，沿途风景优美，四季皆宜。', food: ['大觉寺素斋', '阳台山农家菜']},
            ],
            '密云区': [
                {name: '桃源仙谷四座楼环线', length: '15公里', time: '6-8小时', startPoint: '桃源仙谷景区入口', endPoint: '桃源仙谷景区入口', waypoints: ['气泡湖', '冰瀑', '四座楼长城'], supplyPoints: ['桃源仙谷景区停车场'], elevation: {max: 900, ascent: 900, descent: 900}, intro: '桃源仙谷四座楼环线是一条风景优美的徒步路线，沿途可以欣赏到气泡湖、冰瀑等自然景观，还能登临四座楼长城远眺密云水库。', food: ['密云水库鱼', '农家柴锅炖']}
            ]
        }
    },
    '江苏省': {
        '苏州市': {
            '吴中区': [
                {name: '吴中十峰', length: '23-24公里', time: '8-10小时', startPoint: '灵岩山', endPoint: '灵岩山', waypoints: ['大焦山', '鸭乌岭', '观音山', '鹿山', '贺九岭', '莲花峰', '五峰山', '羊肠岭'], supplyPoints: ['灵岩山停车场'], elevation: {max: 338.2, ascent: 1300, descent: 1300}, intro: '吴中十峰是苏州最经典的环形徒步路线，串联十座花岗岩山峰，沿途可欣赏奇石、摩崖石刻等景观，被驴友称为"单日虐线"。', food: ['木渎藏书羊肉']}
            ],
            '高新区': [
                {name: '灵树线', length: '18公里', time: '6-8小时', startPoint: '灵岩山', endPoint: '树山村', waypoints: ['大焦山', '白马涧', '天池山', '贺九岭', '皇冠山', '大阳山'], supplyPoints: ['白马涧景区（收费）'], elevation: {max: 338.2, ascent: 1300, descent: 1300}, intro: '从灵岩山到树山的经典穿越路线，因连续爬升下降被称为"魔鬼线"，包含砂石路、绳降等多种地形。', food: ['大阳山素面']},
                {name: '灵白线', length: '6-8公里', time: '3-4小时', startPoint: '灵岩山', endPoint: '白马涧', waypoints: ['大焦山', '羊肠岭'], supplyPoints: ['白马涧景区（收费）'], elevation: {max: 200, ascent: 400, descent: 400}, intro: '苏州最经典的入门级徒步路线，以砂石陡坡和绳索攀爬为特色，适合亲子体验。', food: ['灵岩山素面']},
                {name: '灵白魔鬼线', length: '12公里', time: '5-6小时', startPoint: '灵岩山', endPoint: '白马涧', waypoints: ['大焦山', '杈枪岭'], supplyPoints: [], elevation: {max: 300, ascent: 800, descent: 800}, intro: '灵白线的加强版，需翻越多座山岭，包含岩石攀爬、竹林穿越等更具挑战性的地形。', food: []}
            ],
            '吴中区/高新区交界': [
                {name: '天池山花山鱼骨线', length: '5-6公里', time: '3-4小时', startPoint: '林江郎观音堂', endPoint: '天池山出入口', waypoints: ['贺九岭', '莲花峰', '寂鉴寺', '南天门'], supplyPoints: ['寂鉴寺'], elevation: {max: 171, ascent: 550, descent: 550}, intro: '连接天池山与花山的刺激路线，因形似鱼骨得名，包含70度岩壁攀爬，需借助绳索。', food: ['花山素斋']}
            ],
            '吴中区': [
                {name: '穹窿山小恐龙线', length: '17-18公里', time: '6-8小时', startPoint: '上泾村', endPoint: '上泾村', waypoints: ['上真观', '孙武园', '香山草庵', '天王殿'], supplyPoints: ['自助补水点'], elevation: {max: 341.7, ascent: 1200, descent: 1200}, intro: '以五上五下地形绘制出恐龙轨迹的经典路线，途经《孙子兵法》创作地，含茶园、古寺等景观。', food: ['穹窿面馆']},
                {name: '光福小七尖', length: '20-21公里', time: '8小时', startPoint: '香雪海', endPoint: '香雪海', waypoints: ['邓尉山', '玄墓山', '米堆山', '长山', '潭山', '西碛山', '铜井山'], supplyPoints: ['坎上村'], elevation: {max: 253, ascent: 950, descent: 950}, intro: '苏州西部环太湖的"毕业路线"，春季可赏樱花，含盘山公路、绳索攀岩等多样化地形。', food: ['光福野葱蛋饼']}
            ],
            '常熟市': [
                {name: '虞山雄鹰线', length: '12.9公里', time: '4-5小时', startPoint: '龙殿', endPoint: '龙殿', waypoints: ['网红石', '松风亭', '剑门', '联珠洞'], supplyPoints: ['项家坞驿站'], elevation: {max: 263, ascent: 600, descent: 600}, intro: '形似雄鹰的环线，包含龙潭秘境、悬空网红石等打卡点，可远眺尚湖。', food: ['虞山蕈油面']},
                {name: '虞山一棵松', length: '32.45公里', time: '10小时', startPoint: '虞山公园', endPoint: '虞山公园', waypoints: ['维摩山庄', '剑门'], supplyPoints: [], elevation: {max: 263, ascent: 2331, descent: 2331}, intro: '虞山经典大环线，累计爬升2331米，适合有户外经验的徒步爱好者，沿途可欣赏剑门奇石等景观。', food: []}
            ]
        }
	}
};

// 所有户外徒步爬山线路数据
const allBuildings = [];

// 填充allBuildings数组
for (const province in provincesData) {
    for (const city in provincesData[province]) {
        for (const county in provincesData[province][city]) {
            allBuildings.push(...provincesData[province][city][county]);
        }
    }
}