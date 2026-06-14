# -*- coding: utf-8 -*-
"""处理上海浦东世纪公园 KML → 生成 trail JSON"""
import xml.etree.ElementTree as ET
import json, math, re, os

KML_PATH = os.path.join(os.path.dirname(__file__), '..', 'kml', '中国上海浦东世纪公园.kml')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'china', 'shanghai', 'pudong')
OUT_PATH = os.path.join(OUT_DIR, 'shiji-gongyuan.json')

NS = {
    'kml': 'http://www.opengis.net/kml/2.2',
    'gx': 'http://www.google.com/kml/ext/2.2',
}

# ---- 工具函数 ----
def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    dLat = math.radians(lat2 - lat1)
    dLng = math.radians(lng2 - lng1)
    a = math.sin(dLat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dLng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def douglas_peucker(points, epsilon=0.5):
    if len(points) <= 2:
        return points
    dmax = 0
    idx = 0
    end = len(points) - 1
    for i in range(1, end):
        d = perpendicular_dist(points[i], points[0], points[end])
        if d > dmax:
            dmax = d
            idx = i
    if dmax > epsilon:
        left = douglas_peucker(points[:idx+1], epsilon)
        right = douglas_peucker(points[idx:], epsilon)
        return left[:-1] + right
    return [points[0], points[end]]

def perpendicular_dist(p, a, b):
    """点到线段 ab 的距离"""
    if a == b:
        return math.sqrt((p[0]-a[0])**2 + (p[1]-a[1])**2)
    lat_a, lng_a = a
    lat_b, lng_b = b
    lat_p, lng_p = p
    # 近似投影
    dx = lng_b - lng_a
    dy = lat_b - lat_a
    if dx == 0 and dy == 0:
        return math.sqrt((lat_p-lat_a)**2 + (lng_p-lng_a)**2)
    t = max(0, min(1, ((lng_p-lng_a)*dx + (lat_p-lat_a)*dy) / (dx*dx + dy*dy)))
    proj_lat = lat_a + t * dy
    proj_lng = lng_a + t * dx
    return math.sqrt((lat_p-proj_lat)**2 + (lng_p-proj_lng)**2)

def strip_html(text):
    if not text:
        return ''
    text = re.sub(r'<div[^>]*>.*?</div>', '', text, flags=re.DOTALL)
    text = re.sub(r'<br\s*/?>', ' ', text)
    text = re.sub(r'<[^>]+>', '', text)
    return text.strip()

# ---- 解析 KML ----
tree = ET.parse(KML_PATH)
root = tree.getroot()

# 提取途经点
waypoints = []
for pm in root.findall('.//kml:Placemark', NS):
    name_el = pm.find('kml:name', NS)
    if name_el is None:
        continue
    name_text = name_el.text or ''
    # 跳过轨迹和标注点文件夹
    if name_text in ('轨迹', '标注点', '起点', '终点'):
        continue
    # 获取坐标
    point = pm.find('.//kml:Point/kml:coordinates', NS)
    if point is None:
        continue
    coord_text = point.text.strip()
    parts = coord_text.split(',')
    if len(parts) < 2:
        continue
    lng, lat = float(parts[0]), float(parts[1])
    alt = float(parts[2]) if len(parts) > 2 else 0
    # 获取描述
    desc_el = pm.find('kml:description', NS)
    desc = strip_html(desc_el.text) if desc_el is not None and desc_el.text else ''
    # 从 ExtendedData 获取精确坐标
    ext = pm.find('kml:ExtendedData', NS)
    if ext is not None:
        for data in ext.findall('kml:Data', NS):
            data_name = data.get('name', '')
            val = data.find('kml:value', NS)
            if val is not None and val.text:
                if data_name == 'Longtitude':
                    lng = float(val.text)
                elif data_name == 'Latitude':
                    lat = float(val.text)
                elif data_name == 'Altitude':
                    alt = float(val.text)
    waypoints.append({
        'name': name_text,
        'description': desc or name_text,
        'lat': lat,
        'lng': lng,
        'altitude': round(alt, 1),
    })

# 提取轨迹坐标
track_coords = []
for coord in root.findall('.//gx:Track/gx:coord', NS):
    if coord.text:
        parts = coord.text.strip().split()
        if len(parts) >= 3:
            lng, lat, alt = float(parts[0]), float(parts[1]), float(parts[2])
            track_coords.append((lat, lng, alt))

print(f'Waypoints: {len(waypoints)}')
print(f'Track points: {len(track_coords)}')

# ---- 计算里程 ----
total_dist = 0
elevation_gain = 0
elevation_loss = 0
max_alt = -9999
min_alt = 9999

for i in range(1, len(track_coords)):
    lat1, lng1, alt1 = track_coords[i-1]
    lat2, lng2, alt2 = track_coords[i]
    total_dist += haversine(lat1, lng1, lat2, lng2)
    if alt2 > alt1:
        elevation_gain += alt2 - alt1
    else:
        elevation_loss += alt1 - alt2
    if alt2 > max_alt:
        max_alt = alt2
    if alt2 < min_alt:
        min_alt = alt2

total_dist_km = total_dist / 1000
print(f'Distance: {total_dist_km:.2f} km')
print(f'Ascent: {elevation_gain:.0f} m, Descent: {elevation_loss:.0f} m')
print(f'Altitude: {min_alt:.0f} ~ {max_alt:.0f} m')

# ---- 计算途经点里程 ----
for wp in waypoints:
    min_dist = float('inf')
    for tc in track_coords:
        d = haversine(wp['lat'], wp['lng'], tc[0], tc[1])
        if d < min_dist:
            min_dist = d
    wp['distanceFromStart'] = round(min_dist / 1000, 2)

# ---- 生成 overview（抽稀） ----
overview = douglas_peucker([(t[0], t[1]) for t in track_coords], epsilon=0.0001)
print(f'Overview points: {len(overview)}')

# ---- 生成 full track（每5个点取1个） ----
full_track = track_coords[::5]

# ---- 构建 JSON ----
trail = {
    "slug": "shiji-gongyuan",
    "name": "上海浦东世纪公园",
    "nameEn": "Shanghai Century Park",
    "continent": "asia",
    "country": "china",
    "province": "shanghai",
    "city": "shanghai",
    "district": "pudong",
    "difficulty": 1,
    "distance": round(total_dist_km, 1),
    "ascent": round(elevation_gain),
    "descent": round(elevation_loss),
    "duration": "1-2小时",
    "maxAltitude": round(max_alt),
    "minAltitude": round(min_alt),
    "tags": [
        "上海",
        "浦东",
        "世纪公园",
        "城市公园",
        "休闲徒步",
        "亲子",
        "跑步",
        "环形路线"
    ],
    "feature": "上海市中心最大的城市生态公园，环湖步道绿树成荫，适合休闲徒步与亲子出游。",
    "fameReason": "",
    "history": "",
    "story": "",
    "track": {
        "overview": [[round(t[0], 6), round(t[1], 6)] for t in overview],
        "full": [[round(t[0], 6), round(t[1], 6), round(t[2], 1)] for t in full_track]
    },
    "waypoints": waypoints,
}

# ---- 写入文件 ----
os.makedirs(OUT_DIR, exist_ok=True)
with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(trail, f, ensure_ascii=False, indent=2)

print(f'\nDone! Written to {OUT_PATH}')