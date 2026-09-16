/* Paths lifted verbatim from the hand-drawn exports "TUNE.svg" (small) and
   "MODULATION MIX.svg" (large). Only the grouping and the colour references are
   ours — do not redraw them.

   Both exports share one tick geometry: centre (53, 65), spokes to radius 39 at
   every 30 degrees from -150 to +150, so the sweep is 300 degrees. They differ
   only in how big the scalloped body is and how far out its indicator dot sits.

   Each export is drawn at a particular angle, recorded here as bakedAngle, so
   rendering a value rotates the body group by (angle - bakedAngle) and no path is
   re-drawn. TUNE happens to be drawn at 0 with its dot straight up; MODULATION
   MIX at its maximum, which is why its cap reads 10. */

export const CENTRE = { x: 53, y: 65 } as const

/* Measured off the spoke endpoints in the exports rather than assumed. */
export const SWEEP_START = -150
export const SWEEP_END = 150
export const TICK_OUTER = 39
export const TICK_INNER = 30
export const LABEL_RADIUS = 50

/* Square, centred on the knob, with room for the printed numerals. */
export const VIEWBOX = { x: -5, y: 7, width: 116, height: 116 } as const

export const CAP_RADIUS = 19

/* Both exports draw the knob at the same scale — measured, their bodies are
   60.6 and 60.5 units across — so a bigger knob cannot come from the artwork.
   It is a render scale instead: the same paths drawn larger, which is what the
   panel does, where the oscillator frequency knobs are physically bigger than
   the levels around them. */
export const SIZE_SCALE: Record<KnobSize, number> = {
  small: 1,
  large: 1.3,
}

export interface KnobArtwork {
  readonly body: string
  readonly indicatorRadius: number
  readonly bakedAngle: number
}

export const knobSizes = {
  small: {
    body:
      "M53 36C55.0187 36 56.5742 36.9378 57.6562 38.3184C59.0699 40.1222 61.5203 41.877 64.3721 43.2246C67.2106 44.5659 70.2242 45.3985 72.6143 45.5254C74.2599 45.6128 75.7978 46.3091 76.9463 47.7813C78.3311 49.5563 78.4668 51.5657 77.918 53.4102C77.2824 55.5458 77.3346 58.4729 78.0215 61.4336C78.707 64.3881 79.9591 67.0955 81.4424 68.8203C82.6622 70.2389 83.3193 72.0672 82.8457 74.1885C82.4096 76.1415 81.205 77.4759 79.6426 78.2578C77.5414 79.3092 75.192 81.2881 73.252 83.6768C71.3018 86.0779 69.9383 88.6794 69.5605 90.8799C69.2434 92.7278 68.2584 94.4231 66.2969 95.3887C64.6144 96.2168 62.9203 96.1528 61.4033 95.499C59.2304 94.5625 56.1735 94.0469 53 94.0469C49.8265 94.0469 46.7696 94.5625 44.5967 95.499C43.0797 96.1528 41.3856 96.2168 39.7031 95.3887C37.7416 94.4231 36.7566 92.7278 36.4395 90.8799C36.0617 88.6795 34.6982 86.0779 32.748 83.6768C30.808 81.2881 28.4586 79.3092 26.3574 78.2578C24.795 77.4759 23.5904 76.1415 23.1543 74.1885C22.6807 72.0672 23.3378 70.2389 24.5576 68.8203C26.0409 67.0955 27.293 64.3881 27.9785 61.4336C28.6654 58.4729 28.7176 55.5458 28.082 53.4102C27.5332 51.5657 27.6689 49.5563 29.0537 47.7813C30.2022 46.3091 31.7401 45.6128 33.3857 45.5254C35.7759 45.3985 38.7894 44.5659 41.6279 43.2246C44.4797 41.877 46.9301 40.1221 48.3438 38.3184C49.4258 36.9378 50.9813 36 53 36Z",
    indicatorRadius: 23,
    bakedAngle: 0,
  },
  large: {
    body:
      "M68.8335 91.4814C67.1189 92.5468 65.3026 92.5712 63.655 91.9697C61.5023 91.1837 58.4947 90.9864 55.3613 91.3469C52.2424 91.7057 49.2432 92.589 47.1462 93.7427C45.7023 94.5371 44.0285 94.7572 42.2761 94.113C40.163 93.3362 38.9872 91.7011 38.4799 89.8448C37.8926 87.6954 36.3033 85.2367 34.1573 83.0845C32.0158 80.9367 29.5233 79.298 27.3531 78.6158C25.5683 78.0548 24.0453 76.8486 23.3279 74.7969C22.6676 72.9078 22.9865 71.1386 23.9009 69.6499C25.1307 67.6479 26.0818 64.7271 26.4689 61.6743C26.8581 58.6056 26.6432 55.6762 25.8027 53.6079C25.0967 51.8709 25.0386 49.911 26.1951 48.0557C27.1871 46.4643 28.6598 45.6245 30.2933 45.3792C32.6332 45.0279 35.5019 43.8524 38.1974 42.1775C40.8929 40.5026 43.2172 38.4513 44.5686 36.509C45.512 35.153 46.9171 34.2046 48.7833 34.02C50.9589 33.8048 52.6904 34.7249 53.935 36.1271C55.4172 37.7968 57.9484 39.2869 60.8721 40.2971C63.7807 41.302 66.8206 41.7429 69.1602 41.527C70.9 41.3664 72.6274 41.8641 74.0286 43.2928C75.5504 44.8446 75.9573 46.7444 75.6699 48.5931C75.3203 50.8409 75.6857 53.8014 76.6628 56.6727C77.642 59.5499 79.1425 62.0637 80.8095 63.5423C82.2492 64.8192 83.1944 66.5976 82.955 68.8362C82.7565 70.6927 81.8178 72.0958 80.4661 73.0386C78.5029 74.4078 76.3827 76.7056 74.6797 79.3429C72.9687 81.9927 71.8135 84.7765 71.5648 87.0547C71.3744 88.7984 70.5481 90.4159 68.8335 91.4814Z",
    indicatorRadius: 24.855,
    bakedAngle: 149.361,
  },
} as const satisfies Record<string, KnobArtwork>

export type KnobSize = keyof typeof knobSizes

export const INDICATOR_RADIUS = 2
