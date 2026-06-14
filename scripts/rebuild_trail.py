#!/usr/bin/env python3
"""
完整重建西湖标毅线 JSON：提取 KML 所有 Placemark 的完整信息，
生成含全部途经点的路线数据，并重写内容。
"""
import xml.etree.ElementTree as ET
import json, os, math, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

NS = {
    'kml': 'http://www.opengis.net/kml/2.2',
    'gx': 'http://www.google.com/kml/ext/2.2'
}

def calc_distance(lat1, lng1, lat2, lng2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def douglas_peucker(points, epsilon):
    if len(points) <= 2: return points
    max_dist = 0; max_idx = 0
    start, end = points[0][:2], points[-1][:2]
    for i in range(1, len(points)-1):
        x0, y0 = points[i][:2]
        x1, y1, x2, y2 = *start, *end
        dx, dy = x2-x1, y2-y1
        if dx==0 and dy==0: d = math.hypot(x0-x1, y0-y1)
        else:
            t = max(0, min(1, ((x0-x1)*dx+(y0-y1)*dy)/(dx*dx+dy*dy)))
            d = math.hypot(x0-(x1+t*dx), y0-(y1+t*dy))
        if d > max_dist: max_dist, max_idx = d, i
    if max_dist > epsilon:
        left = douglas_peucker(points[:max_idx+1], epsilon)
        right = douglas_peucker(points[max_idx:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]

def strip_html(html_str):
    """移除HTML标签，保留纯文本"""
    text = re.sub(r'</div>', '\n', html_str)
    text = re.sub(r'<div[^>]*>', '', text)
    text = re.sub(r'</br>', '\n', text)
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n+', '\n', text).strip()
    return text

def extract_desc_info(desc):
    """从描述中提取经度、纬度、海拔、时间"""
    clean = strip_html(desc)
    info = {}
    for line in clean.split('\n'):
        line = line.strip()
        if line.startswith('经度：'): info['lng'] = float(line[3:])
        elif line.startswith('纬度：'): info['lat'] = float(line[3:])
        elif line.startswith('海拔：'): info['alt'] = float(line[3:])
        elif line.startswith('时间：'): info['time'] = line[3:]
    return info

def main():
    kml_file = os.path.join(os.path.dirname(__file__), '..', 'kml',
                            '中国浙江省杭州市西湖区西湖标毅线.kml')
    with open(kml_file, 'r', encoding='utf-8') as f:
        content = f.read()
    for prefix, uri in NS.items():
        ET.register_namespace(prefix, uri)
    root = ET.fromstring(content)

    # 1. 提取轨迹坐标
    track_coords = []
    for coord_el in root.iter('{http://www.google.com/kml/ext/2.2}coord'):
        parts = coord_el.text.strip().split()
        if len(parts) >= 3:
            track_coords.append([float(parts[1]), float(parts[0]), float(parts[2])])

    # 2. 计算轨迹统计
    total_dist = 0.0; total_ascent = 0.0; total_descent = 0.0
    max_alt = 0; min_alt = float('inf')
    for i in range(1, len(track_coords)):
        prev, curr = track_coords[i-1], track_coords[i]
        total_dist += calc_distance(prev[0], prev[1], curr[0], curr[1])
        ad = curr[2]-prev[2]
        if ad > 0: total_ascent += ad
        else: total_descent += abs(ad)
        max_alt = max(max_alt, curr[2]); min_alt = min(min_alt, curr[2])
    if min_alt == float('inf'): min_alt = 0

    # 3. 提取所有 Placemark（排除标注点/起点/终点文件夹）
    placemarks = []
    SKIP_NAMES = {'标注点', '起点', '终点'}
    for pm in root.iter('{http://www.opengis.net/kml/2.2}Placemark'):
        name_el = pm.find('kml:name', NS)
        desc_el = pm.find('kml:description', NS)
        point_el = pm.find('.//kml:Point', NS)
        if name_el is None or point_el is None:
            continue
        name = (name_el.text or '').strip()
        if name in SKIP_NAMES or name.startswith('Folder'):
            continue
        coord_el = point_el.find('kml:coordinates', NS)
        if coord_el is None or not coord_el.text:
            continue
        parts = coord_el.text.strip().split(',')
        if len(parts) < 3: continue
        lng, lat, alt = float(parts[0]), float(parts[1]), float(parts[2])
        desc_raw = (desc_el.text or '') if desc_el is not None else ''
        desc_info = extract_desc_info(desc_raw)
        # 用描述中的海拔（更精确）
        if 'alt' in desc_info and desc_info['alt'] > 0:
            alt = desc_info['alt']
        placemarks.append({
            'name': name,
            'lat': lat, 'lng': lng, 'altitude': alt,
            'desc_raw': strip_html(desc_raw),
            'time': desc_info.get('time', ''),
        })

    # 4. 计算每个Placemark距起点距离
    for pm in placemarks:
        best_cum = 0.0; cum = 0.0; best_d = float('inf')
        for i in range(1, len(track_coords)):
            cum += calc_distance(track_coords[i-1][0], track_coords[i-1][1],
                                 track_coords[i][0], track_coords[i][1])
            d = calc_distance(pm['lat'], pm['lng'], track_coords[i][0], track_coords[i][1])
            if d < best_d:
                best_d = d; best_cum = cum
        pm['distanceFromStart'] = round(best_cum / 1000, 2)

    placemarks.sort(key=lambda p: p['distanceFromStart'])

    # 5. 构建途经点数组
    surface_map = {
        '台阶': 'steps', '石阶': 'steps',
        '土路': 'dirt', '野路': 'dirt', '小路': 'dirt',
        '公路': 'paved', '铺装': 'paved', '步道': 'paved',
        '碎石': 'rocky', '石板': 'paved', '石板路': 'paved',
    }
    waypoints = []
    for pm in placemarks:
        name = pm['name']
        # 构建描述
        desc_parts = []
        if pm['desc_raw']:
            # 只保留非坐标/时间的描述行
            for line in pm['desc_raw'].split('\n'):
                line = line.strip()
                if line and not line.startswith(('经度', '纬度', '海拔', '时间')):
                    if len(line) > 3:
                        desc_parts.append(line)
        desc = '；'.join(desc_parts) if desc_parts else name

        surface = 'mixed'
        for k, v in surface_map.items():
            if k in name:
                surface = v; break

        waypoints.append({
            'name': name,
            'description': desc,
            'lat': round(pm['lat'], 6),
            'lng': round(pm['lng'], 6),
            'altitude': round(pm['altitude']),
            'surface': surface,
            'distanceFromStart': pm['distanceFromStart']
        })

    # 6. DP抽稀
    simplified = douglas_peucker(track_coords, 0.0001) if len(track_coords) > 500 else track_coords[:]

    # 7. 构建路线 JSON
    trail_json = {
        'slug': 'xihu-biaoyi',
        'name': '西湖标毅线',
        'nameEn': 'West Lake Biaoyi Trail',
        'continent': 'asia', 'country': 'china', 'province': 'zhejiang',
        'city': 'hangzhou', 'district': 'xihu',
        'difficulty': 5,
        'distance': round(total_dist/1000, 1),
        'ascent': round(total_ascent),
        'descent': round(total_descent),
        'duration': '1天（8小时内完成为入门标准）',
        'maxAltitude': round(max_alt), 'minAltitude': round(min_alt),
        'tags': ['西湖', '杭州', '城市徒步', '群山', '经典', '北高峰', '财神庙', '十里琅珰', '毕业路线', '一日穿越'],
        'feature': '杭州户外圈的「毕业路线」——25公里贯穿西湖群山山脊，八小时完赛是杭州驴友的入门标准。',
        'fameReason': '',
        'history': '',
        'story': r'''## 一、历史传承：一段山脊线的二十载沉浮

2002年，香港「乐施毅行者」百公里慈善徒步已风靡亚洲。杭州一群热爱山野的户外先行者受此启发，开始在西湖北岸的群山中勘线探路。彼时的杭州户外圈尚处于萌芽阶段——没有GPS轨迹，没有成熟攻略，甚至连完整的户外装备概念都未普及。第一批探路者手持纸质地图和指南针，在老和山至吴山的山脊线上反复踏勘、试走、调整线路走向，最终确立「老和云起→吴山大观」的经典路径，串联起西湖北岸二十余座山丘。「标毅」二字，既致敬香港毅行精神，也暗含「标准化」与「坚毅」的双重寓意。

2005年前后，随着「19楼」「磨房」「游侠客」等互联网户外社区的兴起，标毅线开始从线下小圈子进入大众视野。路书帖、完赛报告、装备攻略在论坛上层出不穷。八小时内走完全程，逐渐成为杭州户外圈约定俗成的「入门仪式」。早期的野路岔口考验着每一位徒步者的方向感，老驴们自发用红布条标记路口，后来演变为规范的丝带路标体系。沿途补给点也从无到有——北高峰的售货亭、五云山的小卖部、贵人阁的自动售货机，都因标毅线的人气而出现。

2010年后，智能手机和户外APP（两步路、六只脚）的普及，让标毅线完成了从「口口相传」到「数字化轨迹」的跃迁。GPS轨迹共享使迷路风险大幅降低，更多人得以独立挑战。标毅线由此从老驴专属的训练场，蜕变为杭州户外圈的公共文化资产。「走过标毅，才算真正开始玩户外」——这句话浓缩了整个杭州户外圈的价值观。

---

## 二、四季景色：山脊线上的时间风景

标毅线的魅力，在于同一座山脊在四季轮转中呈现截然不同的面貌。

**春季（3-5月）** 是标毅线最绚烂的季节。灵峰探梅的暗香尚未散尽，十里琅珰两侧的龙井茶园已吐出嫩绿新芽。采茶人点缀在层层茶垄间，空气中弥漫着青涩的茶香。四月的山脊上杜鹃花成片绽放，粉白相间铺满山坡。此时气温宜人，是标毅线完赛率最高的季节。

**夏季（6-8月）** 的标毅线最具挑战性。高温高湿让二十五公里的路程变得更加艰难，但也赋予山脊线最浓郁的绿意。竹林遮天蔽日，树荫下凉风习习。清晨出发可避开正午烈日——从老和云起五点起步，赶到北高峰看日出是夏日限定体验。夏季暴雨后山涧溪流奔腾，但需注意石阶湿滑。

**秋季（9-11月）** 是公认的标毅线最佳季节。秋高气爽，能见度极佳，从北高峰可远眺钱塘江与萧山全貌。五云山腰的千年银杏披上金装，落叶铺满古道，是全程最出片的点位。十里琅珰两侧的茶园在秋日斜阳下泛着温暖的色调，山脊线上的芒草花穗在风中摇曳。

**冬季（12-2月）** 的标毅线游人稀少，却有别样的清净之美。落叶树褪去繁华，山脊视野比夏季开阔许多。雪后初晴时最为惊艳——西湖群山银装素裹，北高峰的灵顺寺在白雪映衬下更显古朴。冬季徒步需注意保暖和防滑，建议携带冰爪应对可能的冰雪路段。

---

## 三、特色地点：不可错过的沿途精华

标毅线沿途分布着多个具有独特价值的景点，各自承载着不同的历史与文化内涵。

**北高峰灵顺寺**（约5km，海拔314m）——山顶的灵顺寺始建于东晋咸和元年（公元326年），由印度高僧慧理禅师创建，距今已近1700年。寺内供奉五显财神，被誉为「天下第一财神庙」。每逢正月初五，上山步道人潮如织，除夕夜更有万人排队烧头香的盛况。登顶可360度俯瞰杭州——西湖如镜、钱塘如练、城市如画卷。

**十里琅珰**（约12-15km）——这条山脊古道的历史可追溯至南宋。古道蜿蜒于天竺山与五云山之间，全长约五公里。其名源于古时钱塘江畔的货郎——他们挑着扁担沿此道进城叫卖，扁担上的货铃叮当「琅珰」作响。如今两侧遍布龙井茶园，是全程最惬意的一段。

**五云山千年银杏**（约18km）——位于五云山山腰，树高二十余米，冠幅如华盖，树龄已逾千年。秋日金黄满枝时最为壮观，落叶可铺满整条古道。传说旧时山顶常有五色祥云缭绕，山因此得名。

**玉皇山八卦田**（约23km）——玉皇山是杭州城南制高点。山下的八卦田为南宋皇家籍田遗址，呈正八边形，按八卦方位分八块种植不同作物，形制完整，全国罕见。春种油菜、秋播小麦，四季各有不同景观。

**吴山大观**（终点，约25.4km）——石牌坊和「吴山天风」摩崖石刻是经典的完赛打卡点。山脚下即是河坊街和南宋御街，一碗片儿川或一笼小笼包，是一天跋涉后最好的犒赏。

---

## 四、路线特征：标毅线的独特价值

标毅线之所以从众多徒步路线中脱颖而出，在于它独特的多重属性。

**城市山径的典范。** 起点老和云起紧邻地铁3号线古荡站，终点吴山广场接通地铁1号线。全程无需自驾，城市公共交通即可完成「从地铁站到地铁站」的闭环穿越。这是全球范围内少有的、完全融入城市公共交通体系的长距离山径。

**历史文化的载体。** 二十五公里的山脊线上，分布着东晋古刹（灵顺寺）、南宋籍田（八卦田）、千年古道（十里琅珰）、古树名木（五云山银杏），以及众多摩崖石刻与历史遗迹。每走一公里，都在翻阅杭州千年的历史书页。

**体能测试的标尺。** 八小时完赛标准经过二十年的群体验证，具有高度的科学性和公平性——它不是精英门槛，却足以区分「散步」与「徒步」；它给予大多数尝试者正向反馈，同时保留了足够的挑战性。

**社群文化的纽带。** 杭州户外圈对这条路线有着强烈的集体认同。周末的山脊线上，素不相识的驴友会彼此点头致意，一句「今天几小时」是最自然的打招呼方式。这种自组织、去中心化的社群参与模式，正是标毅线生命力的核心来源。''',
        'waypoints': waypoints,
        'track': {
            'overview': [[round(c[0],6), round(c[1],6), round(c[2],1)] for c in simplified],
            'fullFile': 'xihu-biaoyi-track-full.json'
        }
    }

    out_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'china',
                            'zhejiang', 'hangzhou', 'xihu', 'xihu-biaoyi.json')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(trail_json, f, ensure_ascii=False, indent=2)

    print(f'Generated: {out_path}')
    print(f'Track coordinates: {len(track_coords)}')
    print(f'Waypoints: {len(waypoints)}')
    print(f'Overview points: {len(simplified)}')
    print(f'Total distance: {total_dist/1000:.1f} km')
    print(f'Total ascent: {total_ascent:.0f} m')
    print(f'Content sections: 4')

if __name__ == '__main__':
    main()