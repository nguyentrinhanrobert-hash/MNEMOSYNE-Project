from typing import Dict, List, Tuple, Optional

ALLOWED_INGREDIENTS = [
    "Bergamot",
    "White Tea",
    "Green Apple",
    "Lavender",
    "Geranium",
    "Sandalwood accord",
    "Vanilla accord",
    "Ethanol"
]

def validate_formula(
    formula: Optional[Dict[str, float]], 
    teacher_limits: Optional[Dict[str, Optional[float]]] = None
) -> Tuple[bool, List[str]]:
    """
    Kiểm tra công thức nước hoa dựa theo hợp đồng dữ liệu:
    1. Công thức không được None.
    2. Phải chứa đủ và đúng 8 nguyên liệu trong ALLOWED_INGREDIENTS.
    3. Giá trị phải là số hữu hạn, không âm.
    4. Ethanol = 80%.
    5. Tổng 7 nguyên liệu tạo hương = 20%.
    6. Tổng toàn bộ = 100%.
    """
    if formula is None:
        return True, []

    errors: List[str] = []

    # 1. Kiểm tra nguyên liệu lạ hoặc thiếu
    formula_keys = set(formula.keys())
    allowed_set = set(ALLOWED_INGREDIENTS)

    unknown_keys = formula_keys - allowed_set
    if unknown_keys:
        errors.append(f"Nguyên liệu không có trong dữ liệu: {', '.join(unknown_keys)}")

    missing_keys = allowed_set - formula_keys
    if missing_keys:
        errors.append(f"Thiếu nguyên liệu trong công thức: {', '.join(missing_keys)}")

    # 2. Kiểm tra tính hợp lệ của số
    for name, val in formula.items():
        if not isinstance(val, (int, float)) or val < 0:
            errors.append(f"Tỉ lệ không hợp lệ cho {name}: {val}")

    if errors:
        return False, errors

    # 3. Kiểm tra tỉ lệ Ethanol, Hương, Tổng
    total = sum(formula.values())
    ethanol = formula.get("Ethanol", 0.0)
    fragrance = total - ethanol

    if abs(total - 100.0) > 0.001:
        errors.append(f"Tổng phải bằng 100% (hiện {round(total, 3)}%).")

    if abs(fragrance - 20.0) > 0.001:
        errors.append(f"Tổng nguyên liệu tạo hương phải bằng 20% (hiện {round(fragrance, 3)}%).")

    if abs(ethanol - 80.0) > 0.001:
        errors.append(f"Ethanol phải bằng 80% (hiện {round(ethanol, 3)}%).")

    # 4. Kiểm tra giới hạn GV (nếu có)
    if teacher_limits:
        for name, limit in teacher_limits.items():
            if limit is not None and formula.get(name, 0.0) > limit:
                errors.append(f"{name} vượt giới hạn GV ({limit}%).")

    return len(errors) == 0, errors