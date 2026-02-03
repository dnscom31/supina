# app.py
import io
import numpy as np
import streamlit as st
from PIL import Image

import cv2

import mediapipe as mp
from mediapipe.python.solutions.face_mesh_connections import (
    FACEMESH_LEFT_EYEBROW,
    FACEMESH_RIGHT_EYEBROW,
)

# rembg는 "배경 제거"가 필요할 때만 사용 (투명 PNG면 생략 가능)
from rembg import remove as rembg_remove


st.set_page_config(page_title="Eyebrow Auto Composite", layout="wide")
st.title("눈썹 자동 추출 · 자동 정렬 · 자동 합성 (Streamlit MVP)")


def pil_to_bgr(pil: Image.Image) -> np.ndarray:
    rgb = np.array(pil.convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def pil_to_bgra(pil: Image.Image) -> np.ndarray:
    rgba = np.array(pil.convert("RGBA"))
    return cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA)


def bgr_to_pil(bgr: np.ndarray) -> Image.Image:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)


def bgra_to_pil(bgra: np.ndarray) -> Image.Image:
    rgba = cv2.cvtColor(bgra, cv2.COLOR_BGRA2RGBA)
    return Image.fromarray(rgba)


def eyebrow_indices_from_connections(connections) -> np.ndarray:
    # connections: set of tuples (i, j)
    idx = set()
    for a, b in connections:
        idx.add(a)
        idx.add(b)
    return np.array(sorted(idx), dtype=int)


LEFT_BROW_IDX = eyebrow_indices_from_connections(FACEMESH_LEFT_EYEBROW)
RIGHT_BROW_IDX = eyebrow_indices_from_connections(FACEMESH_RIGHT_EYEBROW)


def detect_eyebrow_polygons(face_bgr: np.ndarray):
    """
    return: dict { 'left': np.ndarray(N,2), 'right': np.ndarray(M,2) } in pixel coords
    """
    mp_face_mesh = mp.solutions.face_mesh

    h, w = face_bgr.shape[:2]
    face_rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)

    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,  # 눈/입 주변 개선
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

    # 폴리곤을 더 안정적으로 만들기 위해 convex hull 사용
    left_hull = cv2.convexHull(left_pts)
    right_hull = cv2.convexHull(right_pts)

    return {"left": left_hull, "right": right_hull}


def crop_with_mask(bgr: np.ndarray, poly: np.ndarray, pad: int = 20):
    """
    poly: (K,1,2) or (K,2)
    return: crop_bgr, crop_mask(0/255), bbox(x,y,w,h)
    """
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

    mask = np.zeros((bgr.shape[0], bgr.shape[1]), dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 255)
    crop_mask = mask[y0:y1, x0:x1].copy()

    return crop, crop_mask, (x0, y0, x1 - x0, y1 - y0)


def ensure_brow_rgba(upload_pil: Image.Image) -> np.ndarray:
    """
    업로드 눈썹 이미지에서 "눈썹만" 남긴 BGRA 반환
    - 이미 알파가 있으면 그대로 사용
    - 알파가 없으면 rembg로 배경 제거
    """
    rgba = np.array(upload_pil.convert("RGBA"))
    alpha = rgba[..., 3]
    has_alpha = np.any(alpha < 255)

    if has_alpha:
        # 이미 투명 정보가 있으면 rembg 생략
        bgra = cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA)
        return bgra

    # 알파가 전혀 없으면 rembg 적용 (PIL in/out)
    buf = io.BytesIO()
    upload_pil.convert("RGB").save(buf, format="PNG")
    out = rembg_remove(buf.getvalue())
    out_pil = Image.open(io.BytesIO(out)).convert("RGBA")
    out_rgba = np.array(out_pil)
    out_bgra = cv2.cvtColor(out_rgba, cv2.COLOR_RGBA2BGRA)
    return out_bgra


def fit_brow_to_target(brow_bgra: np.ndarray, target_mask: np.ndarray):
    """
    target_mask: 0/255, eyebrow ROI crop mask
    return: fitted_bgra same size as target crop (H,W,4)
    """
    th, tw = target_mask.shape[:2]

    # source mask from alpha
    src_alpha = brow_bgra[..., 3]
    src_bin = (src_alpha > 10).astype(np.uint8) * 255

    # source bbox
    x, y, w, h = cv2.boundingRect(cv2.findNonZero(src_bin))
    src_crop = brow_bgra[y:y+h, x:x+w].copy()
    src_bin_crop = src_bin[y:y+h, x:x+w].copy()

    # target bbox
    nz = cv2.findNonZero(target_mask)
    if nz is None:
        return None
    tx, ty, tw2, th2 = cv2.boundingRect(nz)

    # scale to match width (기본). 상황에 따라 height 기준/혼합도 가능.
    scale = (tw2 / max(1, w))
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))

    resized = cv2.resize(src_crop, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # place centered on target bbox center
    cx = tx + tw2 // 2
    cy = ty + th2 // 2

    out = np.zeros((th, tw, 4), dtype=np.uint8)
    x0 = int(cx - new_w // 2)
    y0 = int(cy - new_h // 2)

    # clip paste region
    px0 = max(0, x0)
    py0 = max(0, y0)
    px1 = min(tw, x0 + new_w)
    py1 = min(th, y0 + new_h)

    sx0 = px0 - x0
    sy0 = py0 - y0
    sx1 = sx0 + (px1 - px0)
    sy1 = sy0 + (py1 - py0)

    if px1 <= px0 or py1 <= py0:
        return None

    out[py0:py1, px0:px1] = resized[sy0:sy1, sx0:sx1]
    return out


def alpha_blend(dst_bgr: np.ndarray, src_bgra: np.ndarray, opacity: float = 1.0):
    """
    dst_bgr: (H,W,3)
    src_bgra: (H,W,4) already aligned
    """
    src_rgb = src_bgra[..., :3].astype(np.float32)
    src_a = (src_bgra[..., 3].astype(np.float32) / 255.0) * float(opacity)
    src_a = np.clip(src_a, 0.0, 1.0)

    dst = dst_bgr.astype(np.float32)
    out = dst * (1.0 - src_a[..., None]) + src_rgb * (src_a[..., None])
    return out.astype(np.uint8)


def seamless_clone(dst_bgr: np.ndarray, src_bgra: np.ndarray, center_xy):
    """
    OpenCV seamlessClone requires:
    - src: BGR
    - dst: BGR
    - mask: 0/255 single channel
    """
    src_bgr = src_bgra[..., :3]
    mask = (src_bgra[..., 3] > 10).astype(np.uint8) * 255
    cx, cy = center_xy
    blended = cv2.seamlessClone(src_bgr, dst_bgr, mask, (int(cx), int(cy)), cv2.NORMAL_CLONE)
    return blended


# ---------------- UI ----------------
col1, col2 = st.columns(2)

with col1:
    face_file = st.file_uploader("얼굴 이미지 업로드", type=["png", "jpg", "jpeg"])
with col2:
    brow_file = st.file_uploader("눈썹 이미지 업로드(스티커/그림/PNG)", type=["png", "jpg", "jpeg"])

mode = st.selectbox("합성 모드", ["알파 블렌딩", "SeamlessClone(포아송)"])
opacity = st.slider("알파 블렌딩 불투명도", 0.0, 1.0, 0.85, 0.01)

if face_file and brow_file:
    face_pil = Image.open(face_file)
    brow_pil = Image.open(brow_file)

    face_bgr = pil_to_bgr(face_pil)
    polys = detect_eyebrow_polygons(face_bgr)

    if polys is None:
        st.error("얼굴 랜드마크(눈썹)를 찾지 못했습니다. 정면 얼굴/선명한 사진으로 다시 시도해 주세요.")
        st.stop()

    brow_bgra = ensure_brow_rgba(brow_pil)

    # 결과 표시용
    result = face_bgr.copy()

    for side in ["left", "right"]:
        crop, crop_mask, (x, y, w, h) = crop_with_mask(face_bgr, polys[side], pad=25)

        fitted = fit_brow_to_target(brow_bgra, crop_mask)
        if fitted is None:
            continue

        if mode == "알파 블렌딩":
            blended_crop = alpha_blend(crop, fitted, opacity=opacity)
            result[y:y+h, x:x+w] = blended_crop
        else:
            # seamlessClone은 전체 이미지 기준 center가 필요하므로 좌표 보정
            nz = cv2.findNonZero(crop_mask)
            tx, ty, tw2, th2 = cv2.boundingRect(nz)
            cx = x + tx + tw2 // 2
            cy = y + ty + th2 // 2

            # fitted는 crop 크기이므로 전체 크기로 확장 후 clone
            full_src = np.zeros((result.shape[0], result.shape[1], 4), dtype=np.uint8)
            full_src[y:y+h, x:x+w] = fitted
            result = seamless_clone(result, full_src, (cx, cy))

    st.subheader("합성 결과")
    st.image(bgr_to_pil(result), use_container_width=True)

    st.subheader("디버그(눈썹 ROI)")
    debug = face_bgr.copy()
    cv2.polylines(debug, [polys["left"]], True, (0, 255, 0), 2)
    cv2.polylines(debug, [polys["right"]], True, (0, 255, 0), 2)
    st.image(bgr_to_pil(debug), use_container_width=True)
else:
    st.info("얼굴 이미지와 눈썹 이미지를 모두 업로드하면 자동 합성이 실행됩니다.")
