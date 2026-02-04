# app.py
import io
import uuid
import numpy as np
import streamlit as st
from PIL import Image

import cv2
import mediapipe as mp
from mediapipe.python.solutions.face_mesh_connections import (
    FACEMESH_LEFT_EYEBROW,
    FACEMESH_RIGHT_EYEBROW,
)

from rembg import remove as rembg_remove


st.set_page_config(page_title="Eyebrow Makeup Composer", layout="wide")
st.title("눈썹 자동 정렬 · 메이크업 합성 (좌/우 각각 업로드)")

# ----------------- Utils -----------------
def pil_to_bgr(pil: Image.Image) -> np.ndarray:
    rgb = np.array(pil.convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

def bgr_to_pil(bgr: np.ndarray) -> Image.Image:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)

def ensure_rgba_pil(pil: Image.Image) -> Image.Image:
    return pil.convert("RGBA")

def rgba_pil_to_bgra(pil: Image.Image) -> np.ndarray:
    rgba = np.array(pil.convert("RGBA"))
    return cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA)

def eyebrow_indices_from_connections(connections) -> np.ndarray:
    idx = set()
    for a, b in connections:
        idx.add(a); idx.add(b)
    return np.array(sorted(idx), dtype=int)

LEFT_BROW_IDX = eyebrow_indices_from_connections(FACEMESH_LEFT_EYEBROW)
RIGHT_BROW_IDX = eyebrow_indices_from_connections(FACEMESH_RIGHT_EYEBROW)

def detect_eyebrow_polygons(face_bgr: np.ndarray):
    mp_face_mesh = mp.solutions.face_mesh
    h, w = face_bgr.shape[:2]
    face_rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)

    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
    ) as fm:
        res = fm.process(face_rgb)

    if not res.multi_face_landmarks:
        return None

    lm = res.multi_face_landmarks[0].landmark

    def to_xy(idx_arr):
        pts = []
        for i in idx_arr:
            x = int(lm[i].x * w)
            y = int(lm[i].y * h)
            pts.append([x, y])
        return np.array(pts, dtype=np.int32)

    left_pts = to_xy(LEFT_BROW_IDX)
    right_pts = to_xy(RIGHT_BROW_IDX)

    left_hull = cv2.convexHull(left_pts)
    right_hull = cv2.convexHull(right_pts)

    return {"left": left_hull, "right": right_hull}

def crop_with_poly_mask(bgr: np.ndarray, poly: np.ndarray, pad: int = 25):
    if poly.ndim == 3:
        pts = poly[:, 0, :]
    else:
        pts = poly

    x, y, w, h = cv2.boundingRect(pts)
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(bgr.shape[1], x + w + pad)
    y1 = min(bgr.shape[0], y + h + pad)

    crop = bgr[y0:y1, x0:x1].copy()

    mask_full = np.zeros((bgr.shape[0], bgr.shape[1]), dtype=np.uint8)
    cv2.fillPoly(mask_full, [pts], 255)
    crop_mask = mask_full[y0:y1, x0:x1].copy()

    return crop, crop_mask, (x0, y0, x1 - x0, y1 - y0)

def remove_bg_if_needed(upload_pil: Image.Image) -> np.ndarray:
    """
    return BGRA. If no alpha exists, use rembg to create alpha.
    """
    pil_rgba = ensure_rgba_pil(upload_pil)
    rgba = np.array(pil_rgba)
    alpha = rgba[..., 3]
    has_alpha = np.any(alpha < 255)

    if has_alpha:
        return cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA)

    buf = io.BytesIO()
    upload_pil.convert("RGB").save(buf, format="PNG")
    out = rembg_remove(buf.getvalue())
    out_pil = Image.open(io.BytesIO(out)).convert("RGBA")
    out_rgba = np.array(out_pil)
    return cv2.cvtColor(out_rgba, cv2.COLOR_RGBA2BGRA)

def pca_angle_from_mask(mask_255: np.ndarray) -> float:
    """
    mask_255: single channel 0/255
    return angle in degrees (principal axis)
    """
    pts = cv2.findNonZero(mask_255)
    if pts is None or len(pts) < 20:
        return 0.0
    pts2 = pts.reshape(-1, 2).astype(np.float32)
    mean = np.mean(pts2, axis=0)
    cov = np.cov((pts2 - mean).T)
    eigvals, eigvecs = np.linalg.eig(cov)
    v = eigvecs[:, np.argmax(eigvals)]
    angle = float(np.degrees(np.arctan2(v[1], v[0])))
    return angle

def rotate_bgra_around_center(bgra: np.ndarray, angle_deg: float) -> np.ndarray:
    h, w = bgra.shape[:2]
    center = (w / 2.0, h / 2.0)
    M = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    out = cv2.warpAffine(bgra, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))
    return out

def fit_brow_to_target(brow_bgra: np.ndarray, target_mask: np.ndarray):
    """
    target_mask: 0/255 ROI mask in crop
    return fitted_bgra (same size as crop), plus center for debug
    """
    H, W = target_mask.shape[:2]

    src_a = brow_bgra[..., 3]
    src_mask = (src_a > 10).astype(np.uint8) * 255
    nz = cv2.findNonZero(src_mask)
    if nz is None:
        return None

    x, y, w, h = cv2.boundingRect(nz)
    src_crop = brow_bgra[y:y+h, x:x+w].copy()
    src_mask_crop = src_mask[y:y+h, x:x+w].copy()

    # Target bbox
    t_nz = cv2.findNonZero(target_mask)
    if t_nz is None:
        return None
    tx, ty, tw, th = cv2.boundingRect(t_nz)

    # Scale based on width
    scale = tw / max(1, w)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))

    resized = cv2.resize(src_crop, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # place centered
    cx = tx + tw // 2
    cy = ty + th // 2

    out = np.zeros((H, W, 4), dtype=np.uint8)

    x0 = int(cx - new_w // 2)
    y0 = int(cy - new_h // 2)
    px0 = max(0, x0); py0 = max(0, y0)
    px1 = min(W, x0 + new_w); py1 = min(H, y0 + new_h)

    sx0 = px0 - x0; sy0 = py0 - y0
    sx1 = sx0 + (px1 - px0); sy1 = sy0 + (py1 - py0)

    if px1 <= px0 or py1 <= py0:
        return None

    out[py0:py1, px0:px1] = resized[sy0:sy1, sx0:sx1]
    return out

def feather_alpha(bgra: np.ndarray, ksize: int = 9) -> np.ndarray:
    """
    soften edges: blur alpha channel only
    """
    out = bgra.copy()
    a = out[..., 3]
    a_blur = cv2.GaussianBlur(a, (ksize, ksize), 0)
    out[..., 3] = a_blur
    return out

def weaken_original_brow(crop_bgr: np.ndarray, crop_mask: np.ndarray, method: str = "inpaint") -> np.ndarray:
    """
    메이크업 느낌: 원본 눈썹을 살짝 죽이고 새 눈썹을 얹음
    """
    mask = crop_mask.copy()
    kernel = np.ones((9, 9), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=1)

    if method == "blur":
        blurred = cv2.bilateralFilter(crop_bgr, 9, 75, 75)
        # mask 영역만 blend
        m = (mask.astype(np.float32) / 255.0)[..., None]
        out = (crop_bgr.astype(np.float32) * (1 - m) + blurred.astype(np.float32) * m).astype(np.uint8)
        return out

    # inpaint (기본)
    return cv2.inpaint(crop_bgr, mask, 3, cv2.INPAINT_TELEA)

def hsv_match_to_roi(src_bgra: np.ndarray, roi_bgr: np.ndarray, roi_mask: np.ndarray, strength: float = 0.6) -> np.ndarray:
    """
    아주 단순한 '자연스러움'용 색/명도 매칭:
    - ROI 내부 평균 V(밝기), S(채도)를 기준으로 src 눈썹의 V,S를 당김
    """
    out = src_bgra.copy()
    src_bgr = out[..., :3]
    src_a = out[..., 3]

    # ROI 평균 HSV (마스크 영역)
    roi_hsv = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    m = (roi_mask > 0)
    if np.count_nonzero(m) < 50:
        return out

    roi_S = float(np.mean(roi_hsv[..., 1][m]))
    roi_V = float(np.mean(roi_hsv[..., 2][m]))

    src_hsv = cv2.cvtColor(src_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    src_mask = (src_a > 10)

    if np.count_nonzero(src_mask) < 20:
        return out

    s = src_hsv[..., 1]
    v = src_hsv[..., 2]

    # move towards roi mean
    s[src_mask] = s[src_mask] * (1 - strength) + roi_S * strength
    v[src_mask] = v[src_mask] * (1 - strength) + roi_V * strength

    src_hsv[..., 1] = np.clip(s, 0, 255)
    src_hsv[..., 2] = np.clip(v, 0, 255)

    new_bgr = cv2.cvtColor(src_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    out[..., :3] = new_bgr
    return out

def alpha_blend(dst_bgr: np.ndarray, src_bgra: np.ndarray, opacity: float = 0.9) -> np.ndarray:
    src_rgb = src_bgra[..., :3].astype(np.float32)
    src_a = (src_bgra[..., 3].astype(np.float32) / 255.0) * float(opacity)
    src_a = np.clip(src_a, 0.0, 1.0)

    dst = dst_bgr.astype(np.float32)
    out = dst * (1.0 - src_a[..., None]) + src_rgb * (src_a[..., None])
    return out.astype(np.uint8)

def encode_png_bytes(bgr: np.ndarray) -> bytes:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return buf.getvalue()

# ----------------- UI -----------------
c1, c2, c3 = st.columns(3)
with c1:
    face_file = st.file_uploader("얼굴 이미지 업로드", type=["png", "jpg", "jpeg"])
with c2:
    brow_left_file = st.file_uploader("좌(왼쪽) 눈썹 이미지 업로드", type=["png", "jpg", "jpeg"])
with c3:
    brow_right_file = st.file_uploader("우(오른쪽) 눈썹 이미지 업로드", type=["png", "jpg", "jpeg"])

st.divider()

mode = st.selectbox("합성 방식", ["알파 블렌딩(추천: 안정적)", "SeamlessClone(더 자연스러울 수 있음)"])
opacity = st.slider("합성 강도(불투명도)", 0.0, 1.0, 0.88, 0.01)
feather = st.slider("가장자리 부드러움(Feather)", 1, 31, 11, 2)
weaken_method = st.selectbox("원본 눈썹 약화 방식", ["inpaint", "blur"])
color_strength = st.slider("색/명도 자동 매칭 강도", 0.0, 1.0, 0.6, 0.05)

if not (face_file and brow_left_file and brow_right_file):
    st.info("얼굴 + 좌눈썹 + 우눈썹을 모두 업로드하면 자동 합성이 실행됩니다.")
    st.stop()

# Load
face_pil = Image.open(face_file)
left_pil = Image.open(brow_left_file)
right_pil = Image.open(brow_right_file)

face_bgr = pil_to_bgr(face_pil)
polys = detect_eyebrow_polygons(face_bgr)

if polys is None:
    st.error("얼굴에서 눈썹 랜드마크를 찾지 못했습니다. 정면/선명한 사진으로 다시 시도해 주세요.")
    st.stop()

left_bgra = remove_bg_if_needed(left_pil)
right_bgra = remove_bg_if_needed(right_pil)

# Process
result = face_bgr.copy()
debug = face_bgr.copy()

for side, brow_bgra in [("left", left_bgra), ("right", right_bgra)]:
    crop, crop_mask, (x, y, w, h) = crop_with_poly_mask(result, polys[side], pad=25)

    # 1) 원본 눈썹 약화
    base_crop = weaken_original_brow(crop, crop_mask, method=weaken_method)

    # 2) 회전 정렬
    target_angle = pca_angle_from_mask(crop_mask)
    brow_alpha = (brow_bgra[..., 3] > 10).astype(np.uint8) * 255
    src_angle = pca_angle_from_mask(brow_alpha)
    rotate_deg = target_angle - src_angle
    brow_rot = rotate_bgra_around_center(brow_bgra, rotate_deg)

    # 3) 크기/위치 맞춤
    fitted = fit_brow_to_target(brow_rot, crop_mask)
    if fitted is None:
        continue

    # 4) 색/명도 자동 매칭
    fitted = hsv_match_to_roi(fitted, base_crop, crop_mask, strength=color_strength)

    # 5) 가장자리 부드럽게
    fitted = feather_alpha(fitted, ksize=max(1, feather | 1))  # odd

    # 6) 합성
    if mode.startswith("알파"):
        out_crop = alpha_blend(base_crop, fitted, opacity=opacity)
        result[y:y+h, x:x+w] = out_crop
    else:
        # SeamlessClone은 전체 이미지 기준이 편함: 전체 크기 src 만들기
        full_src = np.zeros((result.shape[0], result.shape[1], 4), dtype=np.uint8)
        full_src[y:y+h, x:x+w] = fitted

        src_bgr = full_src[..., :3]
        src_mask = (full_src[..., 3] > 10).astype(np.uint8) * 255

        # center: ROI bbox center
        nz = cv2.findNonZero(src_mask)
        if nz is not None:
            tx, ty, tw, th = cv2.boundingRect(nz)
            cx = tx + tw // 2
            cy = ty + th // 2
            result = cv2.seamlessClone(src_bgr, result, src_mask, (int(cx), int(cy)), cv2.NORMAL_CLONE)

    # debug ROI
    cv2.polylines(debug, [polys[side]], True, (0, 255, 0), 2)

# Display
left_col, right_col = st.columns(2)
with left_col:
    st.subheader("합성 결과")
    st.image(bgr_to_pil(result), use_container_width=True)

with right_col:
    st.subheader("디버그(검출된 눈썹 ROI)")
    st.image(bgr_to_pil(debug), use_container_width=True)

# Download (저장 보완 A)
png_bytes = encode_png_bytes(result)
st.download_button(
    "결과 PNG 다운로드",
    data=png_bytes,
    file_name=f"eyebrow_result_{uuid.uuid4().hex[:8]}.png",
    mime="image/png",
)
