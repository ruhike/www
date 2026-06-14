#!/usr/bin/env python3
"""
Douglas-Peucker 轨迹抽稀工具
对轨迹坐标点进行抽稀预处理，生成精简的概览坐标。

算法原理：
  递归地找到距离首尾连线最远的点，若该距离超过阈值 epsilon 则保留该点
  并将轨迹分为两段递归处理；否则丢弃中间所有点。

用法：
  python simplify-track.py --input track-full.json --output overview.json [--full track-full.json] [--epsilon 0.0001] [--max-points 300]
"""

import json
import math
import sys
import os
import argparse


def perpendicular_distance(point, line_start, line_end):
    """计算点到线段的垂直距离（球面近似，适用于小范围经纬度）。

    Args:
        point:  [lat, lng, alt]
        line_start: [lat, lng, alt]
        line_end:   [lat, lng, alt]

    Returns:
        垂直距离（米）
    """
    lat, lng = point[0], point[1]
    lat1, lng1 = line_start[0], line_start[1]
    lat2, lng2 = line_end[0], line_end[1]

    # 将经纬度差转换为米（近似）
    def to_meters(dlat, dlng, ref_lat):
        dy = dlat * 111320.0
        dx = dlng * 111320.0 * math.cos(math.radians(ref_lat))
        return dx, dy

    dx, dy = to_meters(lat - lat1, lng - lng1, (lat + lat1) / 2)
    dx_seg, dy_seg = to_meters(lat2 - lat1, lng2 - lng1, (lat1 + lat2) / 2)

    seg_len_sq = dx_seg * dx_seg + dy_seg * dy_seg
    if seg_len_sq == 0:
        return math.sqrt(dx * dx + dy * dy)

    # 投影参数 t，限制在 [0, 1]
    t = max(0, min(1, (dx * dx_seg + dy * dy_seg) / seg_len_sq))

    proj_x = dx_seg * t
    proj_y = dy_seg * t

    return math.sqrt((dx - proj_x) ** 2 + (dy - proj_y) ** 2)


def douglas_peucker(points, epsilon, start_idx=0, end_idx=None):
    """Douglas-Peucker 递归抽稀算法。

    返回保留的点索引列表（有序）。
    """
    if end_idx is None:
        end_idx = len(points) - 1

    if end_idx <= start_idx + 1:
        return [start_idx, end_idx] if start_idx != end_idx else [start_idx]

    # 找到距离首尾连线最远的点
    max_dist = 0
    max_idx = start_idx

    start_pt = points[start_idx]
    end_pt = points[end_idx]

    for i in range(start_idx + 1, end_idx):
        dist = perpendicular_distance(points[i], start_pt, end_pt)
        if dist > max_dist:
            max_dist = dist
            max_idx = i

    if max_dist > epsilon:
        # 递归处理两段
        left = douglas_peucker(points, epsilon, start_idx, max_idx)
        right = douglas_peucker(points, epsilon, max_idx, end_idx)
        # 合并，去重分界点
        return left[:-1] + right
    else:
        return [start_idx, end_idx]


def iterative_douglas_peucker(points, epsilon, target_count):
    """迭代二分搜索合适 epsilon，使抽稀后点数接近 target_count。

    采用二分搜索在 epsilon 空间中寻找合适的阈值。
    """
    if len(points) <= target_count:
        return [points[i] for i in range(len(points))]

    # 估算 epsilon 上下界
    lo = 0.0
    hi = epsilon * 100  # 初始上界

    # 先扩展上界直到抽稀后点数足够少
    for _ in range(20):
        indices = douglas_peucker(points, hi)
        if len(indices) <= target_count:
            break
        hi *= 2
    else:
        # 即使很大 epsilon 也降不到目标点数，直接均匀采样
        step = max(1, (len(points) - 1) // (target_count - 1))
        sampled = [points[i] for i in range(0, len(points), step)]
        if sampled[-1] != points[-1]:
            sampled.append(points[-1])
        return sampled[:target_count]

    # 二分搜索
    best_indices = None
    for _ in range(30):
        mid = (lo + hi) / 2
        indices = douglas_peucker(points, mid)
        count = len(indices)
        if count <= target_count:
            best_indices = indices
            hi = mid
        else:
            lo = mid

    if best_indices is None:
        best_indices = douglas_peucker(points, hi)

    return [points[i] for i in best_indices]


def simplify_track(input_file, output_overview, output_full=None, epsilon=0.0001, max_points=300):
    """主处理函数：读取轨迹文件，抽稀并输出。

    Args:
        input_file:      输入 JSON 文件（轨迹坐标数组 [[lat,lng,alt], ...]）
        output_overview: 输出 overview JSON 文件路径
        output_full:     输出 full JSON 文件路径（可选，点数 > 500 时写入）
        epsilon:         抽稀精度（米，默认 0.0001 度 ≈ 10m）
        max_points:      目标最大点数（默认 300）
    """
    # 读取输入
    with open(input_file, 'r', encoding='utf-8') as f:
        track = json.load(f)

    if not isinstance(track, list) or len(track) == 0:
        print(f"错误：{input_file} 不是有效的轨迹坐标数组", file=sys.stderr)
        sys.exit(1)

    total_points = len(track)
    print(f"读取 {total_points} 个轨迹点")

    # 抽稀
    epsilon_meters = epsilon * 111320.0
    simplified = iterative_douglas_peucker(track, epsilon_meters, max_points)
    print(f"抽稀后: {len(simplified)} 个点 (epsilon={epsilon}, max_points={max_points})")

    # 写入 overview
    os.makedirs(os.path.dirname(output_overview) or '.', exist_ok=True)
    with open(output_overview, 'w', encoding='utf-8') as f:
        json.dump(simplified, f, ensure_ascii=False, separators=(',', ':'))
    print(f"Overview 已写入: {output_overview}")

    # 处理全量文件
    if total_points > 500:
        out_full = output_full or output_overview.replace('-overview', '-full')
        # 如果 output_full 没给，保持原样不覆盖
        if output_full:
            with open(out_full, 'w', encoding='utf-8') as f:
                json.dump(track, f, ensure_ascii=False, separators=(',', ':'))
            print(f"Full 已写入: {out_full}")
        return len(simplified), total_points, out_full if output_full else None
    else:
        # 不超 500 点，无全量文件
        return len(simplified), total_points, None


def main():
    parser = argparse.ArgumentParser(
        description='Douglas-Peucker 轨迹抽稀工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python simplify-track.py --input track.json --output overview.json
  python simplify-track.py --input track.json --output overview.json --full track-full.json --epsilon 0.00005 --max-points 200
        """
    )
    parser.add_argument('--input', '-i', required=True,
                        help='输入 JSON 文件路径（轨迹坐标数组）')
    parser.add_argument('--output', '-o', required=True,
                        help='输出 overview JSON 文件路径')
    parser.add_argument('--full', '-f', default=None,
                        help='输出 full JSON 文件路径（点数 > 500 时生成）')
    parser.add_argument('--epsilon', '-e', type=float, default=0.0001,
                        help='抽稀精度，单位：度（默认 0.0001，约 10 米）')
    parser.add_argument('--max-points', '-m', type=int, default=300,
                        help='目标最大点数（默认 300）')

    args = parser.parse_args()

    simplified_count, total_count, full_path = simplify_track(
        input_file=args.input,
        output_overview=args.output,
        output_full=args.full,
        epsilon=args.epsilon,
        max_points=args.max_points
    )

    print(f"\n完成! {total_count} → {simplified_count} 点 "
          f"({simplified_count / total_count * 100:.1f}%)")
    if full_path:
        print(f"全量轨迹: {full_path}")


if __name__ == '__main__':
    main()