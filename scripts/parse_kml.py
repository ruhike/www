#!/usr/bin/env python3
"""
KML 解析工具：从 2bulu 格式 KML 文件提取轨迹坐标和标注点，生成路线 JSON
"""
import xml.etree.ElementTree as ET
import json
import os
import sys
import re
import math

NS = {
    'kml': 'http://www.opengis.net/kml/2.2',
    'gx': 'http://www.google.com/kml/ext/2.2'
}

def douglas_peucker(points, epsilon):
    """Douglas-Peucker 抽稀算法"""
    if len(points) <= 2:
        return points

    max_dist = 0
    max_idx = 0
    start = points[0][:2]
    end = points[-1][:2]

    for i in range(1, len(points) - 1):
        d = perpendicular_dist(points[i][:2], start, end)
        if d > max_dist:
            max_dist = d
            max_idx = i

    if max_dist > epsilon:
        left = douglas_peucker(points[:max_idx + 1], epsilon)
        right = douglas_peucker(points[max_idx:], epsilon)
        return left[:-1] + right
    else:
        return [points[0], points[-1]]

def perpendicular_dist(point, line_start, line_end):
    """点到线段的垂直距离（经纬度近似）"""
    x0, y0 = point
    x1, y1 = line_start
    x2, y2 = line_end
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x0 - x1, y0 - y1)
    t = ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t))
    px = x1 + t * dx
    py = y1 + t * dy
    return math.hypot(x0 - px, y0 - py)

def parse_kml(filepath):
    """解析 KML 文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 注册命名空间
    for prefix, uri in NS.items():
        ET.register_namespace(prefix, uri)

    root = ET.fromstring(content)

    # 提取文档名称和描述
    doc = root.find('.//kml:Document', NS)
    doc_name = ''
    doc_desc = ''
    if doc is not None:
        name_el = doc.find('kml:name', NS)
        if name_el is not None and name_el.text:
            doc_name = name_el.text.strip()
        desc_el = doc.find('kml:description', NS)
        if desc_el is not None and desc_el.text:
            doc_desc = desc_el.text.strip()

    # 提取轨迹坐标（gx:Track 中的 gx:coord）
    track_coords = []
    for coord_el in root.iter('{http://www.google.com/kml/ext/2.2}coord'):
        text = coord_el.text.strip()
        parts = text.split()
        if len(parts) >= 3:
            lng = float(parts[0])
            lat = float(parts[1])
            alt = float(parts[2])
            track_coords.append([lat, lng, alt])

    # 提取标注点（Placemark 中的 Point）
    waypoints = []
    for pm in root.iter('{http://www.opengis.net/kml/2.2}Placemark'):
        name_el = pm.find('kml:name', NS)
        point_el = pm.find('.//kml:Point', NS)
        if name_el is not None and point_el is not None:
            name = name_el.text.strip() if name_el.text else ''
            coord_el = point_el.find('kml:coordinates', NS)
            if coord_el is not None and coord_el.text:
                parts = coord_el.text.strip().split(',')
                if len(parts) >= 3:
                    lng = float(parts[0])
                    lat = float(parts[1])
                    alt = float(parts[2])
                    if name and name not in ('标注点', '起点', '终点', '轨迹'):
                        waypoints.append({
                            'name': name,
                            'lat': lat,
                            'lng': lng,
                            'altitude': alt
                        })

    return {
        'name': doc_name,
        'description': doc_desc,
        'track_coords': track_coords,
        'waypoints': waypoints
    }

def calc_distance(lat1, lng1, lat2, lng2):
    """Haversine 距离计算（米）"""
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def gen_waypoint_info(wp, track_coords):
    """根据途经点坐标估算距离起点距离"""
    wp_lat = wp['lat']
    wp_lng = wp['lng']
    cumulative = 0.0
    for i in range(1, len(track_coords)):
        cumulative += calc_distance(track_coords[i-1][0], track_coords[i-1][1],
                                     track_coords[i][0], track_coords[i][1])
        if abs(track_coords[i][0] - wp_lat) < 0.0005 and abs(track_coords[i][1] - wp_lng) < 0.0005:
            return round(cumulative / 1000, 2)
    return 0.0

def main():
    if len(sys.argv) < 2:
        print("Usage: python parse_kml.py <kml_file>")
        print("       python parse_kml.py <kml_file> --output <output_json>")
        sys.exit(1)

    kml_file = sys.argv[1]
    output_file = None
    if len(sys.argv) >= 4 and sys.argv[2] == '--output':
        output_file = sys.argv[3]

    data = parse_kml(kml_file)
    track_coords = data['track_coords']
    waypoints = data['waypoints']
    name = data['name']
    desc = data['description']

    print(f"路线名称: {name}")
    print(f"轨迹坐标点数: {len(track_coords)}")
    print(f"标注点数量: {len(waypoints)}")

    if len(track_coords) == 0:
        print("错误: 未找到轨迹坐标")
        sys.exit(1)

    # 计算总距离和累计爬升
    total_dist = 0.0
    total_ascent = 0.0
    total_descent = 0.0
    max_alt = 0
    min_alt = float('inf')

    for i in range(1, len(track_coords)):
        prev = track_coords[i-1]
        curr = track_coords[i]
        total_dist += calc_distance(prev[0], prev[1], curr[0], curr[1])
        alt_diff = curr[2] - prev[2]
        if alt_diff > 0:
            total_ascent += alt_diff
        else:
            total_descent += abs(alt_diff)
        max_alt = max(max_alt, curr[2])
        min_alt = min(min_alt, curr[2])

    if min_alt == float('inf'):
        min_alt = 0

    print(f"总距离: {total_dist/1000:.1f} km")
    print(f"累计爬升: {total_ascent:.0f} m")
    print(f"累计下降: {total_descent:.0f} m")
    print(f"最高海拔: {max_alt:.0f} m")
    print(f"最低海拔: {min_alt:.0f} m")

    # 抽稀: 500 点阈值
    epsilon = 0.0001  # 约 10m
    if len(track_coords) > 500:
        print(f"坐标点数超过500，执行 Douglas-Peucker 抽稀...")
        simplified = douglas_peucker(track_coords, epsilon)
        print(f"抽稀后点数: {len(simplified)}")
    else:
        simplified = track_coords
        print(f"坐标点数未超500，无需抽稀")

    # 构建途经点列表
    waypoints_out = []
    for i, wp in enumerate(waypoints):
        dist_from_start = gen_waypoint_info(wp, track_coords)
        waypoints_out.append({
            'name': wp['name'],
            'description': '',
            'altitude': round(wp['altitude']),
            'surface': 'mixed',
            'distanceFromStart': dist_from_start
        })

    # 如果无标注点，用起点和终点补充
    if len(waypoints_out) == 0:
        waypoints_out.append({
            'name': '起点',
            'description': '徒步起点',
            'altitude': round(track_coords[0][2]),
            'surface': 'paved',
            'distanceFromStart': 0
        })
        waypoints_out.append({
            'name': '终点',
            'description': '徒步终点',
            'altitude': round(track_coords[-1][2]),
            'surface': 'paved',
            'distanceFromStart': round(total_dist / 1000, 2)
        })

    # 构建路线 JSON
    trail_json = {
        'slug': 'xihu-biaoyi',
        'name': name or '西湖标毅线',
        'nameEn': 'West Lake Biaoyi Trail',
        'continent': 'asia',
        'country': 'china',
        'province': 'zhejiang',
        'city': 'hangzhou',
        'district': 'xihu',
        'difficulty': 5,
        'distance': round(total_dist / 1000, 1),
        'ascent': round(total_ascent),
        'descent': round(total_descent),
        'duration': '1天',
        'maxAltitude': round(max_alt),
        'minAltitude': round(min_alt),
        'tags': ['西湖', '杭州', '城市徒步', '群山', '经典', '财神庙', '北高峰'],
        'feature': desc[:100] if desc else '杭州西湖群山最经典徒步路线，连接20余座山丘',
        'fameReason': '西湖标毅线是杭州西湖群山最热门、最经典的徒步线路，吸引着大批江浙沪驴友。',
        'history': desc if desc else '西湖标毅线是杭州西湖群山最热门、最经典的徒步线路，起点老和云起，终点吴山大观，全程串联西湖周边20余座山丘。',
        'story': desc if desc else '西湖标毅线全程25公里，爬升1600米左右。路线以石阶游步道为主，串联部分山林土路。途经北高峰、财神庙、美人峰、十里琅珰等景点，西湖周边山城景色一览无余。',
        'waypoints': waypoints_out,
        'track': {
            'overview': [[round(c[0], 6), round(c[1], 6), round(c[2], 1)] for c in simplified],
            'fullFile': 'xihu-biaoyi-track-full.json' if len(track_coords) > 500 else None
        }
    }

    # 输出 JSON
    if output_file:
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(trail_json, f, ensure_ascii=False, indent=2)
        print(f"路线 JSON 已保存到: {output_file}")

        # 生成全量轨迹文件
        if len(track_coords) > 500:
            full_dir = os.path.dirname(output_file)
            full_file = os.path.join(full_dir, 'xihu-biaoyi-track-full.json')
            full_coords = [[round(c[0], 6), round(c[1], 6), round(c[2], 1)] for c in track_coords]
            with open(full_file, 'w', encoding='utf-8') as f:
                json.dump(full_coords, f)
            print(f"全量轨迹已保存到: {full_file}")
    else:
        print(json.dumps(trail_json, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()